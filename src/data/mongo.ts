import type { Db } from "mongodb";
import mongodb from "mongodb";
import type {
  FollowDbObject,
  NotificationDbObject,
  StoryDbObject,
  UserDbObject,
} from "./types.js";

async function applyIndex(db: Db) {
  // user
  await db
    .collection<UserDbObject>("users")
    .createIndexes([{ key: { username: 1 }, unique: true }]);
  // story
  await db
    .collection<StoryDbObject>("stories")
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
    .collection<NotificationDbObject>("notifications")
    .createIndexes([{ key: { userId: 1 } }]);
}

const client = new mongodb.MongoClient(process.env.MONGODB_URI as string, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

await client.connect();

const db = client.db();

await applyIndex(db);

export { client, db };
