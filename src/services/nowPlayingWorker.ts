import Services from "../services";
import { PUBSUB_CHANNELS } from "../lib/constant";

import type { Db } from "mongodb";
import type Redis from "ioredis";
import type { PubSub } from "../lib/pubsub";
import type {
  MyGQLContext,
  RoomDbObject,
  NowPlayingItemDbObject,
} from "../types/index";

export class NowPlayingWorker {
  services!: MyGQLContext["services"];
  timers: {
    [id: string]: NodeJS.Timeout;
  } = {};

  constructor(private pubsub: PubSub) {
    pubsub.sub.subscribe(PUBSUB_CHANNELS.nowPlayingResolve);
    pubsub.sub.on(
      "message",
      (channel, id) =>
        channel === PUBSUB_CHANNELS.nowPlayingResolve && this.addJob(id, 0)
    );
  }

  async init(db: Db, redis: Redis.Cluster) {
    // This is called upon service startup to set up delay jobs
    // To process NowPlaying for all rooms in database
    this.services = new Services({
      user: null,
      db,
      redis,
      pubsub: this.pubsub,
      // isWs means no cache
      isWs: true,
    });
    const roomArray = await db
      .collection<RoomDbObject>("rooms")
      .find({})
      .toArray();

    for (const room of roomArray) {
      this.addJob(room._id, 0);
    }
  }

  addJob(id: string, delay: number) {
    // Cancel previous job
    clearTimeout(this.timers[id]);
    // Schedule new job
    this.timers[id] = setTimeout(() => this.resolveRoom(id), delay);
  }

  private async resolveRoom(
    roomId: string
  ): Promise<NowPlayingItemDbObject | null> {
    const now = new Date();

    const prevCurrentTrack = await this.services.NowPlaying.findById(
      roomId,
      true
    );

    const prevPlayed = prevCurrentTrack && prevCurrentTrack.endedAt < now;

    if (prevCurrentTrack && !prevPlayed) {
      // No need to execute, there is still a nowPlaying track
      const retryIn = Math.max(
        0,
        prevCurrentTrack.endedAt.getTime() - now.getTime()
      );
      this.addJob(roomId, retryIn);
      return prevCurrentTrack;
    }

    const queueId = `room:${roomId}`;
    const playedQueueId = `room:${roomId}:played`;

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

      await this.services.NowPlaying.setById(roomId, currentTrack);
      // Setup future job
      this.addJob(roomId, currentTrack.endedAt.getTime() - now.getTime());
    } else {
      // Cannot figure out a current track
    }

    // Publish to subscription
    this.services.NowPlaying.notifyUpdate(roomId, currentTrack);
    this.services.NowPlaying.notifyReactionUpdate(roomId, undefined);

    return currentTrack;
  }
}
