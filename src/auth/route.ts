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
            (req.user as any).isNew ? "?isNew=1" : ""
          }`
        );
      else redirect(`${process.env.APP_URI}/auth/callback?error=unknown`);
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
// createRoute(appAuth, "facebook", { scope: ["email"] });
// createRoute(appAuth, "twitter");

appAuth.post("/logout", async (req, res) => {
  // req.logout();
  // req.logout is unreliable https://github.com/jaredhanson/passport-facebook/issues/202#issuecomment-297737486
  req.user = null;
  await req.session.destroy();
  res.writeHead(204).end();
});

appAuth.get("/mAuth", async (req, res) => {
  if (req.user) {
    const services = buildServices(
      { user: req.user || null, db, redis, pubsub },
      { cache: false }
    );
    if (req.user) {
      let prov: IPlatformName | undefined;
      if (req.user.oauth.youtube) prov = IPlatformName.Youtube;
      else if (req.user.oauth.spotify) prov = IPlatformName.Spotify;
      if (prov) {
        const accessToken = await services.Service[prov].getAccessToken();
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

export default appAuth;
