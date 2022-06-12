import mongodb from "mongodb";
import pino from "pino";
import { pinoOpts } from "../logger/options.js";
import { ENV } from "../utils/constant.js";
import {
  FollowDbObject,
  MessageDbObject,
  NotificationDbObjectUnion,
  RecommendationDbObject,
  SessionDbObject,
  UserDbObject,
} from "./types.js";

const logger = pino({
  ...pinoOpts,
  name: "data/mongo",
});

const client = new mongodb.MongoClient(ENV.MONGODB_URI);

await client.connect();

logger.info("database connected");

const db = client.db();

export const userDbCollection = db.collection<UserDbObject>("users");
await userDbCollection.createIndexes([{ key: { username: 1 }, unique: true }]);

export const sessionDbCollection = db.collection<SessionDbObject>("sessions");
await sessionDbCollection.createIndexes([
  { key: { creatorId: 1 } },
  { key: { isLive: 1 } },
  { key: { location: "2dsphere" } },
  { key: { text: "text" } },
]);

export const followDbCollection = db.collection<FollowDbObject>("follows");
await followDbCollection.createIndexes([
  { key: { follower: 1 } },
  { key: { following: 1 } },
]);

export const notificationDbCollection =
  db.collection<NotificationDbObjectUnion>("notifications");
await notificationDbCollection.createIndexes([
  { key: { follower: 1 } },
  { key: { following: 1 } },
]);

export const messageDbCollection = db.collection<MessageDbObject>("messages");
await messageDbCollection.createIndexes([{ key: { sessionId: 1 } }]);

export const recommendationDbCollection =
  db.collection<RecommendationDbObject>("recommendations");
await recommendationDbCollection.createIndexes([
  {
    key: { platform: 1 },
  },
  {
    key: { platform: 1, id: 1 },
  },
]);

logger.info("applyIndex: done");
