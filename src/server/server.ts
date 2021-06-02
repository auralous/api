import { parse as parseCookie } from "cookie";
import { createServer } from "http";
import WebSocket from "ws";
import { getUserFromRequest } from "../auth/auth.js";
import { graphqlWS } from "../graphql/handler.js";
import { NowPlayingWorker } from "../services/nowPlayingWorker.js";
import app from "./app.js";

const port = parseInt(process.env.PORT as string, 10) || 4000;
const server = createServer(app);

interface ExtWebSocket extends WebSocket {
  isAlive: boolean;
}

const wss = new WebSocket.Server({
  server,
  path: "/graphql",
});

wss.on("connection", async (socket, req) => {
  req.cookies = parseCookie(req.headers.cookie || "");
  graphqlWS(socket, {
    user: getUserFromRequest(req),
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
  await NowPlayingWorker.start();
  server.listen(port, () => {
    console.log(`Server Ready at ${process.env.API_URI}`);
  });
}
