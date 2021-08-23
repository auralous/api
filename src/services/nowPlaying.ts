import { AuthState } from "../auth/types.js";
import { pubsub } from "../data/pubsub.js";
import { redis } from "../data/redis.js";
import type { SessionDbObject } from "../data/types.js";
import { AuthenticationError, ForbiddenError } from "../error/index.js";
import type {
  NowPlayingQueueItem,
  NowPlayingReactionItem,
  NowPlayingReactionType,
} from "../graphql/graphql.gen.js";
import { PUBSUB_CHANNELS, REDIS_KEY } from "../utils/constant.js";
import { NowPlayingWorker } from "./nowPlayingWorker.js";
import { QueueService } from "./queue.js";
import type { ServiceContext } from "./types.js";

export class NowPlayingService {
  constructor(private context: ServiceContext) {}

  /**
   * Find the nowPlaying by session id
   * @param id the session id
   * @param showPlayed should show played nowPlaying (those with endedAt > now)
   */
  async findCurrentItemById(
    id: string,
    showPlayed?: boolean
  ): Promise<NowPlayingQueueItem | null> {
    // See src/data/types.ts#NowPlayingStateRedisValue
    const nowPlayingState = await NowPlayingWorker.getFormattedNowPlayingState(
      id
    );

    if (!nowPlayingState.queuePlayingUid) return null;

    if (!nowPlayingState.playedAt || !nowPlayingState.endedAt)
      throw new Error(
        `Found queuePlayingUid but not playedAt and endedAt for ${id}`
      );

    if (showPlayed !== true && nowPlayingState.endedAt.getTime() < Date.now())
      return null;

    const queueItemData = await new QueueService(
      this.context
    ).findQueueItemData(id, nowPlayingState.queuePlayingUid);

    if (!queueItemData)
      throw new Error(
        `Cannot find nowPlaying queueItemData for id = ${id} and queuePlayingUid = ${nowPlayingState.queuePlayingUid}`
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
   * @param me
   * @param session
   * @returns
   */
  async skipForward(me: AuthState | null, session: SessionDbObject | null) {
    if (!me) throw new AuthenticationError("");
    if (!session) throw new ForbiddenError("Session does not exist");
    if (!session.collaboratorIds.includes(me.userId))
      throw new AuthenticationError("You are not allowed to make changes");
    return Boolean(NowPlayingWorker.skipForward(String(session._id)));
  }

  /**
   * Skip backward current track
   * @param me
   * @param session
   * @returns
   */
  async skipBackward(me: AuthState | null, session: SessionDbObject | null) {
    if (!me) throw new AuthenticationError("");
    if (!session) throw new ForbiddenError("Session does not exist");
    if (!session.collaboratorIds.includes(me.userId))
      throw new AuthenticationError("You are not allowed to make changes");
    return Boolean(NowPlayingWorker.skipBackward(String(session._id)));
  }

  async playUid(
    me: AuthState | null,
    session: SessionDbObject | null,
    uid: string
  ) {
    if (!me) throw new AuthenticationError("");
    if (!session) throw new ForbiddenError("Session does not exist");
    if (!session.collaboratorIds.includes(me.userId))
      throw new AuthenticationError("You are not allowed to make changes");
    return Boolean(NowPlayingWorker.playUid(String(session._id), uid));
  }

  // NowPlaying Reaction
  // A redis set whose items are `{userId}|{reactionType}`
  private async notifyReactionUpdate(id: string) {
    pubsub.publish(PUBSUB_CHANNELS.nowPlayingReactionsUpdated, {
      nowPlayingReactionsUpdated: await this.getAllReactions(id),
      id,
    });
  }

  /**
   * React to a nowPlaying
   * @param me
   * @param session
   * @param reaction
   */
  async reactNowPlaying(
    me: AuthState | null,
    session: SessionDbObject | null,
    reaction: NowPlayingReactionType
  ) {
    if (!me) throw new AuthenticationError("");

    if (!session) throw new ForbiddenError("Session is not found");

    const currItem = await this.findCurrentItemById(String(session._id));
    if (!currItem) return null;

    // If the reaction already eists, the below returns 0 / does nothing
    const result = await redis.hset(
      REDIS_KEY.nowPlayingReaction(String(session._id), currItem.uid),
      me.userId,
      reaction
    );

    if (result) {
      // Only publish if a reaction is added
      this.notifyReactionUpdate(String(session._id));
    }
  }

  async getAllReactions(id: string): Promise<NowPlayingReactionItem[]> {
    const currentTrack = await this.findCurrentItemById(id);
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
