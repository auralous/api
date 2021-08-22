import fastJson from "fast-json-stringify";
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
import type { ServiceContext } from "./types.js";

const itemStringify = fastJson({
  title: "Now Playing Queue Item",
  type: "object",
  properties: {
    uid: { type: "string" },
    trackId: { type: "string" },
    creatorId: { type: "string" },
    playedAt: { type: "string" },
    endedAt: { type: "string" },
  },
  required: ["uid", "trackId", "creatorId", "playedAt", "endedAt"],
});

export class NowPlayingService {
  constructor(private context: ServiceContext) {}

  static stringifyItem(currentTrack: NowPlayingQueueItem) {
    return itemStringify(currentTrack);
  }

  /**
   * Find the nowPlaying by session id
   * @param id the session id
   * @param showPlayed should show played nowPlaying (those with endedAt > now)
   */
  async findById(
    id: string,
    showPlayed?: boolean
  ): Promise<NowPlayingQueueItem | null> {
    const currTrack: NowPlayingQueueItem | null = await redis
      .get(REDIS_KEY.nowPlaying(id))
      .then((npStr) =>
        npStr
          ? (JSON.parse(npStr, (key, value) =>
              key === "playedAt" || key === "endedAt" ? new Date(value) : value
            ) as NowPlayingQueueItem)
          : null
      );
    if (!currTrack) return null;
    if (showPlayed !== true && currTrack.endedAt < new Date()) return null;
    return currTrack;
  }

  /**
   * Notify a change in nowPlaying
   * @param id the session id
   * @param currentTrack
   */
  async notifyNowPlayingChange(
    id: string,
    currentTrack: NowPlayingQueueItem | null
  ) {
    pubsub.publish(PUBSUB_CHANNELS.nowPlayingUpdated, {
      nowPlayingUpdated: {
        id,
        currentTrack,
      },
    });
  }

  /**
   * Skip current track
   * @param me The session creator or queue item owner
   * @param session
   */
  async skipCurrentTrack(
    me: AuthState | null,
    session: SessionDbObject | null
  ): Promise<boolean> {
    if (!me) throw new AuthenticationError("");
    if (!session) throw new ForbiddenError("Session does not exist");
    const currentTrack = await this.findById(String(session._id));
    if (!currentTrack) return false;
    if (session.creatorId !== me.userId && currentTrack.creatorId !== me.userId)
      throw new AuthenticationError("You are not allowed to make changes");
    return Boolean(NowPlayingWorker.requestSkip(pubsub, String(session._id)));
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

    const currItem = await this.findById(String(session._id));
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
    const currentTrack = await this.findById(id);
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
