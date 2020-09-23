import { Db } from "mongodb";
import { npLogger } from "../logger/index";
import { buildContext } from "../graphql/context";
import { RoomDbObject, NowPlayingItemDbObject } from "../types/db";

export class NowPlayingWorker {
  db: Db;
  services = buildContext({ user: null, cache: false }).services;

  timers: {
    [id: string]: NodeJS.Timeout;
  } = {};

  constructor({ db }: { db: Db }) {
    this.db = db;
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
    // Schedule new job
    this.timers[id] = setTimeout(
      (id) => {
        const [type, typeId] = id.split(":");
        if (type === "room") {
          this.resolveRoom(typeId);
        }
      },
      delay,
      id
    );
  }

  private async resolveRoom(
    roomId: string
  ): Promise<NowPlayingItemDbObject | null> {
    const childLogger = npLogger.child({ type: "room", id: `room:${roomId}` });

    childLogger.debug("Start");

    const prevCurrentTrack = await this.services.NowPlaying.findById(
      `room:${roomId}`
    );

    if (prevCurrentTrack) {
      // No need to execute, there is still a nowPlaying track
      // No need to execute, there is still a nowPlaying track
      const ttl = await this.services.NowPlaying.ttl(`room:${roomId}`);
      const retryIn = Math.max(0, ttl);
      this.addJob(`room:${roomId}`, retryIn);
      childLogger.debug(`Existed. Try again in ${retryIn} ms`);
      return prevCurrentTrack;
    }

    const queueId = `room:${roomId}`;
    const playedQueueId = `room:${roomId}:played`;
    const playedAt = new Date();

    let currentTrack: NowPlayingItemDbObject | null = null;
    let currentTrackDuration: number | null = null;

    const firstTrackInQueue = await this.services.Queue.shiftItem(queueId);

    if (firstTrackInQueue) {
      currentTrack = {
        ...firstTrackInQueue,
        playedAt,
      };

      const detailNextTrack = await this.services.Track.findOrCreate(
        currentTrack.trackId
      );

      if (!detailNextTrack) {
        childLogger.error(`Fail to get track. Retrying...`, {
          trackId: currentTrack.trackId,
        });
        this.addJob(`room:${roomId}`, 50);
        return null;
      }

      currentTrackDuration = detailNextTrack.duration;
    }

    if (currentTrack && currentTrackDuration) {
      await this.services.Queue.pushItems(playedQueueId, currentTrack);
      await this.services.NowPlaying.setById(
        `room:${roomId}`,
        currentTrack,
        currentTrackDuration
      );

      // Setup future job
      this.addJob(`room:${roomId}`, currentTrackDuration);
    }

    childLogger.debug({ currentTrack }, "Done");

    return currentTrack;
  }
}
