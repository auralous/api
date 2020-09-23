import nc, { NextConnect } from "next-connect";
import { ServerResponse } from "http";
import passport from "./passport";
import { ExtendedIncomingMessage } from "../types/common";

function createRoute(
  app: NextConnect<ExtendedIncomingMessage, ServerResponse>,
  provider: string,
  authOpts = {},
  isAuthorize = false
) {
  // http://www.passportjs.org/docs/authorize/
  app.get(
    `/${provider}`,
    passport[isAuthorize ? "authorize" : "authenticate"](provider, authOpts)
  );
  app.get<ExtendedIncomingMessage>(
    `/${provider}/callback`,
    passport[isAuthorize ? "authorize" : "authenticate"](provider, {
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

export default appAuth;
