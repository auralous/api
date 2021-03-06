import type { ServerResponse } from "http";
import type IORedis from "ioredis";
import parseJwk from "jose/jwk/parse";
import SignJWT from "jose/jwt/sign";
import jwtVerify from "jose/jwt/verify";
import type { KeyLike } from "jose/types";
import type { Db } from "mongodb";
import type { PubSub } from "../lib/pubsub";
import { UserService } from "../services/user";
import type { ExtendedIncomingMessage, UserDbObject } from "../types";
import { getTokenFromCookie, setTokenToCookie } from "./cookie";

export async function doAuth(
  context: { db: Db; redis: IORedis.Cluster; pubsub: PubSub },
  res: ServerResponse,
  oauth: UserDbObject["oauth"],
  profile: Pick<UserDbObject, "profilePicture" | "email">
) {
  const userService = new UserService(context);
  const user = await userService.authOrCreate(oauth, profile);

  setTokenToCookie(res, await encodeUserIdToToken(user._id));

  res
    .writeHead(307, {
      Location: `${process.env.APP_URI}/auth/callback${
        // @ts-expect-error: isNew is a special field to check if user is newly registered
        user.isNew ? "?isNew=1" : ""
      }`,
    })
    .end();
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
  const token = getTokenFromCookie(req);
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
