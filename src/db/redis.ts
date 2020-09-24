import Redis from "ioredis";

const redisUrls = process.env.REDIS_URL!.split(" ");

export const redis = new Redis.Cluster(redisUrls, {
  redisOptions: {
    showFriendlyErrorStack: process.env.NODE_ENV !== "production",
    dropBufferSupport: true,
  },
});

export function deleteByPattern(r: Redis.Cluster, pattern: string) {
  return r.keys(pattern).then((keys) => {
    // const pipeline = r.pipeline();
    // keys.forEach((key) => pipeline.del(key));
    // return pipeline.exec();
    // REDIS_CLUSTER: pipeline not work without hash tags
    return keys.map((key) => r.unlink(key));
  });
}

export function getByPattern(r: Redis.Cluster, pattern: string) {
  return r.keys(pattern).then((keys) =>
    // REDIS_CLUSTER: mget not work without hash tags
    keys.length > 0 ? Promise.all(keys.map((key) => redis.get(key))) : []
  );
}
