import { Services } from "../services/index";
import { PUBSUB_CHANNELS, REDIS_KEY } from "../lib/constant";

import type { Db } from "mongodb";
import type Redis from "ioredis";
import type { PubSub } from "../lib/pubsub";
import {
  StoryDbObject,
  NowPlayingItemDbObject,
  MessageType,
} from "../types/index";

export class NowPlayingWorker {
  private timers = new Map<string, NodeJS.Timeout>();
  private services: Services;

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
    this.services = new Services({
      user: null,
      db,
      redis,
      pubsub: this.pubsub,
      // isWs means no cache
      isWs: true,
    });
    this.init(db);
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
      this.resolve(story._id);
    }
  }

  private setNowPlayingById(id: string, queueItem: NowPlayingItemDbObject) {
    return this.redis
      .set(
        REDIS_KEY.nowPlaying(id),
        this.services.Queue.stringifyItem(queueItem)
      )
      .then(Boolean);
  }

  static start(db: Db, redis: Redis.Cluster, pubsub: PubSub) {
    return new NowPlayingWorker(db, redis, pubsub);
  }

  schedule(storyId: string, ms: number) {
    this.timers.set(storyId, setTimeout(this.resolve, ms, storyId));
  }

  private async skip(storyId: string): Promise<boolean> {
    const lastPlaying = await this.services.NowPlaying.findById(storyId);
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

    const prevCurrentTrack = await this.services.NowPlaying.findById(
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

    const queueId = `story:${storyId}`;
    const playedQueueId = `story:${storyId}:played`;

    let currentTrack: NowPlayingItemDbObject | null = null;

    const firstTrackInQueue = await this.services.Queue.shiftItem(queueId);

    if (firstTrackInQueue) {
      const detailNextTrack = await this.services.Track.findOrCreate(
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
        await this.services.Queue.pushItems(playedQueueId, prevCurrentTrack);
      // Save currentTrack
      await this.setNowPlayingById(storyId, currentTrack);
      // Send message
      await this.services.Message.add(`story:${storyId}`, {
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
    this.services.NowPlaying.notifyUpdate(storyId, currentTrack);
    this.services.NowPlaying.notifyReactionUpdate(storyId, undefined);

    return currentTrack;
  }
}
