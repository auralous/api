import Redis from "ioredis";
import { ENV } from "../utils/constant.js";

export const createClient = () => new Redis(ENV.REDIS_URL);

export const redis = createClient();
