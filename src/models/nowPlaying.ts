import { AuthenticationError } from "apollo-server-errors";
import { BaseModel, ModelInit } from "./base";
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

    this.context.pubsub.publish("NOW_PLAYING_REACTIONS_UPDATED", {
      nowPlayingReactionsUpdated: await this._getReactionsCountAndMine(
        id,
        undefined
      ),
    });
  }

  async removeById(id: string) {
    return this.context.redis.del(REDIS_KEY.nowPlaying(id));
  }

  // NowPlaying Reaction
  // A redis set whose items are `{userId}|{reactionType}`
  async reactNowPlaying(id: string, reaction: INowPlayingReactionType) {
    if (!this.context.user) throw new AuthenticationError("");

    const currItem = await this.findById(id);
    if (!currItem) return null;

    // If the reaction already eists, the below returns 0 / does nothing
    const result = await this.context.redis.sadd(
      REDIS_KEY.nowPlayingReaction(id, currItem.id),
      `${this.context.user._id}|${reaction}`
    );

    if (result) {
      // Only publish if a reaction is added
      this.context.pubsub.publish("NOW_PLAYING_REACTIONS_UPDATED", {
        nowPlayingReactionsUpdated: await this._getReactionsCountAndMine(
          id,
          currItem.id
        ),
      });
    }
  }

  async _getReactionsCountAndMine(
    id: string,
    currQueueItemId: string | undefined
  ) {
    const reactions = {
      id,
      mine: [] as INowPlayingReactionType[],
      [INowPlayingReactionType.Heart]: 0,
      [INowPlayingReactionType.Crying]: 0,
      [INowPlayingReactionType.TearJoy]: 0,
      [INowPlayingReactionType.Fire]: 0,
    };
    if (currQueueItemId) {
      const allReactions = await this.getAllReactions(id, currQueueItemId);
      for (const eachReaction of allReactions) {
        reactions[eachReaction.reaction] += 1;
        if (eachReaction.userId === this.context.user?._id)
          reactions.mine.push(eachReaction.reaction);
      }
    }
    return reactions;
  }

  async getAllReactions(
    id: string,
    currQueueItemId: string
  ): Promise<{ userId: string; reaction: INowPlayingReactionType }[]> {
    const arr = await this.context.redis.smembers(
      REDIS_KEY.nowPlayingReaction(id, currQueueItemId)
    );
    return arr.map((str) => {
      const [userId, reaction] = str.split("|");
      return { userId, reaction: reaction as INowPlayingReactionType };
    });
  }
}
