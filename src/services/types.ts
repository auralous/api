import { Db } from "mongodb";
import IORedis from "ioredis";
import { UserDbObject } from "../types/db";
import { PubSub } from "../lib/pubsub";

export interface ServiceContext {
  db: Db;
  redis: IORedis.Cluster;
  pubsub: PubSub;
  user: UserDbObject | null;
  isWs?: boolean;
}
