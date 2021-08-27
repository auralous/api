import pino from "pino";
import { pubsub } from "../data/pubsub.js";
import { redis } from "../data/redis.js";
import type {
  NowPlayingState,
  NowPlayingStateRedisValue,
} from "../data/types.js";
import type { NowPlayingQueueItem } from "../graphql/graphql.gen.js";
import { pinoOpts } from "../logger/options.js";
import { REDIS_KEY } from "../utils/constant.js";
import { NowPlayingService } from "./nowPlaying.js";
import { QueueService } from "./queue.js";
import { TrackService } from "./track.js";
import type { ServiceContext } from "./types.js";
import { createContext } from "./_context.js";

const logger = pino({
  ...pinoOpts,
  name: "service/nowPlayingWorker",
});

export class NowPlayingWorker {
  static PubSubChannel = "NowPlayingWorker";

  // Consumer API
  static skipForward(id: string) {
    return pubsub.pub.publish(
      NowPlayingWorker.PubSubChannel,
      `skipForward|${id}`
    );
  }

  static skipBackward(id: string) {
    return pubsub.pub.publish(
      NowPlayingWorker.PubSubChannel,
      `skipBackward|${id}`
    );
  }

  static playIndex(id: string, index: number) {
    return pubsub.pub.publish(
      NowPlayingWorker.PubSubChannel,
      `playIndex|${id}:${index}`
    );
  }

  static playUid(id: string, uid: string) {
    return pubsub.pub.publish(
      NowPlayingWorker.PubSubChannel,
      `playUid|${id}:${uid}`
    );
  }

  static async getFormattedNowPlayingState(
    id: string
  ): Promise<NowPlayingState> {
    const nowPlayingState = (await redis.hgetall(
      REDIS_KEY.nowPlayingState(id)
    )) as NowPlayingStateRedisValue;

    return {
      playingIndex: Number(nowPlayingState.playingIndex),
      queuePlayingUid: nowPlayingState.queuePlayingUid,
      playedAt: new Date(nowPlayingState.playedAt),
      endedAt: new Date(nowPlayingState.endedAt),
    };
  }

  // Worker API
  context: ServiceContext = createContext(null);

  static async startWorker() {
    const worker = new NowPlayingWorker();
    await worker.startScheduler();
    return worker;
  }

  private static async setNowPlayingState(id: string, state: NowPlayingState) {
    logger.debug({ id, state }, "setNowPlayingState");

    const value: Partial<NowPlayingStateRedisValue> = {};
    value.playingIndex = state.playingIndex.toString();
    value.queuePlayingUid = state.queuePlayingUid;
    value.playedAt = state.playedAt.toJSON();
    value.endedAt = state.endedAt.toJSON();

    const pipeline = redis.pipeline();
    // Set the value to nowPlayingState
    pipeline.hset(REDIS_KEY.nowPlayingState(id), value);
    // Schedule the next skip forward to zset
    pipeline.zadd(REDIS_KEY.npSkipScheduler, state.endedAt.getTime(), id);

    await pipeline.exec();
  }

  private async setNewPlayingIndexOrUid(
    id: string,
    indexOrUid: number | string
  ) {
    logger.debug({ id, indexOrUid }, "setNewPlayingIndexOrUid");
    let uid: string;
    let index: number;
    if (typeof indexOrUid === "string") {
      uid = indexOrUid;
      const findIndex = await QueueService.getIndexByUid(id, uid);
      if (!findIndex)
        throw new Error(`Queue index is null for id = ${id}, uid = ${uid}`);
      index = findIndex;
    } else {
      index = indexOrUid;
      const findUid = await QueueService.getUidAtIndex(id, index);
      if (!findUid)
        throw new Error(`Queue uid is null for id = ${id}, index = ${index}`);
      uid = findUid;
    }

    const queueItem = await QueueService.findQueueItemData(id, uid);
    if (!queueItem)
      throw new Error(`QueueItem is null for id = ${id}, uid = ${uid}`);

    const track = await TrackService.findTrack(this.context, queueItem.trackId);
    if (!track) throw new Error(`Track is null for id = ${queueItem.trackId}`);

    const playedAt = new Date();
    const endedAt = new Date(playedAt.getTime() + track.duration);

    await NowPlayingWorker.setNowPlayingState(id, {
      playingIndex: index,
      queuePlayingUid: uid,
      playedAt,
      endedAt,
    });

    const currentTrack: NowPlayingQueueItem = {
      trackId: queueItem.trackId,
      uid,
      creatorId: queueItem.creatorId,
      playedAt,
      endedAt,
      index,
    };
    // Notify nowPlaying changes
    NowPlayingService.notifyUpdate(id, currentTrack);
  }

