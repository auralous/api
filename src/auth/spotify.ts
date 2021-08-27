import nc from "next-connect";
import un from "undecim";
import { URLSearchParams } from "url";
import { rethrowSpotifyError } from "../error/spotify.js";
import { PlatformName } from "../graphql/graphql.gen.js";
import { authCallback, authInit } from "./auth.js";

/**
 * Auth Service
 */
export interface SpotifyTokenResponse {
  access_token: string;
  token_type: "Bearer";
  scope: string;
  expires_in: number;
  refresh_token: string;
}

export class SpotifyAuth {
  static client = un.create({ prefixURL: "https://api.spotify.com" });

  static tokenEndpoint = "https://accounts.spotify.com/api/token";

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
        () => true,
        () => false
      );
  }

  static async getTokens(authCode: string) {
    return un
      .post(SpotifyAuth.tokenEndpoint, {
        data: new URLSearchParams({
          grant_type: "authorization_code",
          code: authCode,
          redirect_uri: SpotifyAuth.apiAuthCallback,
        }),
        headers: {
          Authorization: SpotifyAuth.ClientAuthorizationHeader,
        },
      })
      .json<SpotifyTokenResponse>()
      .catch(rethrowSpotifyError);
  }

  static getUser(
    accessToken: string
  ): Promise<SpotifyApi.CurrentUsersProfileResponse> {
    return SpotifyAuth.client
      .get("/v1/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      .json<SpotifyApi.CurrentUsersProfileResponse>()
      .catch(rethrowSpotifyError);
  }

  static async getOrRefreshTokens(
    accessToken: string,
    refreshToken: string | undefined
  ): Promise<{ accessToken: string; refreshToken: string | undefined } | null> {
    if (await SpotifyAuth.checkToken(accessToken))
      return { accessToken, refreshToken };
    return refreshToken ? this.refreshAccessToken(refreshToken) : null;
  }

  private static async refreshAccessToken(
    refreshToken: string
  ): Promise<{ accessToken: string; refreshToken: string } | null> {
    const data = await un
      .post(SpotifyAuth.tokenEndpoint, {
        data: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
        headers: {
          Authorization: SpotifyAuth.ClientAuthorizationHeader,
        },
      })
      .json<SpotifyTokenResponse>()
      .catch(() => null);

    if (!data) {
      // Refresh token might have been expired
      return null;
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
    };
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
  "streaming",
  "app-remote-control",
  "user-read-playback-state",
  "user-read-currently-playing",
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
    if (!req.query.code) {
      return res.end("'code' is not provided in query params");
    }
    const jsonToken = await SpotifyAuth.getTokens(req.query.code);
    const json = await SpotifyAuth.getUser(jsonToken.access_token);
    return authCallback(
      req,
      res,
      {
        oauthId: json.id,
        provider: PlatformName.Spotify,
      },
      {
        email: json.email,
        profilePicture: json.images?.[0]?.url,
      },
      {
        accessToken: jsonToken.access_token,
        refreshToken: jsonToken.refresh_token,
      }
    );
  });
