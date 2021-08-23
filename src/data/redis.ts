import Redis from "ioredis";
import url from "url";

const MAXIMUM_RECONNECTION_ATTEMPT = 6;

const redisUrl = new url.URL(process.env.REDIS_URL as string);

export const createClient = () =>
  new Redis({
    port: Number(redisUrl.port),
    host: redisUrl.hostname,
    password: redisUrl.password || undefined,
    dropBufferSupport: true,
    retryStrategy(times) {
      if (times > MAXIMUM_RECONNECTION_ATTEMPT) return;
      return Math.pow(2, times) * 100;
    },
  });

export const redis = createClient();
