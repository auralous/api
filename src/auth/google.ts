import { Auth, google } from "googleapis";
import nc from "next-connect";
import { PlatformName } from "../graphql/graphql.gen.js";
import { authCallback, authInit } from "./auth.js";

/** Auth Service */
export class GoogleAuth {
  static async getOrRefreshTokens(
    accessToken: string,
    refreshToken: string | undefined
  ): Promise<{ accessToken: string; refreshToken: string | undefined } | null> {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_KEY,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.API_URI}/auth/google/callback`
    );

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    const refreshHandler = (tokens: Auth.Credentials) => {
      (accessToken = tokens.access_token || accessToken),
        (refreshToken = tokens.refresh_token || refreshToken);
    };

    // We register refresh token handler in case it happens
    oauth2Client.on("tokens", refreshHandler);

    return oauth2Client
      .getAccessToken()
      .then((resp) =>
        resp.token
          ? {
              accessToken: resp.token,
              refreshToken,
            }
          : null
      )
      .catch(() => null);
  }
}

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_KEY,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.API_URI}/auth/google/callback`
);

/** router handler */
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
    if (!req.query.code) {
      return res.end("'code' is not provided in query params");
    }

    const { tokens } = await oauth2Client.getToken(req.query.code);

    const gUser = JSON.parse(
      Buffer.from(tokens.id_token?.split(".")[1] as string, "base64").toString()
    );

    await authCallback(
      req,
      res,
      {
        oauthId: gUser.sub,
        provider: PlatformName.Youtube,
      },
      {
        email: gUser.email || undefined,
        profilePicture: gUser.picture || undefined,
      },
      { accessToken: tokens.access_token!, refreshToken: tokens.refresh_token! }
    );
  });
