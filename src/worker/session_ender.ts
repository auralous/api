import pino from "pino";
import { redis } from "../data/redis.js";
import { pinoOpts } from "../logger/options.js";
import { SessionService } from "../services/session.js";
import { REDIS_KEY } from "../utils/constant.js";

const logger = pino({
  ...pinoOpts,
  name: "worker/session_ender",
});

async function processEndSession(id: string) {
  logger.info({ id }, `processEndSession: triggered`);
  try {
    await SessionService._end(id);
    await redis.zrem(REDIS_KEY.sessionEndedAt, id);
    logger.info({ id }, `processEndSession: ended`);
  } catch (e) {
    logger.error(e, `processEndSession: cannot end ${id}`);
  }
}

export default async function start() {
  logger.info("task: startScheduler");

  async function check() {
    const result = await redis.zrangebyscore(
      REDIS_KEY.sessionEndedAt,
      "-inf",
      Date.now()
    );
    if (result.length) {
      result.map(processEndSession);
    }
    setTimeout(check, 60000);
  }

  check();
}
