import nc from "next-connect";
import type Passport from "passport";
import type { ExtendedIncomingMessage } from "../types/index";

export function createApp(passport: Passport.Authenticator) {
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

  createRoute("google", {
    scope: [
      "profile",
      "email",
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/youtubepartner",
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

  return app;
}
