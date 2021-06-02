import { Auth, google } from "googleapis";
import nc from "next-connect";
import { UserDbObject } from "../data/types.js";
import { PlatformName } from "../graphql/graphql.gen.js";
import type { UserService } from "../services/user.js";
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

export class GoogleAuth {
  private oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_KEY,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.API_URI}/auth/google/callback`
  );

  async getAccessToken(
    me: UserDbObject,
    userService: UserService
  ): Promise<string | null> {
    if (me.oauth.provider !== PlatformName.Youtube) return null;

    this.oauth2Client.setCredentials({
      access_token: me.oauth.accessToken,
      refresh_token: me.oauth.refreshToken,
    });

    const refreshHandler = (tokens: Auth.Credentials) => {
      userService.updateMeOauth(me, {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        ...(tokens.expiry_date && {
          expiredAt: new Date(tokens.expiry_date),
        }),
      });
    };

    // We register refresh token handler in case it happens
    this.oauth2Client.on("tokens", refreshHandler);
    return this.oauth2Client
      .getAccessToken()
      .then((resp) => resp.token || null)
      .catch(() => null)
      .finally(() => {
        // We no longer need this, remove to avoid memory leak
        this.oauth2Client.off("tokens", refreshHandler);
      });
  }
}
