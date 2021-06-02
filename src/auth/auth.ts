import type { IncomingMessage, ServerResponse } from "http";
import parseJwk from "jose/jwk/parse";
import SignJWT from "jose/jwt/sign";
import jwtVerify from "jose/jwt/verify";
import { URL } from "url";
import { db } from "../data/mongo.js";
import type { UserDbObject } from "../data/types.js";
import { UserService } from "../services/user.js";
import { setCookie } from "./cookie.js";

/**
 * Authentication with JWT
 */

const issuer = "auralous:api";

const privateKey = await parseJwk(
  JSON.parse(process.env.JWK_PRIVATE as string)
);
const publicKey = await parseJwk(JSON.parse(process.env.JWK_PUBLIC as string));

/**
 * Route handlers for authentication
 */

const authCookieName = "sid";
const isAppLoginCookieName = "is-app-login";

export function setTokenToCookie(res: ServerResponse, token: string | null) {
  setCookie(res, authCookieName, token, {
    domain: new URL(process.env.APP_URI as string).hostname,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 365 * 24 * 60 * 60,
    path: "/",
    sameSite: "lax" as const,
  });
}

/**
 * Create an auth initialization handler
 * that set neccessary cookie and redirect to oauth2.0
 */
export function authInit(
  req: IncomingMessage,
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
}

/**
 * Handle callbacks coming from oauth2.0 redirection
 */
export async function authCallback(
  req: IncomingMessage,
  res: ServerResponse,
  oauth: UserDbObject["oauth"],
  profile: Pick<UserDbObject, "profilePicture" | "email">
) {
  const user = await new UserService({ loaders: {} }).authOrCreate(
    oauth,
    profile
  );

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
}

export function getUserFromRequest(req: IncomingMessage, res?: ServerResponse) {
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
      setTokenToCookie(res, await encodeUserIdToToken(payload.sub as string));
    }
    return db.collection<UserDbObject>("users").findOne({ _id: payload.sub });
  });
}

async function encodeUserIdToToken(userId: string) {
  return new SignJWT({})
    .setProtectedHeader({ alg: "PS256" })
    .setIssuedAt()
    .setSubject(userId)
    .setIssuer(issuer)
    .setExpirationTime("24h")
    .sign(privateKey);
}

async function decodeFromToken(jwt: string) {
  const result = await jwtVerify(jwt, publicKey, {
    issuer,
  }).catch(() => null);
  return result?.payload;
}
