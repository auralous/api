import { pubsub } from "../data/pubsub.js";
import { redis } from "../data/redis.js";
import {
  CustomError,
  NotFoundError,
  UnauthorizedError,
} from "../error/errors.js";
import type {
  NowPlayingQueueItem,
  NowPlayingReactionItem,
  NowPlayingReactionType,
} from "../graphql/graphql.gen.js";
import { PUBSUB_CHANNELS, REDIS_KEY } from "../utils/constant.js";
import { NowPlayingWorker } from "./nowPlayingWorker.js";
import { QueueService } from "./queue.js";
import { SessionService } from "./session.js";
import { ServiceContext } from "./types.js";

export class NowPlayingService {
  /**
   * Find the nowPlaying by session id
   */
  static async findCurrentItemById(
    id: string,
    showPlayed?: boolean
  ): Promise<NowPlayingQueueItem | null> {
    // See src/data/types.ts#NowPlayingStateRedisValue
    const nowPlayingState = await NowPlayingWorker.getFormattedNowPlayingState(
      id
    );

    if (showPlayed !== true && nowPlayingState.endedAt.getTime() < Date.now())
      return null;

    const queueItemData = await QueueService.findQueueItemData(
      id,
      nowPlayingState.queuePlayingUid
    );

    if (!queueItemData)
      throw new Error(
        `QueueItem is null for id = ${id}, uid = ${nowPlayingState.queuePlayingUid}`
      );

    return {
      uid: nowPlayingState.queuePlayingUid,
      ...queueItemData,
      playedAt: nowPlayingState.playedAt,
      endedAt: nowPlayingState.endedAt,
    };
  }

  /**
   * Skip forward current track
   */
  static async skipForward(context: ServiceContext, id: string) {
    if (!context.auth) throw new UnauthorizedError();
    const session = await SessionService.findById(context, id);
    if (!session) throw new NotFoundError("session", id);
    if (!session.collaboratorIds.includes(context.auth.userId))
      throw new CustomError("error.not_collaborator");
    return Boolean(NowPlayingWorker.skipForward(String(session._id)));
  }

  /**
   * Skip backward current track
   */
  static async skipBackward(context: ServiceContext, id: string) {
    if (!context.auth) throw new UnauthorizedError();
    const session = await SessionService.findById(context, id);
    if (!session) throw new NotFoundError("session", id);
    if (!session.collaboratorIds.includes(context.auth.userId))
      throw new CustomError("error.not_collaborator");
    return Boolean(NowPlayingWorker.skipBackward(String(session._id)));
  }

  static async playUid(context: ServiceContext, id: string, uid: string) {
    if (!context.auth) throw new UnauthorizedError();
    const session = await SessionService.findById(context, id);
    if (!session) throw new NotFoundError("session", id);
    if (!session.collaboratorIds.includes(context.auth.userId))
      throw new CustomError("error.not_collaborator");
    return Boolean(NowPlayingWorker.playUid(String(session._id), uid));
  }

  // NowPlaying Reaction
  // A redis set whose items are `{userId}|{reactionType}`
  private static async notifyReactionUpdate(id: string) {
    pubsub.publish(PUBSUB_CHANNELS.nowPlayingReactionsUpdated, {
      nowPlayingReactionsUpdated: await NowPlayingService.getAllReactions(id),
      id,
    });
  }

  /**
   * React to a nowPlaying
   */
  static async reactNowPlaying(
    context: ServiceContext,
    id: string,
    reaction: NowPlayingReactionType
  ) {
    if (!context.auth) throw new UnauthorizedError();

    const session = await SessionService.findById(context, id);
    if (!session) throw new NotFoundError("session", id);

    const currItem = await NowPlayingService.findCurrentItemById(
      String(session._id)
    );
    if (!currItem) return null;

    // If the reaction already eists, the below returns 0 / does nothing
    const result = await redis.hset(
      REDIS_KEY.nowPlayingReaction(String(session._id), currItem.uid),
      context.auth.userId,
      reaction
    );

    if (result) {
      // Only publish if a reaction is added
      NowPlayingService.notifyReactionUpdate(String(session._id));
    }
  }

  static async getAllReactions(id: string): Promise<NowPlayingReactionItem[]> {
    const currentTrack = await NowPlayingService.findCurrentItemById(id);
    if (!currentTrack) return [];
    const o = await redis.hgetall(
      REDIS_KEY.nowPlayingReaction(id, currentTrack.uid)
    );
    return Object.entries(o).map(([userId, reaction]) => ({
      userId,
      reaction: reaction as NowPlayingReactionType,
    }));
  }
}
