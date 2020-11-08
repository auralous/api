import * as Sentry from "@sentry/node";
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  beforeSend: (event, hint) => {
    console.error(hint?.originalException || hint?.syntheticException);
    return event;
  },
});

import { createServer, RequestListener } from "http";
import * as WebSocket from "ws";
import { wsHandle } from "./gql";
import app from "./app";
import { client, connect as connectMongoDB } from "./db/mongo";
import { redis } from "./db/redis";
import { NowPlayingWorker } from "./services/nowPlayingWorker";
import { pubsub } from "./lib/pubsub";

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

const nowPlayingWorker = new NowPlayingWorker(pubsub);

(async () => {
  try {
    console.log("Starting API server...");

    console.log("Connecting to MongoDB database");

    const db = await connectMongoDB();

    console.log(`MongoDB isConnected is ${client.isConnected()}`);

    console.log(`Redis status is ${redis.status}`);

    console.log("Executing NowPlaying jobs...");
    await nowPlayingWorker.init(db, redis);

    server.listen(port, () => {
      console.log(`Server Ready at ${process.env.API_URI}`);
    });
  } catch (e) {
    console.error(e);
    console.error("Could not start server! Exiting...");
    process.exit(1);
  }
})();
