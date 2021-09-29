import type { IncomingMessage, ServerResponse } from "http";
import { nanoid } from "nanoid";
import pino from "pino";
import { URL } from "url";
import { redis } from "../data/redis.js";
import type { UserDbObject } from "../data/types.js";
import { PlatformName } from "../graphql/graphql.gen.js";
import { pinoOpts } from "../logger/options.js";
import { UserService } from "../services/user.js";
import { REDIS_KEY } from "../utils/constant.js";
import { GoogleAuth } from "./google.js";
import { SpotifyAuth } from "./spotify.js";
import type { AuthState, RedisAuthHash } from "./types.js";

const logger = pino({ ...pinoOpts, name: "auth" });

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
  const user = await UserService.authOrCreate(authState, profile);

  // create token and save to session
  const token = nanoid(32);

  const value: RedisAuthHash = {
    ...authState,
    ...tokens,
    userId: user._id,
  };

  await redis.hmset(REDIS_KEY.auth(token), value);

  const redirectTarget =
    req.query.state === "app_login"
      ? `auralous://sign-in?access_token=${token}`
      : `${process.env.APP_URI}/?access_token=${token}`;

  logger.debug({ user, token }, "User is authenticated");

  res
    .writeHead(307, {
      Location: `${redirectTarget}${
        (user as UserDbObject & { isNew?: boolean }).isNew ? "&isNew=1" : ""
      }`,
    })
    .end();
}

async function getAccessTokenFromRedisAuthState(
  token: string,
  redisAuthValue: RedisAuthHash
) {
  const Auth =
    redisAuthValue.provider === PlatformName.Spotify ? SpotifyAuth : GoogleAuth;
  const result = await Auth.getOrRefreshTokens(
    redisAuthValue.accessToken,
    redisAuthValue.refreshToken
  );
  if (!result) return null;
  if (
    result.accessToken !== redisAuthValue.accessToken ||
    result.refreshToken !== redisAuthValue.refreshToken
  ) {
    await redis.hmset(REDIS_KEY.auth(token), {
      accessToken: result.accessToken,
      ...(result.refreshToken && { refreshToken: result.refreshToken }),
    } as Pick<RedisAuthHash, "accessToken" | "refreshToken">);
  }
  return result.accessToken;
}

export async function getAuthFromRequest(
  req: IncomingMessage
): Promise<null | AuthState> {
  const token = req.headers.authorization;
  if (!token) return null;

  const redisAuthState = (await redis.hgetall(
    REDIS_KEY.auth(token)
  )) as RedisAuthHash;

  if (Object.keys(redisAuthState).length === 0) return null;

  let cachedAccessTokenPromise: Promise<string | null> | undefined;

  return {
    ...redisAuthState,
    token,
    get accessTokenPromise() {
      if (!token) return null;
      return (
        cachedAccessTokenPromise ||
        (cachedAccessTokenPromise = getAccessTokenFromRedisAuthState(
          token,
          redisAuthState
        ))
      );
    },
  } as AuthState;
}

export async function invalidateToken(token: string) {
  return redis.del(REDIS_KEY.auth(token));
}
