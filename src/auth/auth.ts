import type { IncomingMessage, ServerResponse } from "http";
import { nanoid } from "nanoid";
import { URL } from "url";
import { redis } from "../data/redis.js";
import type { UserDbObject } from "../data/types.js";
import { PlatformName } from "../graphql/graphql.gen.js";
import { UserService } from "../services/user.js";
import { REDIS_KEY } from "../utils/constant.js";
import { GoogleAuth } from "./google.js";
import { SpotifyAuth } from "./spotify.js";
import { AuthState } from "./types.js";

/**
 * Create an auth initialization handler
 * that set neccessary cookie and redirect to oauth2.0
 */
export function authInit(
  req: IncomingMessage,
  res: ServerResponse,
  url: string
) {
  if (req.query["is_app_login"]) {
    // modify url to pass in state
    const urlObj = new URL(url);
    urlObj.searchParams.set(`state`, `app_login`);
    url = urlObj.toString();
  }
  res.writeHead(307, { Location: url }).end();
}

/**
 * Handle callbacks coming from oauth2.0 redirection
 */
export async function authCallback(
  req: IncomingMessage,
  res: ServerResponse,
  authState: Pick<AuthState, "oauthId" | "provider">,
  profile: Pick<UserDbObject, "profilePicture" | "email">,
  tokens: { accessToken: string; refreshToken: string }
) {
  const user = await new UserService({ loaders: {} }).authOrCreate(
    authState,
    profile
  );

  // create token and save to session
  const token = nanoid(32);

  await redis.hmset(REDIS_KEY.auth(token), {
    ...authState,
    ...tokens,
    userId: user._id,
  });

  const redirectTarget =
    req.query.state === "app_login"
      ? `auralous://sign-in?access_token=${token}`
      : `${process.env.APP_URI}/auth/callback?success=1`;

  res
    .writeHead(307, {
      Location: `${redirectTarget}${
        (user as UserDbObject & { isNew?: boolean }).isNew ? "&isNew=1" : ""
      }`,
    })
    .end();
}

export async function getAuthFromRequest(
  req: IncomingMessage
): Promise<null | AuthState> {
  const token = req.headers.authorization;
  if (!token) return null;

  const redisAuthState = await redis.hgetall(REDIS_KEY.auth(token));

  if (Object.keys(redisAuthState).length === 0) return null;

  let cachedAccessTokenPromise: Promise<string | null> | undefined;

  async function getAccessToken() {
    const Auth = PlatformName.Spotify ? SpotifyAuth : GoogleAuth;
    const result = await Auth.getOrRefreshTokens(
      redisAuthState.accessToken,
      redisAuthState.refreshToken
    );
    if (!result) return null;
    if (
      result.accessToken !== redisAuthState.accessToken ||
      result.refreshToken !== redisAuthState.refreshToken
    ) {
      await redis.hmset(REDIS_KEY.auth(token!), {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });
    }
    return result.accessToken;
  }

  return {
    ...redisAuthState,
    token,
    get accessTokenPromise() {
      return (
        cachedAccessTokenPromise ||
        (cachedAccessTokenPromise = getAccessToken())
      );
    },
  } as AuthState;
}

export async function invalidateToken(token: string) {
  return redis.del(REDIS_KEY.auth(token));
}
