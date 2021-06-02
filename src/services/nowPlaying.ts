import fastJson from "fast-json-stringify";
import { pubsub } from "../data/pubsub.js";
import { redis } from "../data/redis.js";
import type {
  NowPlayingItemDbObject,
  StoryDbObject,
  UserDbObject,
} from "../data/types.js";
import { AuthenticationError, ForbiddenError } from "../error/index.js";
import type {
  NowPlayingReactionItem,
  NowPlayingReactionType,
} from "../graphql/graphql.gen.js";
import { PUBSUB_CHANNELS, REDIS_KEY } from "../utils/constant.js";
import { NowPlayingWorker } from "./nowPlayingWorker.js";
import { StoryService } from "./story.js";
import type { ServiceContext } from "./types.js";

const itemStringify = fastJson({
  title: "Now Playing Queue Item",
  type: "object",
  properties: {
    index: { type: "number" },
    trackId: { type: "string" },
    creatorId: { type: "string" },
    playedAt: { type: "string" },
    endedAt: { type: "string" },
  },
  required: ["index", "trackId", "creatorId", "playedAt", "endedAt"],
});

export class NowPlayingService {
  constructor(private context: ServiceContext) {}

  static stringifyItem(currentTrack: NowPlayingItemDbObject) {
    return itemStringify(currentTrack);
  }

  /**
   * Find the nowPlaying by story id
   * @param id the story id
   * @param showPlayed should show played nowPlaying (those with endedAt > now)
   */
  async findById(
    id: string,
    showPlayed?: boolean
  ): Promise<NowPlayingItemDbObject | null> {
    const currTrack: NowPlayingItemDbObject | null = await redis
      .get(REDIS_KEY.nowPlaying(id))
      .then((npStr) =>
        npStr
          ? (JSON.parse(npStr, (key, value) =>
              key === "playedAt" || key === "endedAt" ? new Date(value) : value
            ) as NowPlayingItemDbObject)
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
    pubsub.publish(PUBSUB_CHANNELS.nowPlayingUpdated, {
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
    return Boolean(NowPlayingWorker.requestSkip(pubsub, String(story._id)));
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
   * @param story
   * @param reaction
   */
  async reactNowPlaying(
    me: UserDbObject | null,
    story: StoryDbObject | null,
    reaction: NowPlayingReactionType
  ) {
    if (!me) throw new AuthenticationError("");

    if (!story || !StoryService.getPermission(me, story).isViewable)
      throw new ForbiddenError("");

    const currItem = await this.findById(String(story._id));
    if (!currItem) return null;

    // If the reaction already eists, the below returns 0 / does nothing
    const result = await redis.hset(
      REDIS_KEY.nowPlayingReaction(String(story._id), currItem.index),
      me._id,
      reaction
    );

    if (result) {
      // Only publish if a reaction is added
      this.notifyReactionUpdate(String(story._id));
    }
  }

  async getAllReactions(id: string): Promise<NowPlayingReactionItem[]> {
    const currentTrack = await this.findById(id);
    if (!currentTrack) return [];
    const o = await redis.hgetall(
      REDIS_KEY.nowPlayingReaction(id, currentTrack.index)
    );
    return Object.entries(o).map(([userId, reaction]) => ({
      userId,
      reaction: reaction as NowPlayingReactionType,
    }));
  }
}
