import nc from "next-connect";
import Services from "../services";
import { IPlatformName } from "../types/index";

import type { Db } from "mongodb";
import type IORedis from "ioredis";
import type Passport from "passport";
import type { PubSub } from "../lib/pubsub";
import type { ExtendedIncomingMessage } from "../types/index";

export default function createAppAuth(
  passport: Passport.Authenticator,
  db: Db,
  redis: IORedis.Cluster,
  pubsub: PubSub
) {
  const app = nc<ExtendedIncomingMessage>();

  function createRoute(provider: string, authOpts = {}) {
    app.get(`/${provider}`, passport.authenticate(provider, authOpts));
    app.get(
      `/${provider}/callback`,
      passport.authenticate(provider),
      (req, res) => {
        const redirect = (location: string) =>
          res.writeHead(302, { Location: location }).end();
        if (req.user)
          redirect(
            `${process.env.APP_URI}/auth/callback${
              // @ts-expect-error: isNew is a special field to check if user is newly registered
              req.user.isNew ? "?isNew=1" : ""
            }`
          );
        else redirect(`${process.env.APP_URI}/auth/callback?error=unknown`);
      }
    );
  }

  app.post("/logout", async (req, res) => {
    // req.logout();
    // req.logout is unreliable https://github.com/jaredhanson/passport-facebook/issues/202#issuecomment-297737486
    req.user = null;
    await req.session.destroy();
    res.writeHead(204).end();
  });

  app.get("/mAuth", async (req, res) => {
    if (req.user) {
      const services = new Services({
        user: req.user || null,
        db,
        redis,
        pubsub,
      });
      if (req.user) {
        let prov: IPlatformName | undefined;
        if (req.user.oauth.youtube) prov = IPlatformName.Youtube;
        else if (req.user.oauth.spotify) prov = IPlatformName.Spotify;
        if (prov) {
          const accessToken = await services.Track[prov].getAccessToken();
          if (accessToken)
            return res
              .writeHead(200, undefined, { "content-type": "application/json" })
              .end(
                JSON.stringify({
                  platform: prov,
                  id: req.user.oauth[prov]?.id,
                  accessToken,
                  expiredAt: req.user.oauth[prov]?.expiredAt,
                })
              );
        }
      }
      return res.writeHead(204).end();
    }
  });

  createRoute("google", {
    scope: [
      "profile",
      "email",
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/youtube.force-ssl",
    ],
    prompt: "consent",
    accessType: "offline",
  });
  createRoute("spotify", {
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
  // createRoute("facebook", { scope: ["email"] });
  // createRoute("twitter");

  return app;
}
