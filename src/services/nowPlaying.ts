import { AuthenticationError } from "apollo-server-errors";
import { BaseService, ServiceInit } from "./base";
import { PUBSUB_CHANNELS, REDIS_KEY } from "../lib/constant";
import { NowPlayingItemDbObject } from "../types/db";
import { INowPlayingReactionType } from "../types/resolvers.gen";

export class NowPlayingService extends BaseService {
  constructor(options: ServiceInit) {
    super(options);
  }

  async findById(
    id: string,
    showPlayed?: boolean
  ): Promise<NowPlayingItemDbObject | null> {
    const currTrack: NowPlayingItemDbObject | null = await this.context.redis
      .get(REDIS_KEY.nowPlaying(id))
      .then((npStr) =>
        npStr
          ? (this.services.Queue.parseItem(npStr) as NowPlayingItemDbObject)
          : null
      );
    if (!currTrack) return null;
    if (showPlayed !== true && currTrack.endedAt < new Date()) return null;
    return currTrack;
  }

  async notifyUpdate(id: string, currentTrack: NowPlayingItemDbObject | null) {
    this.context.pubsub.publish(PUBSUB_CHANNELS.nowPlayingUpdated, {
      nowPlayingUpdated: {
        id,
        currentTrack,
      },
    });
  }

  async requestResolve(id: string) {
    if (!(await this.findById(id)))
      return this.context.pubsub.pub.publish(
        PUBSUB_CHANNELS.nowPlayingResolve,
        id
      );
  }

  async setById(id: string, queueItem: NowPlayingItemDbObject) {
    await this.context.redis.set(
      REDIS_KEY.nowPlaying(id),
      this.services.Queue.stringifyItem(queueItem)
    );
  }

  async removeById(id: string) {
    return this.context.redis.del(REDIS_KEY.nowPlaying(id));
  }

  // NowPlaying Reaction
  // A redis set whose items are `{userId}|{reactionType}`
  async notifyReactionUpdate(id: string, currQueueItemId: string | undefined) {
    this.context.pubsub.publish(PUBSUB_CHANNELS.nowPlayingReactionsUpdated, {
      nowPlayingReactionsUpdated: await this._getReactionsCountAndMine(
        id,
        currQueueItemId
      ),
    });
  }

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
      this.notifyReactionUpdate(id, currItem.id);
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
