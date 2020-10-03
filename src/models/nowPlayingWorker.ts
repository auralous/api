import { Db } from "mongodb";
import { npLogger } from "../logger/index";
import { buildContext } from "../graphql/context";
import { RoomDbObject, NowPlayingItemDbObject } from "../types/db";
import { RedisPubSub } from "graphql-redis-subscriptions";

export class NowPlayingWorker {
  db: Db;
  pubsub: RedisPubSub;
  services = buildContext({ user: null, cache: false }).services;

  timers: {
    [id: string]: NodeJS.Timeout;
  } = {};

  constructor({ db, pubsub }: { db: Db; pubsub: RedisPubSub }) {
    this.db = db;
    this.pubsub = pubsub;
  }

  async initJobs() {
    // This is called upon service startup to set up delay jobs
    // To process NowPlaying
    npLogger.debug("Set up Jobs");
    const roomArray = await this.db
      .collection<RoomDbObject>("rooms")
      .find({})
      .toArray();

    for (const room of roomArray) {
      this.addJob(`room:${room._id}`, 0);
    }
  }

  async addJob(id: string, delay: number) {
    // Cancel previous job
    clearTimeout(this.timers[id]);
    const [type, typeId] = id.split(":");
    // Schedule new job
    this.timers[id] = setTimeout(
      (type: "room", typeId: string) => {
        if (type === "room") this.resolveRoom(typeId);
      },
      delay,
      type,
      typeId
    );
  }

  private async resolveRoom(
    roomId: string
  ): Promise<NowPlayingItemDbObject | null> {
    const childLogger = npLogger.child({ type: "room", id: `room:${roomId}` });

    childLogger.debug("Start");

    const now = new Date();

    const prevCurrentTrack = await this.services.NowPlaying.findById(
      `room:${roomId}`,
      true
    );

    const prevPlayed = prevCurrentTrack && prevCurrentTrack.endedAt < now;

    if (prevCurrentTrack && !prevPlayed) {
      // No need to execute, there is still a nowPlaying track
      const retryIn = Math.max(
        0,
        prevCurrentTrack.endedAt.getTime() - now.getTime()
      );
      this.addJob(`room:${roomId}`, retryIn);
      childLogger.debug(`Existed. Try again in ${retryIn} ms`);
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
        childLogger.error(`Fail to get track. Retrying...`, {
          trackId: firstTrackInQueue.trackId,
        });
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

      await this.services.NowPlaying.setById(`room:${roomId}`, currentTrack);
      // Setup future job
      this.addJob(
        `room:${roomId}`,
        currentTrack.endedAt.getTime() - now.getTime()
      );
    } else {
      // Cannot figure out a current track
    }

    // Publish to subscription
    this.pubsub.publish("NOW_PLAYING_UPDATED", {
      nowPlayingUpdated: {
        id: `room:${roomId}`,
        currentTrack,
      },
    });

    this.pubsub.publish("NOW_PLAYING_REACTIONS_UPDATED", {
      nowPlayingReactionsUpdated: await this.services.NowPlaying._getReactionsCountAndMine(
        `room:${roomId}`,
        // Forcing to return "resetted" reactions stats
        undefined
      ),
    });

    childLogger.debug({ currentTrack }, "Done");

    return currentTrack;
  }
}
