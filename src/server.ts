import { makeAPQHandler } from "@benzene/extra";
import { parseGraphQLBody } from "@benzene/http";
import * as Sentry from "@sentry/node";
import cors from "cors";
// @ts-ignore
import type { RequestListener } from "http";
import { createServer } from "http";
import nc from "next-connect";
import * as WebSocket from "ws";
import { createAuthApp, getUserFromRequest, initAuth } from "./auth/index";
import { createMongoClient, createRedisClient } from "./db/index";
import { buildGraphQLServer } from "./gql";
import { parseQuery, rawBody } from "./lib/http";
import { PubSub } from "./lib/pubsub";
import { NowPlayingWorker } from "./services/nowPlayingWorker";
import type { ExtendedIncomingMessage, ExtendedWebSocket } from "./types/index";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  beforeSend: (event, hint) => {
    console.error(hint?.originalException || hint?.syntheticException);
    return event;
  },
});

(async () => {
  const redis = createRedisClient();
  const pubsub = new PubSub();

  console.log("Starting API server...");

  console.log("Connecting to MongoDB database");

  const { client: mongoClient, db } = await createMongoClient();

  console.log(`MongoDB isConnected is ${mongoClient.isConnected()}`);

  console.log(`Redis status is ${redis.status}`);

  await initAuth();

  const {
    graphqlHTTP,
    graphqlWS,
    stringify: graphqlStringify,
    GQL,
  } = buildGraphQLServer(db, redis, pubsub);

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

  // cors for dev
  if (process.env.NODE_ENV !== "production")
    app.use(
      cors({
        origin: process.env.APP_URI,
        methods: ["GET", "POST", "DELETE"],
        credentials: true,
      })
    );

  app.use((req, res, next) => {
    req.query = parseQuery(req);
    next();
  });

  // auth subapp
  app.use("/auth", createAuthApp(db, redis, pubsub));

  app.post("/graphql", rawBody);

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

  const apqHTTP = makeAPQHandler();

  app.all("/graphql", async (req, res) => {
    const body =
      parseGraphQLBody(req.body, req.headers["content-type"]) || undefined;

    try {
      await apqHTTP(body || req.query);
    } catch (err) {
      // It may throw `HTTPError` object from `@benzene/extra`
      // It may be `PersistedQueryNotFound`, which asks the client
      // to send back a pair of query and hash to persist
      const result = GQL.formatExecutionResult({
        errors: [err],
      });
      return res
        .writeHead(err.status, { "content-type": "application/json" })
        .end(JSON.stringify(result));
    }

    graphqlHTTP(
      {
        headers: req.headers as Record<string, string>,
        method: req.method,
        body,
        query: req.query,
      },
      {
        user: getUserFromRequest(req, db, res),
        setCacheControl: req.setCacheControl,
      }
    ).then((result) =>
      res
        .writeHead(result.status, result.headers)
        .end(graphqlStringify(result.payload))
    );
  });

  // http
  const port = parseInt(process.env.PORT as string, 10) || 4000;
  const server = createServer((app as unknown) as RequestListener);

  // subscription
  const wss = new WebSocket.Server({
    server,
    path: "/graphql",
  });

  wss.on("connection", async (socket, req: ExtendedIncomingMessage) => {
    graphqlWS(socket, {
      user: getUserFromRequest(req, db),
    });
  });

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

  NowPlayingWorker.start(db, redis, pubsub);

  server.listen(port, () => {
    console.log(`Server Ready at ${process.env.API_URI}`);
  });
})().catch((e) => {
  console.error(e);
  console.error("Could not start server! Exiting...");
  process.exit(1);
});
