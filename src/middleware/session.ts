import { expressSession } from "next-session/dist/compat";
import { default as sessionMiddleware } from "next-session/dist/connect";
import { applySession as createApplySession } from "next-session/dist/core";
import connectRedis from "connect-redis";
import Redis from "ioredis";
import { ServerResponse } from "http";
import { URL } from "url";
import { ExtendedIncomingMessage } from "../types/common";

const RedisStore = connectRedis(expressSession);

const redis = new Redis(process.env.REDIS_URL, {
  dropBufferSupport: true,
});

const config = {
  name: "sid",
  store: new RedisStore({ client: redis }),
  cookie: {
    domain: new URL(process.env.APP_URI as string).hostname,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 365 * 24 * 60 * 60,
    path: "/",
    sameSite: "lax" as const,
  },
};

export const session = sessionMiddleware(config);
export const applySession = (
  req: ExtendedIncomingMessage,
  res: ServerResponse
) => createApplySession(req, res, config);
