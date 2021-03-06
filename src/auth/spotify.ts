import type IORedis from "ioredis";
import type { Db } from "mongodb";
import nc from "next-connect";
import type { PubSub } from "../lib/pubsub";
import { SpotifyAuthService } from "../services/music";
import { ExtendedIncomingMessage, PlatformName } from "../types/index";
import { doAuth } from "./auth";

export function createSpotifyAuthApp(
  db: Db,
  redis: IORedis.Cluster,
  pubsub: PubSub
) {
  return nc<ExtendedIncomingMessage>()
    .get("/", async (req, res) => {
      const scopes = [
        "user-read-email",
        "user-read-private",
        "playlist-read-private",
        "playlist-modify-public",
        "playlist-modify-private",
        "user-read-currently-playing",
        "streaming",
      ].join(" ");

      const url =
        `https://accounts.spotify.com/authorize?` +
        `response_type=code` +
        `&client_id=${process.env.SPOTIFY_CLIENT_ID}` +
        `&scope=${encodeURIComponent(scopes)}` +
        `&redirect_uri=${encodeURIComponent(
          SpotifyAuthService.apiAuthCallback
        )}`;

      res.writeHead(307, { Location: url }).end();
    })
    .get("/callback", async (req, res) => {
      if (!req.query.code) throw new Error("Denied");

      const jsonToken = await SpotifyAuthService.getTokens(req.query.code);
      const json = await SpotifyAuthService.getUser(jsonToken.access_token);

      await doAuth(
        { db, redis, pubsub },
        res,
        {
          id: json.id,
          provider: PlatformName.Spotify,
          accessToken: jsonToken.access_token,
          refreshToken: jsonToken.refresh_token,
          expiredAt: new Date(Date.now() + jsonToken.expires_in * 1000),
        },
        {
          email: json.email,
          profilePicture: json.images?.[0]?.url,
        }
      );
    });
}
