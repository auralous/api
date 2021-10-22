import pino from "pino";
import { pubsub } from "./data/pubsub.js";
import { redis } from "./data/redis.js";
import { pinoOpts } from "./logger/options.js";
import { NowPlayingController } from "./services/nowPlayingController.js";
import { PUBSUB_CHANNELS } from "./utils/constant.js";

const NP_SCHEDULE_KEY = "skip_scheduler";

const logger = pino({
  ...pinoOpts,
  name: "service/nowPlayingWorker",
});

async function addSkipJob(id: string, time: number) {
  return redis.zadd(NP_SCHEDULE_KEY, time, id);
}

async function cancelSkipJob(id: string) {
  return redis.zrem(NP_SCHEDULE_KEY, id);
}

async function processSkipJob(id: string) {
  const removeResult = await cancelSkipJob(id);
  if (removeResult === 0) {
    // Try to take on this job but it might have been taken elsewhere
    logger.debug(
      { id },
      `Attempted to trigger skipForward job but cannot found`
    );
    return;
  }
  NowPlayingController.skipForward(id);
  logger.debug({ id }, `Triggered skipForward job`);
}

async function startScheduler() {
  logger.info("Start scheduler");

  pubsub.sub.subscribe(PUBSUB_CHANNELS.worker);
  pubsub.sub.on("message", (channel, message: string) => {
    if (channel !== PUBSUB_CHANNELS.worker) return;
    const [id, time] = message.split("|");
    addSkipJob(id, Number(time));
  });

  async function check() {
    const result = await redis.zrangebyscore(
      NP_SCHEDULE_KEY,
      "-inf",
      Date.now()
    );
    logger.debug({ result }, `Polling key ${NP_SCHEDULE_KEY}`);
    if (result.length) {
      result.map(processSkipJob);
    }
    setTimeout(check, 1000);
  }
  check();
}

await startScheduler();
