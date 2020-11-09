import * as Sentry from "@sentry/node";
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  beforeSend: (event, hint) => {
    console.error(hint?.originalException || hint?.syntheticException);
    return event;
  },
});
import nc from "next-connect";
import { createServer } from "http";
import * as WebSocket from "ws";
import { parse as parseQS } from "querystring";
import cors from "cors";
// @ts-ignore
import { graphqlUploadExpress } from "graphql-upload";
import { createPassport, createAppAuth } from "./auth/index";
import { buildGraphQLServer } from "./gql";
import { session } from "./middleware/session";
import { createMongoClient, createRedisClient } from "./db/index";
import { NowPlayingWorker } from "./services/nowPlayingWorker";
import { PubSub } from "./lib/pubsub";

import type { RequestListener } from "http";
import type { ExtendedIncomingMessage } from "./types/index";

(async () => {
  const redis = createRedisClient();
  const pubsub = new PubSub();
  const { client: mongoClient, db } = await createMongoClient();
  const passport = createPassport(db, redis, pubsub);

  const { httpHandle, wsHandle } = buildGraphQLServer(db, redis, pubsub);

  // app
  const app = nc<ExtendedIncomingMessage>();

  app.use("/health", (req, res) => {
    const mongoOk = mongoClient.isConnected();
    const redisStatus = redis.status;
    res
      .writeHead(mongoOk && redisStatus === "ready" ? 200 : 500, undefined, {
        "content-type": "application/json",
      })
      .end(
        JSON.stringify({
          mongo: mongoOk,
          redis: redisStatus,
        })
      );
  });

  // compat parse url, passport not work properly without this
  app.use((req, res, next) => {
    const idx = req.url.indexOf("?");
    req.query =
      idx !== -1
        ? (parseQS(req.url.substring(idx + 1)) as Record<string, string>)
        : null;
    req.path = idx !== -1 ? req.url.substring(0, idx) : req.url;
    next();
  });

  // cors for dev
  if (process.env.NODE_ENV !== "production")
    app.use(
      cors({
        origin: process.env.APP_URI,
        methods: ["GET", "POST", "DELETE"],
        credentials: true,
      })
    );

  app.use(session);

  // passport
  app.use(passport.initialize()).use(passport.session());

  // auth subapp
  app.use("/auth", createAppAuth(passport, db, redis, pubsub));

  app.post(
    "/graphql",
    (req, res, next) => {
      req.is = (type) => Boolean(req.headers["content-type"]?.includes(type));
      next();
    },
    graphqlUploadExpress({
      maxFiles: 2,
      maxFileSize: 20000000, // 20MB
    })
  );

  app.get("/graphql", (req, res, next) => {
    // setCacheControl API
    // default to no-store
    res.setHeader("cache-control", "no-store");
    req.setCacheControl = (maxAge, scope = "PUBLIC") => {
      res.setHeader(
        "cache-control",
        `${scope.toLowerCase()}, max-age=${maxAge}`
      );
    };
    next();
  });

  app.all("/graphql", httpHandle);

  // http
  const port = parseInt(process.env.PORT as string, 10) || 4000;
  const server = createServer((app as unknown) as RequestListener);

  // subscription
  type ExtendedWebSocket = WebSocket & { isAlive: boolean };

  const wss = new WebSocket.Server({
    server,
    path: "/graphql",
  });

  wss.on("connection", wsHandle);

  // ping-pong
  wss.on("connection", (socket: ExtendedWebSocket) => {
    socket.isAlive = true;
    socket.on("pong", () => (socket.isAlive = true));
  });

  const wssPingPong = setInterval(() => {
    for (const socket of wss.clients as Set<ExtendedWebSocket>) {
      if (socket.isAlive === false) return socket.terminate();
      socket.isAlive = false;
      socket.ping();
    }
  }, 30000);

  wss.on("close", () => clearInterval(wssPingPong));

  try {
    console.log("Starting API server...");

    console.log("Connecting to MongoDB database");

    console.log(`MongoDB isConnected is ${mongoClient.isConnected()}`);

    console.log(`Redis status is ${redis.status}`);

    NowPlayingWorker.start(db, redis, pubsub);

    server.listen(port, () => {
      console.log(`Server Ready at ${process.env.API_URI}`);
    });
  } catch (e) {
    console.error(e);
    console.error("Could not start server! Exiting...");
    process.exit(1);
  }
})();
