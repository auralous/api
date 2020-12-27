import type { Db } from "mongodb";
import type IORedis from "ioredis";
import type { PubSub } from "../lib/pubsub";

export interface ServiceContext {
  db: Db;
  redis: IORedis.Cluster;
  pubsub: PubSub;
}