  private async executeSkipForward(id: string) {
    logger.debug({ id }, "executeSkipForward");
    const [nowPlayingState, queueLength] = await Promise.all([
      NowPlayingWorker.getFormattedNowPlayingState(id),
      QueueService.getQueueLength(id),
    ]);

    // Either go back to first track if at end or go to the next
    const nextPlayingIndex =
      nowPlayingState.playingIndex >= queueLength - 1
        ? 0
        : nowPlayingState.playingIndex + 1;

    await this.setNewPlayingIndexOrUid(id, nextPlayingIndex);
  }

  private async executeSkipBackward(id: string) {
    logger.debug({ id }, "executeSkipBackward");
    const nowPlayingState = await NowPlayingWorker.getFormattedNowPlayingState(
      id
    );

    const nextPlayingIndex = Math.max(nowPlayingState.playingIndex - 1, 0);

    await this.setNewPlayingIndexOrUid(id, nextPlayingIndex);
  }

  constructor() {
    this.startScheduler = this.startScheduler.bind(this);
    this.processSkipJob = this.processSkipJob.bind(this);
    this.registerListeners();
  }

  private registerListeners() {
    pubsub.sub.subscribe(NowPlayingWorker.PubSubChannel);
    pubsub.sub.on("message", (channel, message: string) => {
      const [action, value] = message.split("|");
      // manually cancel job because it does not handle that
      if (action === "skipForward") {
        NowPlayingWorker.cancelSkipJob(value);
        this.executeSkipForward(value);
      } else if (action === "skipBackward") {
        this.executeSkipBackward(value);
      } else if (action === "playIndex") {
        const [id, index] = value.split(":");
        NowPlayingWorker.cancelSkipJob(id);
        this.setNewPlayingIndexOrUid(id, Number(index));
      } else if (action === "playUid") {
        const [id, uid] = value.split(":");
        NowPlayingWorker.cancelSkipJob(id);
        this.setNewPlayingIndexOrUid(id, uid);
      }
    });
  }

  static async cancelSkipJob(id: string) {
    return redis.zrem(REDIS_KEY.npSkipScheduler, id);
  }

  private async processSkipJob(id: string) {
    const removeResult = await NowPlayingWorker.cancelSkipJob(id);
    if (removeResult === 0) {
      // Try to take on this job but it might have been taken elsewhere
      logger.debug(
        { id },
        `Attempted to trigger skipForward job but cannot found`
      );
      return;
    }
    await this.executeSkipForward(id);
    logger.debug({ id }, `Triggered skipForward job`);
  }

  async startScheduler() {
    logger.info("Start scheduler");
    const processSkipJob = this.processSkipJob.bind(this);
    async function check() {
      const result = await redis.zrangebyscore(
        REDIS_KEY.npSkipScheduler,
        "-inf",
        Date.now()
      );
      logger.debug({ result }, `Polling key ${REDIS_KEY.npSkipScheduler}`);
      if (result.length) {
        result.map(processSkipJob);
      }
      setTimeout(check, 1000);
    }
    check();
  }
}
