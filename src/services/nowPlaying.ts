import { AuthenticationError, ForbiddenError } from "../error/index";
import { PUBSUB_CHANNELS, REDIS_KEY } from "../lib/constant";
import { NowPlayingWorker } from "./nowPlayingWorker";
import {
  NowPlayingReaction,
  NowPlayingReactionType,
  StoryDbObject,
} from "../types/index";

import type { ServiceContext } from "./types";
import type { NowPlayingItemDbObject, UserDbObject } from "../types/index";
import { QueueService } from "./queue";
import { StoryService } from "./story";

export class NowPlayingService {
  constructor(private context: ServiceContext) {}

  /**
   * Find the nowPlaying by story id
   * @param id the story id
   * @param showPlayed should show played nowPlaying (those with endedAt > now)
   */
  async findById(
    id: string,
    showPlayed?: boolean
  ): Promise<NowPlayingItemDbObject | null> {
    const currTrack: NowPlayingItemDbObject | null = await this.context.redis
      .get(REDIS_KEY.nowPlaying(id))
      .then((npStr) =>
        npStr
          ? (QueueService.parseQueue(npStr) as NowPlayingItemDbObject)
          : null
      );
    if (!currTrack) return null;
    if (showPlayed !== true && currTrack.endedAt < new Date()) return null;
    return currTrack;
  }

  /**
   * Notify a change in nowPlaying
   * @param id the story id
   * @param currentTrack
   */
  async notifyNowPlayingChange(
    id: string,
    currentTrack: NowPlayingItemDbObject | null
  ) {
    this.context.pubsub.publish(PUBSUB_CHANNELS.nowPlayingUpdated, {
      nowPlayingUpdated: {
        id,
        currentTrack,
      },
    });
  }

  /**
   * Skip current track
   * @param me The story creator or queue item owner
   * @param story
   */
  async skipCurrentTrack(
    me: UserDbObject | null,
    story: StoryDbObject | null
  ): Promise<boolean> {
    if (!me) throw new AuthenticationError("");
    if (!story) throw new ForbiddenError("Story does not exist");
    const currentTrack = await this.findById(String(story._id));
    if (!currentTrack) return false;
    if (story.creatorId !== me._id && currentTrack.creatorId !== me._id)
      throw new AuthenticationError("You are not allowed to make changes");
    return Boolean(
      NowPlayingWorker.requestSkip(this.context.pubsub, String(story._id))
    );
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

  /**
   * React to a nowPlaying
   * @param me
   * @param story
   * @param reaction
   */
  async reactNowPlaying(
    me: UserDbObject | null,
    story: StoryDbObject | null,
    reaction: NowPlayingReactionType
  ) {
    if (!me) throw new AuthenticationError("");

    if (!story || StoryService.getPermission(me, story).isViewable)
      throw new ForbiddenError("");

    const currItem = await this.findById(String(story._id));
    if (!currItem) return null;

    // If the reaction already eists, the below returns 0 / does nothing
    const result = await this.context.redis.hset(
      REDIS_KEY.nowPlayingReaction(String(story._id), currItem.id),
      me._id,
      reaction
    );

    if (result) {
      // Only publish if a reaction is added
      this.notifyReactionUpdate(String(story._id), currItem.id);
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
