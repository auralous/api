import type { Db } from "mongodb";
import type IORedis from "ioredis";
import type { UserDbObject } from "../types/db";
import type { PubSub } from "../lib/pubsub";

export interface ServiceContext {
  db: Db;
  redis: IORedis.Cluster;
  pubsub: PubSub;
  user: UserDbObject | null;
  isWs?: boolean;
}
