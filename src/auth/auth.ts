import type { ServerResponse } from "http";
import type IORedis from "ioredis";
import parseJwk from "jose/jwk/parse";
import SignJWT from "jose/jwt/sign";
import jwtVerify from "jose/jwt/verify";
import type { KeyLike } from "jose/types";
import type { Db } from "mongodb";
import { URL } from "url";
import type { PubSub } from "../lib/pubsub";
import { UserService } from "../services/user";
import type { ExtendedIncomingMessage, UserDbObject } from "../types";
import { setCookie } from "./cookie";

const authCookieName = "sid";
const isAppLoginCookieName = "is-app-login";

function setTokenToCookie(res: ServerResponse, token: string | null) {
  setCookie(res, authCookieName, token, {
    domain: new URL(process.env.APP_URI as string).hostname,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 365 * 24 * 60 * 60,
    path: "/",
    sameSite: "lax" as const,
  });
}

export function logoutHandler(
  req: ExtendedIncomingMessage,
  res: ServerResponse
) {
  setTokenToCookie(res, null);
  res.writeHead(204).end();
}

export function createAuthHandler(context: {
  db: Db;
  redis: IORedis.Cluster;
  pubsub: PubSub;
}) {
  const userService = new UserService(context);
  return {
    async authHandler(
      req: ExtendedIncomingMessage,
      res: ServerResponse,
      url: string
    ) {
      setCookie(
        res,
        isAppLoginCookieName,
        req.query["is_app_login"] === "1" ? "1" : null
      );
      if (req.query["is_app_login"]) {
        // modify url to pass in state
        const urlObj = new URL(url);
        urlObj.searchParams.set(`state`, `app_login`);
        url = urlObj.toString();
      }
      res.writeHead(307, { Location: url }).end();
    },
    async callbackHandler(
      req: ExtendedIncomingMessage,
      res: ServerResponse,
      oauth: UserDbObject["oauth"],
      profile: Pick<UserDbObject, "profilePicture" | "email">
    ) {
      const user = await userService.authOrCreate(oauth, profile);

      const token = await encodeUserIdToToken(user._id);

      const redirectTarget =
        req.query.state === "app_login"
          ? `auralous://sign-in?access_token=${token}`
          : `${process.env.APP_URI}/auth/callback?success=1`;

      setTokenToCookie(res, token);

      res
        .writeHead(307, {
          Location: `${redirectTarget}${
            (user as UserDbObject & { isNew?: boolean }).isNew ? "&isNew=1" : ""
          }`,
        })
        .end();
    },
  };
}

const issuer = "auralous:api";

let privateKey: KeyLike;
let publicKey: KeyLike;

export async function initAuth() {
  privateKey = await parseJwk(JSON.parse(process.env.JWK_PRIVATE as string));
  publicKey = await parseJwk(JSON.parse(process.env.JWK_PUBLIC as string));
}

export function getUserFromRequest(
  req: ExtendedIncomingMessage,
  db: Db,
  res?: ServerResponse
) {
  const token = req.headers.authorization || req.cookies[authCookieName];
  if (!token) return null;
  return decodeFromToken(token).then(async (payload) => {
    if (!payload) {
      // remove token
      if (res) setTokenToCookie(res, null);
      return null;
    }
    if (res && (payload.exp as number) - Date.now() / 1000 < 43200) {
      // refresh jwt if remaining exp < 6 hours
      await setTokenToCookie(
        res,
        await encodeUserIdToToken(payload.sub as string)
      );
    }
    return db.collection<UserDbObject>("users").findOne({ _id: payload.sub });
  });
}

export async function encodeUserIdToToken(userId: string) {
  return new SignJWT({})
    .setProtectedHeader({ alg: "PS256" })
    .setIssuedAt()
    .setSubject(userId)
    .setIssuer(issuer)
    .setExpirationTime("24h")
    .sign(privateKey);
}

export async function decodeFromToken(jwt: string) {
  const result = await jwtVerify(jwt, publicKey, {
    issuer,
  }).catch(() => null);
  return result?.payload;
}
