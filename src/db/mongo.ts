import { Db, MongoClient } from "mongodb";
import {
  FollowDbObject,
  NotificationDbObject,
  StoryDbObject,
  UserDbObject,
} from "../types/index";

function applyIndex(db: Db) {
  // user
  db.collection<UserDbObject>("users").createIndexes([
    { key: { username: 1 }, unique: true },
  ]);
  // story
  db.collection<StoryDbObject>("stories").createIndexes([
    { key: { creatorId: 1 } },
    { key: { isLive: 1 } },
    { key: { location: "2dsphere" } },
  ]);
  // follow
  db.collection<FollowDbObject>("follows").createIndexes([
    { key: { follower: 1 } },
    { key: { following: 1 } },
  ]);
  // notification
  db.collection<NotificationDbObject>("notifications").createIndexes([
    { key: { userId: 1 } },
  ]);
}

export async function createClient() {
  const client = new MongoClient(process.env.MONGODB_URI as string, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  await client.connect();
  const db = client.db();
  applyIndex(db);
  return { client, db };
}
