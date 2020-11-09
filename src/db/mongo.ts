import { MongoClient, Db } from "mongodb";

import type { UserDbObject, RoomDbObject } from "../types/db";

function applyIndex(db: Db) {
  // user
  db.collection<UserDbObject>("users").createIndexes([
    { key: { username: 1 }, unique: true },
  ]);
  // room
  db.collection<RoomDbObject>("rooms").createIndexes([
    { key: { creatorId: 1 } },
    { key: { _id: 1, creatorId: 1 } },
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
