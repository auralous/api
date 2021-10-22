import type { Db } from "mongodb";
import mongodb from "mongodb";
import pino from "pino";
import { pinoOpts } from "../logger/options.js";
import { ENV } from "../utils/constant.js";
import {
  FollowDbObject,
  MessageDbObject,
  NotificationDbObjectUnion,
  SessionDbObject,
  UserDbObject,
} from "./types.js";

const logger = pino({
  ...pinoOpts,
  name: "data/mongo",
});

async function applyIndex(db: Db) {
  // user
  await db
    .collection<UserDbObject>("users")
    .createIndexes([{ key: { username: 1 }, unique: true }]);
  // session
  await db
    .collection<SessionDbObject>("sessions")
    .createIndexes([
      { key: { creatorId: 1 } },
      { key: { isLive: 1 } },
      { key: { location: "2dsphere" } },
    ]);
  // follow
  await db
    .collection<FollowDbObject>("follows")
    .createIndexes([{ key: { follower: 1 } }, { key: { following: 1 } }]);
  // notification
  await db
    .collection<NotificationDbObjectUnion>("notifications")
    .createIndexes([{ key: { userId: 1 } }]);
  await db
    .collection<MessageDbObject>("messages")
    .createIndexes([{ key: { sessionId: 1 } }]);
  logger.info("Index applied");
}

const client = new mongodb.MongoClient(ENV.MONGODB_URI);

await client.connect();

logger.info("Database connected");

export const db = client.db();

await applyIndex(db);
