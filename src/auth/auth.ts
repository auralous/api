import type { ServerResponse } from "http";
import type IORedis from "ioredis";
import type { Db } from "mongodb";
import type { PubSub } from "../lib/pubsub";
import { UserService } from "../services/user";
import type { ExtendedIncomingMessage, UserDbObject } from "../types";

export async function doAuth(
  context: { db: Db; redis: IORedis.Cluster; pubsub: PubSub },
  req: ExtendedIncomingMessage,
  res: ServerResponse,
  oauth: UserDbObject["oauth"],
  profile: Pick<UserDbObject, "profilePicture" | "email">
) {
  const userService = new UserService(context);
  const user = await userService.authOrCreate(oauth, profile);
  req.session.userId = user._id;
  res
    .writeHead(307, {
      Location: `${process.env.APP_URI}/auth/callback${
        // @ts-expect-error: isNew is a special field to check if user is newly registered
        user.isNew ? "?isNew=1" : ""
      }`,
    })
    .end();
}
