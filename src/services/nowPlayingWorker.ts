import { pubsub } from "../data/pubsub.js";
import { redis } from "../data/redis.js";
import type {
  NowPlayingState,
  NowPlayingStateRedisValue,
} from "../data/types.js";
import type { NowPlayingQueueItem } from "../graphql/graphql.gen.js";
import { PUBSUB_CHANNELS, REDIS_KEY } from "../utils/constant.js";
import { QueueService } from "./queue.js";
import { TrackService } from "./track.js";
import { ServiceContext } from "./types.js";
import { createContext } from "./_context.js";

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
    let uid: string;
    let index: number;
    if (typeof indexOrUid === "string") {
      uid = indexOrUid;
      const findIndex = await QueueService.getIndexByUid(id, uid);
      if (!findIndex)
        throw new Error(`Cannot find index of uid ${uid} for id = ${id}`);
      index = findIndex;
    } else {
      index = indexOrUid;
      const findUid = await QueueService.getUidAtIndex(id, index);
      if (!findUid)
        throw new Error(
          `Cannot find queue uid at index ${index} for id = ${id}`
        );
      uid = findUid;
    }

    const queueItem = await QueueService.findQueueItemData(id, uid);
    if (!queueItem)
      throw new Error(`Cannot get queue item data for id = ${id} and ${uid}`);

    const track = await TrackService.findTrack(this.context, queueItem.trackId);
    if (!track) throw new Error(`Cannot find track ${queueItem.trackId}`);

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
    };
    // Notify nowPlaying changes
    pubsub.publish(PUBSUB_CHANNELS.nowPlayingUpdated, {
      nowPlayingUpdated: {
        id,
        currentTrack,
      },
    });
  }

  private async executeSkipForward(id: string, isManual?: boolean) {
    const [nowPlayingState, queueLength] = await Promise.all<
      NowPlayingState,
      number,
      boolean | number
    >([
      NowPlayingWorker.getFormattedNowPlayingState(id),
      QueueService.getQueueLength(id),
      !!isManual && NowPlayingWorker.cancelSkipJob(id),
    ]);

    // Either go back to first track if at end or go to the next
    const nextPlayingIndex =
      nowPlayingState.playingIndex >= queueLength - 1
        ? 0
        : nowPlayingState.playingIndex + 1;

    await this.setNewPlayingIndexOrUid(id, nextPlayingIndex);
  }

  private async executeSkipBackward(id: string, isManual?: boolean) {
    const [nowPlayingState] = await Promise.all<
      NowPlayingState,
      boolean | number
    >([
      NowPlayingWorker.getFormattedNowPlayingState(id),
      !!isManual && NowPlayingWorker.cancelSkipJob(id),
    ]);

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
      // message has a format of action|sessionId where action can either be 'skipForward' or 'skipBackward'
      const [action, value] = message.split("|");
      if (action === "skipForward") this.executeSkipForward(value, true);
      else if (action === "skipBackward") this.executeSkipBackward(value, true);
      else if (action === "playIndex") {
        const [id, index] = value.split(":");
        this.setNewPlayingIndexOrUid(id, Number(index));
      } else if (action === "playUid") {
        const [id, uid] = value.split(":");
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
      return;
    }
    console.log(`process skip job for id ${id}`);
    await this.executeSkipForward(id);
  }

  async startScheduler() {
    console.log("NowPlaying scheduler has started");
    const processSkipJob = this.processSkipJob.bind(this);
    async function check() {
      const result = await redis.zrangebyscore(
        REDIS_KEY.npSkipScheduler,
        "-inf",
        Date.now()
      );
      console.log("scheduler check result: ", result);
      if (result.length) {
        result.map(processSkipJob);
      }
      setTimeout(check, 1000);
    }
    check();
  }
}
