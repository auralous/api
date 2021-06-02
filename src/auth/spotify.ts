import nc from "next-connect";
import { PlatformName } from "../graphql/graphql.gen.js";
import { SpotifyAuthService } from "../services/music/index.js";
import { authCallback, authInit } from "./auth.js";

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
  `&redirect_uri=${encodeURIComponent(SpotifyAuthService.apiAuthCallback)}`;

export const handler = nc()
  .get("/", (req, res) => authInit(req, res, authUrl))
  .get("/callback", async (req, res) => {
    if (!req.query.code) throw new Error("Denied");

    const jsonToken = await SpotifyAuthService.getTokens(req.query.code);
    const json = await SpotifyAuthService.getUser(jsonToken.access_token);

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
