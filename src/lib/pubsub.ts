import { RedisPubSub } from "graphql-redis-subscriptions";
import { createClient } from "../db/redis";

export const pub = createClient();

export const sub = createClient();

export const pubsub = new RedisPubSub({
  publisher: pub,
  subscriber: sub,
});
