import { createServer } from "http";
import pino from "pino";
import type WebSocket from "ws";
import { WebSocketServer } from "ws";
import { getAuthFromRequest } from "../auth/auth.js";
import { graphqlWS } from "../graphql/handler.js";
import { pinoOpts } from "../logger/options.js";
import { NowPlayingWorker } from "../services/nowPlayingWorker.js";
import { ENV } from "../utils/constant.js";
import app from "./app.js";

const serverLogger = pino({
  ...pinoOpts,
  name: "server/server",
});

const port = parseInt(ENV.PORT, 10);
const server = createServer(app);

interface ExtWebSocket extends WebSocket {
  isAlive: boolean;
}

const wss: WebSocket.Server = new WebSocketServer({
  server,
  path: "/graphql-ws",
});

wss.on("connection", async (socket, req) => {
  graphqlWS(socket, {
    auth: getAuthFromRequest(req),
  });
});

// ping-pong
wss.on("connection", (socket: ExtWebSocket) => {
  socket.isAlive = true;
  socket.on("pong", () => (socket.isAlive = true));
});

const wssPingPong = setInterval(() => {
  for (const socket of wss.clients as Set<ExtWebSocket>) {
    if (socket.isAlive === false) return socket.terminate();
    socket.isAlive = false;
    socket.ping();
  }
}, 30000);

wss.on("close", () => clearInterval(wssPingPong));

export async function startServer() {
  await NowPlayingWorker.startWorker();
  server.listen(port, () => {
    serverLogger.info(`Server Ready at ${ENV.API_URI}`);
  });
}
