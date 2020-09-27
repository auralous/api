import * as Sentry from "@sentry/node";
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  beforeSend: (event, hint) => {
    console.error(hint?.originalException || hint?.syntheticException);
    return event;
  },
});

import { createServer } from "http";
import * as WebSocket from "ws";
import { wsHandle } from "./gql";
import app from "./app";
import { client, connect as connectMongoDB, db } from "./db/mongo";
import { redis } from "./db/redis";
import { NowPlayingWorker } from "./models/nowPlayingWorker";
import { nowPlayingEE } from "./lib/emitter";

// http
const port = parseInt(process.env.PORT!, 10) || 4000;
const server = createServer(app as any);

// subscription
const wss = new WebSocket.Server({
  server,
  path: "/graphql",
});

wss.on("connection", wsHandle);

// ping-pong
wss.on("connection", (socket) => {
  (socket as any).isAlive = true;
  socket.on("pong", () => ((socket as any).isAlive = true));
});

const wssPingPong = setInterval(() => {
  wss.clients.forEach((ws) => {
    // Require pong message every 30s or assume dead and terminate
    if ((ws as any).isAlive === false) return ws.terminate();
    (ws as any).isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on("close", () => clearInterval(wssPingPong));

let nowPlayingWorker: NowPlayingWorker;

nowPlayingEE.on("now-playing-resolve", (id) => {
  nowPlayingWorker.addJob(id, 0);
});

(async () => {
  try {
    console.log("Starting API server...");

    console.log("Connecting to MongoDB database");
    await connectMongoDB();
    console.log(`MongoDB isConnected is ${client.isConnected()}`);

    console.log(`Redis status is ${redis.status}`);

    nowPlayingWorker = new NowPlayingWorker({ db });

    console.log("Executing NowPlaying jobs...");
    await nowPlayingWorker.initJobs();

    server.listen(port, () => {
      console.log(`Server Ready at ${process.env.API_URI}`);
    });
  } catch (e) {
    console.error(e);
    console.error("Could not start server! Exiting...");
    process.exit(1);
  }
})();
