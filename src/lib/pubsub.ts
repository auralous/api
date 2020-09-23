import { RedisPubSub } from "graphql-redis-subscriptions";
import Redis, { RedisOptions } from "ioredis";
import { URL } from "url";

const redisURL = new URL(process.env.REDIS_URL as string);
const redisOption: RedisOptions = {
  host: redisURL.hostname,
  port: parseInt(redisURL.port, 10),
  password: redisURL.password,
};
const pubsub = new RedisPubSub({
  publisher: new Redis(redisOption),
  subscriber: new Redis(redisOption),
});

export default pubsub;
