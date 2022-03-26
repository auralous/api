import { pubsub } from "../data/pubsub.js";
import { redis } from "../data/redis.js";
import { NotFoundError, UnauthorizedError } from "../error/errors.js";
import type { NowPlayingReactionItem } from "../graphql/graphql.gen.js";
import { PUBSUB_CHANNELS, REDIS_KEY } from "../utils/constant.js";
import { NowPlayingService } from "./nowPlaying.js";
import { SessionService } from "./session.js";
import type { ServiceContext } from "./types.js";

export type NowPlayingReactionType =
  typeof NowPlayingReactionService.ALLOWED_REACTIONS[number];

export class NowPlayingReactionService {
  static ALLOWED_REACTIONS = ["❤️", "✨", "🔥", "😢"] as const;
  // NowPlaying Reaction
  // A redis set whose items are `{userId}|{reactionType}`
  static async notifyUpdate(id: string) {
    pubsub.publish(PUBSUB_CHANNELS.nowPlayingReactionsUpdated, {
      nowPlayingReactionsUpdated: await NowPlayingReactionService.getAll(id),
      id,
    });
  }

  /**
   * React to a nowPlaying
   */
  static async addReaction(
    context: ServiceContext,
    id: string,
    reaction: NowPlayingReactionType | null
  ) {
    if (!context.auth) throw new UnauthorizedError();

    if (
      reaction &&
      !NowPlayingReactionService.ALLOWED_REACTIONS.includes(reaction)
    ) {
      throw new Error("Reaction not allowed");
    }

    const session = await SessionService.findById(context, id);
    if (!session) throw new NotFoundError("session", id);

    const currItem = await NowPlayingService.findCurrentItemById(
      String(session._id)
    );
    if (!currItem) return null;

    const redisKey = REDIS_KEY.nowPlayingReaction(
      String(session._id),
      currItem.uid
    );
    if (reaction) {
      await redis.hset(redisKey, context.auth.userId, reaction);
    } else {
      await redis.hdel(redisKey, context.auth.userId);
    }

    // Only publish if a reaction is added
    NowPlayingReactionService.notifyUpdate(String(session._id));
  }

  static async getAll(id: string): Promise<NowPlayingReactionItem[]> {
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
