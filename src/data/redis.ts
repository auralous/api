import Redis from "ioredis";
import url from "url";
import { ENV } from "../utils/constant.js";

const MAXIMUM_RECONNECTION_ATTEMPT = 6;

const redisUrl = new url.URL(ENV.REDIS_URL);

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
