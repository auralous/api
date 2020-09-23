import { AuthenticationError } from "apollo-server-errors";
import { BaseModel, ModelInit } from "./base";
import { getByPattern } from "../db/redis";
import { REDIS_KEY } from "../lib/constant";
import { NowPlayingItemDbObject } from "../types/db";
import { INowPlayingReactionType } from "../types/resolvers.gen";

export class NowPlayingModel extends BaseModel {
  constructor(options: ModelInit) {
    super(options);
  }

  async findById(id: string): Promise<NowPlayingItemDbObject | null> {
    return this.context.redis
      .get(REDIS_KEY.nowPlaying(id))
      .then((npStr) => (npStr ? JSON.parse(npStr) : null));
  }

  ttl(id: string) {
    return this.context.redis.pttl(REDIS_KEY.nowPlaying(id));
  }

  async setById(
    id: string,
    queueItem: NowPlayingItemDbObject,
    duration: number
  ) {
    await this.context.redis.set(
      REDIS_KEY.nowPlaying(id),
      this.services.Queue.stringifyItem(queueItem),
      "PX",
      Math.max(duration - 2000, 0)
    );

    this.context.pubsub.publish("NOW_PLAYING_UPDATED", {
      nowPlayingUpdated: {
        id,
        currentTrack: queueItem,
      },
    });

    // Update reactions
    this.context.pubsub.publish("NOW_PLAYING_REACTION_UPDATED", {
      nowPlayingReactionUpdated: { id },
    });
  }

  async removeById(id: string) {
    return this.context.redis.del(REDIS_KEY.nowPlaying(id));
  }

  async reactNowPlaying(id: string, reaction: INowPlayingReactionType) {
    if (!this.context.user) throw new AuthenticationError("");

    const currItem = await this.findById(id);
    if (!currItem) return null;

    await this.context.redis.setnx(
      REDIS_KEY.nowPlayingReaction(id, currItem.id, this.context.user._id),
      reaction
    );

    this.context.pubsub.publish("NOW_PLAYING_REACTION_UPDATED", {
      nowPlayingReactionUpdated: { id },
    });
  }

  async getReactionByMe(id: string) {
    if (!this.context.user) return null;
    const currItem = await this.findById(id);
    if (!currItem) return null;

    return this.context.redis.get(
      REDIS_KEY.nowPlayingReaction(id, currItem.id, this.context.user._id)
    ) as Promise<INowPlayingReactionType | null>;
  }

  async getAllReactions(id: string) {
    const currItem = await this.findById(id);
    if (!currItem) return null;
    return getByPattern(
      this.context.redis,
      REDIS_KEY.nowPlayingReaction(id, currItem.id, "*")
    );
  }
}
