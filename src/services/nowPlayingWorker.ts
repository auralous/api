import type Redis from "ioredis";
import type { Db } from "mongodb";
import { PUBSUB_CHANNELS, REDIS_KEY } from "../lib/constant";
import type { PubSub } from "../lib/pubsub";
import {
  MessageType,
  NowPlayingItemDbObject,
  StoryDbObject,
} from "../types/index";
import { MessageService } from "./message";
import { NowPlayingService } from "./nowPlaying";
import { QueueService } from "./queue";
import { TrackService } from "./track";

export class NowPlayingWorker {
  private timers = new Map<string, number>();

  private nowPlayingService: NowPlayingService;
  private queueService: QueueService;
  private trackService: TrackService;
  private messageService: MessageService;

  static start(db: Db, redis: Redis.Cluster, pubsub: PubSub) {
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
      // message has a format of action|storyId where action can either be 'skip' or 'resolve'
      const [action, storyId] = message.split("|");
      if (action === "resolve") this.resolve(storyId);
      else if (action === "skip") this.skip(storyId);
    });
    this.init(db);
    this.nowPlayingService = new NowPlayingService({ db, redis, pubsub });
    this.queueService = new QueueService({ db, redis, pubsub });
    this.trackService = new TrackService({ db, redis, pubsub });
    this.messageService = new MessageService({ db, redis, pubsub });
  }

  private async init(db: Db) {
    console.log("Initializing NowPlaying jobs...");
    // This is called upon service startup to set up delay jobs
    // To process NowPlaying for all stories in database
    const storyArray = await db
      .collection<StoryDbObject>("stories")
      .find({})
      .toArray();

    for (const story of storyArray) {
      this.resolve(story._id.toHexString());
    }
  }

  private setNowPlayingById(id: string, queueItem: NowPlayingItemDbObject) {
    return this.redis
      .set(REDIS_KEY.nowPlaying(id), NowPlayingService.stringifyItem(queueItem))
      .then(Boolean);
  }

  private schedule(storyId: string, ms: number) {
    this.timers.set(storyId, setTimeout(this.resolve, ms, storyId));
  }

  private async skip(storyId: string): Promise<boolean> {
    const lastPlaying = await this.nowPlayingService.findById(storyId);
    if (!lastPlaying) return false;
    // Make it end right now
    lastPlaying.endedAt = new Date();
    return this.setNowPlayingById(storyId, lastPlaying).then(() =>
      this.resolve(storyId).then(Boolean)
    );
  }

  private async resolve(
    storyId: string
  ): Promise<NowPlayingItemDbObject | null> {
    // Cancel previous job
    const prevTimer = this.timers.get(storyId);
    prevTimer && clearTimeout(prevTimer);

    // Now timestamp
    const now = new Date();

    const prevCurrentTrack = await this.nowPlayingService.findById(
      storyId,
      true
    );

    if (prevCurrentTrack && prevCurrentTrack.endedAt > now) {
      // No need to execute, there is still a nowPlaying track
      const retryIn = Math.max(
        0,
        prevCurrentTrack.endedAt.getTime() - now.getTime()
      );
      this.schedule(storyId, retryIn);
      return prevCurrentTrack;
    }

    let currentTrack: NowPlayingItemDbObject | null = null;

    const firstTrackInQueue = await this.queueService.shiftItem(storyId);

    if (firstTrackInQueue) {
      const detailNextTrack = await this.trackService.findOrCreate(
        firstTrackInQueue.trackId
      );

      if (!detailNextTrack) {
        throw new Error(
          `An error has occurred in trying to get NowPlaying track: ${firstTrackInQueue.trackId}`
        );
      }

      currentTrack = {
        ...firstTrackInQueue,
        index: prevCurrentTrack ? prevCurrentTrack.index + 1 : 0,
        playedAt: now,
        endedAt: new Date(now.getTime() + detailNextTrack.duration),
      };
    }

    if (currentTrack) {
      // Push previous nowPlaying to played queue
      if (prevCurrentTrack)
        await this.queueService.pushItemsPlayed(storyId, prevCurrentTrack);
      // Save currentTrack
      await this.setNowPlayingById(storyId, currentTrack);
      // Send message
      await this.messageService.add(`story:${storyId}`, {
        creatorId: currentTrack.creatorId,
        type: MessageType.Play,
        text: currentTrack.trackId,
      });
      // Setup future job
      this.schedule(storyId, currentTrack.endedAt.getTime() - now.getTime());
    } else {
      // Cannot figure out a current track
    }

    // Publish to subscription
    this.nowPlayingService.notifyNowPlayingChange(storyId, currentTrack);

    return currentTrack;
  }
}
