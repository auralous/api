import Redis from "ioredis";

const redisUrls = process.env.REDIS_URL!.split(" ");

export const redis = new Redis.Cluster(redisUrls, {
  redisOptions: {
    showFriendlyErrorStack: true,
  },
});

export function deleteByPattern(r: Redis.Redis, pattern: string) {
  return r.keys(pattern).then((keys) => {
    const pipeline = r.pipeline();
    keys.forEach((key) => pipeline.del(key));
    return pipeline.exec();
  });
}

export function getByPattern(r: Redis.Redis, pattern: string) {
  return r
    .keys(pattern)
    .then((keys) => (keys.length > 0 ? redis.mget(keys) : []));
}
