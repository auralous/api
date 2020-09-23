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
import { connect as connectMongoDB, db } from "./db/mongo";
import { NowPlayingWorker } from "./models/nowPlayingWorker";
import { nowPlayingEE } from "./lib/emitter";

// http
const port = parseInt(process.env.PORT!, 10) || 4000;
const server = createServer(app as any);

// subscription
const wss = new WebSocket.Server({
  server,
  path: "/websocket",
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
(async () => {
  await connectMongoDB();

  const nowPlayingWorker = new NowPlayingWorker({ db });

  nowPlayingEE.on("now-playing-resolve", (id) => {
    nowPlayingWorker.addJob(id, 0);
  });

  nowPlayingWorker.initJobs();

  server.listen(port, () => {
    console.log(`API Ready at ${process.env.API_URI}`);
  });
})();
