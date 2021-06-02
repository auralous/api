import { google } from "googleapis";
import nc from "next-connect";
import { PlatformName } from "../graphql/graphql.gen.js";
import { authCallback, authInit } from "./auth.js";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_KEY,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.API_URI}/auth/google/callback`
);

export const handler = nc()
  .get("/", (req, res) => {
    const url = oauth2Client.generateAuthUrl({
      // 'online' (default) or 'offline' (gets refresh_token)
      access_type: "offline",

      // If you only need one scope you can pass it as a string
      scope: [
        "profile",
        "email",
        "https://www.googleapis.com/auth/youtube.readonly",
        "https://www.googleapis.com/auth/youtubepartner",
      ],
    });
    authInit(req, res, url);
  })
  .get("/callback", async (req, res) => {
    if (!req.query.code) throw new Error("Denied");
    const { tokens } = await oauth2Client.getToken(req.query.code);

    const gUser = JSON.parse(
      Buffer.from(tokens.id_token?.split(".")[1] as string, "base64").toString()
    );

    await authCallback(
      req,
      res,
      {
        id: gUser.sub,
        provider: PlatformName.Youtube,
        accessToken: tokens.access_token as string,
        refreshToken: tokens.refresh_token,
        expiredAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      },
      {
        email: gUser.email || undefined,
        profilePicture: gUser.picture || undefined,
      }
    );
  });
