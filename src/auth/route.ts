import nc, { NextConnect } from "next-connect";
import { ServerResponse } from "http";
import passport from "./passport";
import { ExtendedIncomingMessage } from "../types/common";
import { buildServices } from "../services/services";
import { db } from "../db/mongo";
import { redis } from "../db/redis";
import { pubsub } from "../lib/pubsub";
import { IPlatformName } from "../types/resolvers.gen";

function createRoute(
  app: NextConnect<ExtendedIncomingMessage, ServerResponse>,
  provider: string,
  authOpts = {}
) {
  // http://www.passportjs.org/docs/authorize/
  app.get(`/${provider}`, passport.authenticate(provider, authOpts));
  app.get<ExtendedIncomingMessage>(
    `/${provider}/callback`,
    passport.authenticate(provider, {
      failureRedirect: `${process.env.APP_URI}/auth/callback?error=auth_code_fail`,
    }),
    (req, res) => {
      if (req.user)
        (res as any).redirect(
          `${process.env.APP_URI}/auth/callback${
            (req.user as any).isNew ? "?isNew=1" : ""
          }`
        );
      else
        (res as any).redirect(
          `${process.env.APP_URI}/auth/callback?error=unknown`
        );
    }
  );
}

const appAuth = nc<ExtendedIncomingMessage>();

createRoute(appAuth, "google", {
  scope: [
    "profile",
    "email",
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/youtube.force-ssl",
  ],
  prompt: "consent",
  accessType: "offline",
});
createRoute(appAuth, "facebook", { scope: ["email"] });
createRoute(appAuth, "twitter");
createRoute(appAuth, "spotify", {
  scope: [
    "user-read-email",
    "user-read-private",
    "playlist-read-private",
    "playlist-modify-public",
    "playlist-modify-private",
    "user-read-currently-playing",
    "streaming",
  ],
});

appAuth.delete("/", async (req, res) => {
  // req.logout();
  // req.logout is unreliable https://github.com/jaredhanson/passport-facebook/issues/202#issuecomment-297737486
  req.user = null;
  await req.session.destroy();
  res.statusCode = 204;
  res.end();
});

appAuth.get("mAuth", async (req, res) => {
  if (req.user) {
    const services = buildServices(
      { user: req.user || null, db, redis, pubsub },
      { cache: false }
    );
    if (req.user.oauth.youtube) {
      const youtubeToken = await services.Service.youtube.getAccessToken();
      if (youtubeToken) {
        res
          .writeHead(200, undefined, { "content-type": "application/json" })
          .end(
            JSON.stringify({
              platform: IPlatformName.Youtube,
              id: req.user.oauth.youtube.id,
              accessToken: youtubeToken,
            })
          );
        return;
      }
    } else if (req.user.oauth.spotify) {
      const spotifyToken = await services.Service.spotify.getAccessToken();
      if (spotifyToken) {
        res
          .writeHead(200, undefined, { "content-type": "application/json" })
          .end(
            JSON.stringify({
              platform: IPlatformName.Spotify,
              id: req.user.oauth.spotify.id,
              accessToken: spotifyToken,
            })
          );
        return;
      }
    }
  }
  res.writeHead(204).end();
});

export default appAuth;
