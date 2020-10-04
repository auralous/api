import type { Db } from "mongodb";
import type Redis from "ioredis";
import { UserDbObject } from "../types/db";
import { PubSub } from "../lib/pubsub";
import { MyGQLContext } from "../types/common";
import { buildServices } from "../models/services";

export function buildContext({
  db,
  redis,
  pubsub,
  user,
  cache,
}: {
  db: Db;
  redis: Redis.Cluster;
  user: UserDbObject | null;
  pubsub: PubSub;
  cache: boolean;
}): MyGQLContext {
  return {
    user,
    redis,
    db,
    pubsub,
    services: buildServices({ db, redis, pubsub, user }, { cache }),
  };
}
