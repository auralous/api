import { MongoClient, Db } from "mongodb";
import { UserDbObject, RoomDbObject, PlaylistDbObject } from "../types/db";

export let db: Db;

export const client = new MongoClient(process.env.MONGODB_URI!, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

let indexApplied = false;

function applyIndex() {
  indexApplied = true;
  // user
  db.collection<UserDbObject>("users").createIndexes([
    { key: { username: 1 }, unique: true },
  ]);
  // room
  db.collection<RoomDbObject>("rooms").createIndexes([
    { key: { creatorId: 1 } },
    { key: { _id: 1, creatorId: 1 } },
  ]);
  // playlist
  db.collection<PlaylistDbObject>("playlists").createIndexes([
    { key: { userId: 1 } },
  ]);
}

export async function connect() {
  if (!client.isConnected()) {
    await client.connect();
  }
  db = client.db();
  if (!indexApplied) applyIndex();
}
