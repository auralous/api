import type IORedis from "ioredis";
import type { Db } from "mongodb";
import nc from "next-connect";
import type { PubSub } from "../lib/pubsub";
import { ExtendedIncomingMessage } from "../types/index";
import { createGoogleAuthApp } from "./google";
import { createSpotifyAuthApp } from "./spotify";

export function createAuthApp(db: Db, redis: IORedis.Cluster, pubsub: PubSub) {
  return nc<ExtendedIncomingMessage>({
    onError(err, req, res) {
      res
        .writeHead(307, {
          Location: `${process.env.APP_URI}/auth/callback?error=unknown`,
        })
        .end();
    },
  })
    .post("/logout", (req, res) => {
      req.session.destroy();
      res.writeHead(204).end();
    })
    .use("/spotify", createSpotifyAuthApp(db, redis, pubsub))
    .use("/google", createGoogleAuthApp(db, redis, pubsub));
}
