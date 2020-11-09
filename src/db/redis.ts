import Redis from "ioredis";
import url from "url";

const MAXIMUM_RECONNECTION_ATTEMPT = 6;

const redisUrls = (process.env.REDIS_URL as string).split(" ");
const firstRedisURL = new url.URL(redisUrls[0]);

export const createClient = () =>
  new Redis.Cluster(redisUrls, {
    redisOptions: {
      dropBufferSupport: true,
      retryStrategy(times) {
        if (times > MAXIMUM_RECONNECTION_ATTEMPT) return;
        return Math.pow(2, times) * 100;
      },
      // This must define even if ioredis automatically discover other nodes
      ...(firstRedisURL.password && { password: firstRedisURL.password }),
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
