import { AuthenticationError, ForbiddenError } from "../error/index";
import { PUBSUB_CHANNELS, REDIS_KEY } from "../lib/constant";
import { NowPlayingWorker } from "./nowPlayingWorker";
import { NowPlayingReaction, NowPlayingReactionType } from "../types/index";

import type { QueueService } from "./queue";
import type { RoomService } from "./room";
import type { ServiceContext } from "./types";
import type { NowPlayingItemDbObject } from "../types/index";

export class NowPlayingService {
  constructor(
    private context: ServiceContext,
    private queueService: QueueService,
    private roomService: RoomService
  ) {}

  async findById(
    id: string,
    showPlayed?: boolean
  ): Promise<NowPlayingItemDbObject | null> {
    const currTrack: NowPlayingItemDbObject | null = await this.context.redis
      .get(REDIS_KEY.nowPlaying(id))
      .then((npStr) =>
        npStr
          ? (this.queueService.parseItem(npStr) as NowPlayingItemDbObject)
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

  async skipCurrentTrack(id: string): Promise<boolean> {
    if (!this.context.user) throw new AuthenticationError("");
    const room = await this.roomService.findById(id);
    if (!room) throw new ForbiddenError("Room does not exist");
    const currentTrack = await this.findById(id);
    if (!currentTrack) return false;
    if (
      room.creatorId !== this.context.user._id &&
      currentTrack.creatorId !== this.context.user._id
    )
      throw new AuthenticationError("You are not allowed to make changes");
    return Boolean(NowPlayingWorker.requestSkip(this.context.pubsub, id));
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

  async reactNowPlaying(id: string, reaction: NowPlayingReactionType) {
    if (!this.context.user) throw new AuthenticationError("");

    const currItem = await this.findById(id);
    if (!currItem) return null;

    // If the reaction already eists, the below returns 0 / does nothing
    const result = await this.context.redis.hset(
      REDIS_KEY.nowPlayingReaction(id, currItem.id),
      this.context.user._id,
      reaction
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
    const reactions: NowPlayingReaction = {
      id,
      mine: null,
      [NowPlayingReactionType.Heart]: 0,
      [NowPlayingReactionType.Cry]: 0,
      [NowPlayingReactionType.Joy]: 0,
      [NowPlayingReactionType.Fire]: 0,
    };
    if (currQueueItemId) {
      const allReactions = await this.getAllReactions(id, currQueueItemId);
      for (const eachReaction of allReactions) {
        reactions[eachReaction.reaction] += 1;
        if (eachReaction.userId === this.context.user?._id)
          reactions.mine = eachReaction.reaction;
      }
    }
    return reactions;
  }

  async getAllReactions(
    id: string,
    currQueueItemId: string
  ): Promise<{ userId: string; reaction: NowPlayingReactionType }[]> {
    const o = await this.context.redis.hgetall(
      REDIS_KEY.nowPlayingReaction(id, currQueueItemId)
    );
    return Object.entries(o).map(([userId, reaction]) => ({
      userId,
      reaction: reaction as NowPlayingReactionType,
    }));
  }
}
