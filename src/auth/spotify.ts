import nc from "next-connect";
import type { UserDbObject } from "../data/types.js";
import { PlatformName } from "../graphql/graphql.gen.js";
import type { UserService } from "../services/user.js";
import juichi, { createClient } from "../utils/juichi.js";
import { authCallback, authInit } from "./auth.js";

/**
 * Auth Service
 */
export class SpotifyAuth {
  static client = createClient("https://api.spotify.com");

  static ClientAuthorizationHeader =
    "Basic " +
    Buffer.from(
      `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
    ).toString("base64");

  static apiAuthCallback = `${process.env.API_URI}/auth/spotify/callback`;

  static async checkToken(accessToken?: string): Promise<boolean> {
    if (!accessToken) return false;
    // Use a private API (but it's quick) to fetch token validity
    return SpotifyAuth.client
      .get("/v1/melody/v1/check_scope?scope=web-playback", {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      .then(
        (res) => res.status === 200,
        () => false
      );
  }

  static async getTokens(authCode: string) {
    return juichi
      .post<{
        access_token: string;
        expires_in: number;
        refresh_token: string;
      }>(
        `https://accounts.spotify.com/api/token`,
        `grant_type=authorization_code&code=${authCode}&redirect_uri=${encodeURIComponent(
          SpotifyAuth.apiAuthCallback
        )}`,
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: SpotifyAuth.ClientAuthorizationHeader,
          },
        }
      )
      .then((res) => res.data);
  }

  static getUser(
    accessToken: string
  ): Promise<SpotifyApi.CurrentUsersProfileResponse> {
    return SpotifyAuth.client
      .get<
        SpotifyApi.CurrentUsersProfileResponse | { error: { message: string } }
      >("/v1/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      .then(({ data }) =>
        "error" in data ? Promise.reject(new Error(data.error.message)) : data
      );
  }

  async getAccessToken(
    me: UserDbObject,
    userService: UserService
  ): Promise<string | null> {
    if (me.oauth.provider !== PlatformName.Spotify) return null;
    if (await SpotifyAuth.checkToken(me.oauth.accessToken || undefined))
      return me.oauth.accessToken as string;
    return this.refreshAccessToken(me, userService);
  }

  private async refreshAccessToken(
    me: UserDbObject,
    userService: UserService
  ): Promise<string | null> {
    const res = await juichi.post<any>(
      "https://accounts.spotify.com/api/token",
      `grant_type=refresh_token&refresh_token=${me.oauth.refreshToken}`,
      {
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          Authorization: SpotifyAuth.ClientAuthorizationHeader,
        },
      }
    );
    if (res.status !== 200)
      // Refresh token might have been expired
      return null;
    // Update tokens
    await userService.updateMeOauth(me, {
      refreshToken: res.data.refresh_token,
      accessToken: res.data.access_token,
      expiredAt: new Date(Date.now() + res.data.expires_in * 1000),
    });
    return res.data.access_token;
  }
}

/**
 * Router handler
 */
const scopesStr = [
  "user-read-email",
  "user-read-private",
  "playlist-read-private",
  "playlist-modify-public",
  "playlist-modify-private",
  "user-read-currently-playing",
  "streaming",
].join(" ");

const authUrl =
  `https://accounts.spotify.com/authorize?` +
  `response_type=code` +
  `&client_id=${process.env.SPOTIFY_CLIENT_ID}` +
  `&scope=${encodeURIComponent(scopesStr)}` +
  `&redirect_uri=${encodeURIComponent(SpotifyAuth.apiAuthCallback)}`;

export const handler = nc()
  .get("/", (req, res) => authInit(req, res, authUrl))
  .get("/callback", async (req, res) => {
    if (!req.query.code) throw new Error("Denied");
    const jsonToken = await SpotifyAuth.getTokens(req.query.code);
    const json = await SpotifyAuth.getUser(jsonToken.access_token);

    return authCallback(
      req,
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
