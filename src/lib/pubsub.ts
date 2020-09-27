import { RedisPubSub } from "graphql-redis-subscriptions";
import { redis } from "../db/redis";

const pubsub = new RedisPubSub({
  publisher: redis,
  subscriber: redis,
});

export default pubsub;
