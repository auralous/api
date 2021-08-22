import type Redis from "ioredis";
import type { Db } from "mongodb";
import { db } from "../data/mongo.js";
import type { PubSub } from "../data/pubsub.js";
import { pubsub } from "../data/pubsub.js";
import { redis } from "../data/redis.js";
import { SessionDbObject } from "../data/types.js";
import { MessageType, NowPlayingQueueItem } from "../graphql/graphql.gen.js";
import { PUBSUB_CHANNELS, REDIS_KEY } from "../utils/constant.js";
import { MessageService } from "./message.js";
import { NowPlayingService } from "./nowPlaying.js";
import { QueueService } from "./queue.js";
import { TrackService } from "./track.js";

export class NowPlayingWorker {
  private timers = new Map<string, NodeJS.Timeout>();

  private nowPlayingService: NowPlayingService;
  private queueService: QueueService;
  private trackService: TrackService;
  private messageService: MessageService;

  static start() {
    return new NowPlayingWorker(db, redis, pubsub);
  }

  static requestResolve(pubsub: PubSub, id: string) {
    return pubsub.pub.publish(
      PUBSUB_CHANNELS.nowPlayingWorker,
      `resolve|${id}`
    );
  }

  static requestSkip(pubsub: PubSub, id: string) {
    const a = pubsub.pub.publish(
      PUBSUB_CHANNELS.nowPlayingWorker,
      `skip|${id}`
    );
    return a;
  }

  constructor(db: Db, private redis: Redis.Cluster, private pubsub: PubSub) {
    this.resolve = this.resolve.bind(this);
    pubsub.sub.subscribe(PUBSUB_CHANNELS.nowPlayingWorker);
    pubsub.sub.on("message", (channel, message: string) => {
      // message has a format of action|sessionId where action can either be 'skip' or 'resolve'
      const [action, sessionId] = message.split("|");
      if (action === "resolve") this.resolve(sessionId);
      else if (action === "skip") this.skip(sessionId);
    });
    this.init(db);
    const context = { loaders: {} };
    this.nowPlayingService = new NowPlayingService(context);
    this.queueService = new QueueService(context);
    this.trackService = new TrackService(context);
    this.messageService = new MessageService(context);
  }

  private async init(db: Db) {
    console.log("Initializing NowPlaying jobs...");
    // This is called upon service startup to set up delay jobs
    // To process NowPlaying for all sessions in database
    const sessionArray = await db
      .collection<SessionDbObject>("sessions")
      .find({})
      .toArray();

    for (const session of sessionArray) {
      this.resolve(session._id.toHexString());
    }
  }

  private setNowPlayingById(id: string, queueItem: NowPlayingQueueItem) {
    return this.redis
      .set(REDIS_KEY.nowPlaying(id), NowPlayingService.stringifyItem(queueItem))
      .then(Boolean);
  }

  private schedule(sessionId: string, ms: number) {
    this.timers.set(sessionId, setTimeout(this.resolve, ms, sessionId));
  }

  private async skip(sessionId: string): Promise<boolean> {
    const lastPlaying = await this.nowPlayingService.findById(sessionId);
    if (!lastPlaying) return false;
    // Make it end right now
    lastPlaying.endedAt = new Date();
    return this.setNowPlayingById(sessionId, lastPlaying).then(() =>
      this.resolve(sessionId).then(Boolean)
    );
  }

  private async resolve(
    sessionId: string
  ): Promise<NowPlayingQueueItem | null> {
    // Cancel previous job
    const prevTimer = this.timers.get(sessionId);
    prevTimer && clearTimeout(prevTimer);

    // Now timestamp
    const now = new Date();

    const prevCurrentTrack = await this.nowPlayingService.findById(
      sessionId,
      true
    );

    if (prevCurrentTrack && prevCurrentTrack.endedAt > now) {
      // No need to execute, there is still a nowPlaying track
      const retryIn = Math.max(
        0,
        prevCurrentTrack.endedAt.getTime() - now.getTime()
      );
      this.schedule(sessionId, retryIn);
      return prevCurrentTrack;
    }

    let currentTrack: NowPlayingQueueItem | null = null;

    const firstTrackInQueue = await this.queueService.shiftItem(sessionId);

    if (firstTrackInQueue) {
      const detailNextTrack = await this.trackService.findTrack(
        firstTrackInQueue.trackId
      );

      if (!detailNextTrack) {
        throw new Error(
          `An error has occurred in trying to get NowPlaying track: ${firstTrackInQueue.trackId}`
        );
      }

      currentTrack = {
        ...firstTrackInQueue,
        playedAt: now,
        endedAt: new Date(now.getTime() + detailNextTrack.duration),
      };
    }

    if (currentTrack) {
      // Push previous nowPlaying to played queue
      if (prevCurrentTrack)
        await this.queueService.pushItemsPlayed(sessionId, prevCurrentTrack);
      // Save currentTrack
      await this.setNowPlayingById(sessionId, currentTrack);
      // Send message
      await this.messageService.add(sessionId, {
        creatorId: currentTrack.creatorId,
        type: MessageType.Play,
        text: currentTrack.trackId,
      });
      // Setup future job
      this.schedule(sessionId, currentTrack.endedAt.getTime() - now.getTime());
    } else {
      // Cannot figure out a current track
    }

    // Publish to subscription
    this.nowPlayingService.notifyNowPlayingChange(sessionId, currentTrack);

    return currentTrack;
  }
}
