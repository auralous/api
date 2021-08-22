import type { Db } from "mongodb";
import mongodb from "mongodb";
import type {
  FollowDbObject,
  NotificationDbObjectUnion,
  SessionDbObject,
  UserDbObject,
} from "./types.js";

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
}

const client = new mongodb.MongoClient(process.env.MONGODB_URI as string);

await client.connect();

const db = client.db();

await applyIndex(db);

export { client, db };
