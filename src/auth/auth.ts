import type { ServerResponse } from "http";
import type IORedis from "ioredis";
import SignJWT from "jose/jwt/sign";
import jwtVerify from "jose/jwt/verify";
import type { KeyLike } from "jose/types";
import generateKeyPair from "jose/util/generate_key_pair";
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

let secrets: { publicKey: KeyLike; privateKey: KeyLike };

const issuer = "auralous:api";

export function getUserFromRequest(
  req: ExtendedIncomingMessage,
  db: Db,
  res?: ServerResponse
) {
  const token = getTokenFromCookie(req);
  if (!token) return null;
  return decodeUserIdFromToken(token).then((userId) => {
    if (userId)
      return db.collection<UserDbObject>("users").findOne({ _id: userId });
    // remove token
    if (res) setTokenToCookie(res, null);
    return null;
  });
}

export async function initAuth() {
  secrets = await generateKeyPair("PS256");
}

export async function encodeUserIdToToken(userId: string) {
  return new SignJWT({})
    .setProtectedHeader({ alg: "PS256" })
    .setIssuedAt()
    .setSubject(userId)
    .setIssuer(issuer)
    .setExpirationTime("24h")
    .sign(secrets.privateKey);
}

export async function decodeUserIdFromToken(jwt: string) {
  const result = await jwtVerify(jwt, secrets.publicKey, {
    issuer,
  }).catch(() => null);
  return result?.payload.sub;
}
