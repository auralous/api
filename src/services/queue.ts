import fastJson from "fast-json-stringify";
import { AuthenticationError, ForbiddenError } from "../error";
import { PUBSUB_CHANNELS, REDIS_KEY } from "../lib/constant";
import { reorder } from "../lib/utils";
import {
  MutationQueueAddArgs,
  MutationQueueRemoveArgs,
  MutationQueueReorderArgs,
} from "../types/graphql.gen";
import type {
  QueueItemDbObject,
  StoryDbObject,
  UserDbObject,
} from "../types/index";
import { NowPlayingWorker } from "./nowPlayingWorker";
import { StoryService } from "./story";
import type { ServiceContext } from "./types";

const queueItemStringify = fastJson({
  title: "Queue Item",
  type: "object",
  properties: {
    trackId: { type: "string" },
    creatorId: { type: "string" },
  },
  required: ["trackId", "creatorId"],
});

export class QueueService {
  constructor(private context: ServiceContext) {}

  static stringifyQueueItem(item: QueueItemDbObject): string {
    return queueItemStringify(item);
  }

  private notifyUpdate(id: string) {
    this.context.pubsub.publish(PUBSUB_CHANNELS.queueUpdated, {
      queueUpdated: { id },
    });
  }

  /**
   * Find queue items by id
   * @param id storyId
   * @param start
   * @param stop
   */
  async findById(
    id: string,
    start = 0,
    stop = -1,
    played?: boolean
  ): Promise<QueueItemDbObject[]> {
    return this.context.redis
      .lrange(REDIS_KEY.queue(id, played), start, stop)
      .then((res) => res.map((it) => JSON.parse(it)));
  }

  /**
   * Get length of queue
   * @param id
   */
  async lengthById(id: string): Promise<number> {
    return this.context.redis.llen(REDIS_KEY.queue(id));
  }

  /**
   * Shift an queue item (take out the first one)
   * @param id
   */
  async shiftItem(id: string): Promise<QueueItemDbObject | null> {
    const str = await this.context.redis.lpop(REDIS_KEY.queue(id));
    if (!str) return null;
    this.notifyUpdate(id);
    return JSON.parse(str);
  }

  /**
   * Push a queue item to the end
   * @param storyId
   * @param items
   */
  async pushItems(
    storyId: string,
    ...queueItems: QueueItemDbObject[]
  ): Promise<number> {
    const count = await this.context.redis.rpush(
      REDIS_KEY.queue(storyId),
      ...queueItems.map((item) => QueueService.stringifyQueueItem(item))
    );
    if (count) this.notifyUpdate(storyId);
    return count;
  }

  async pushItemsPlayed(storyId: string, ...queueItems: QueueItemDbObject[]) {
    const count = await this.context.redis.rpush(
      REDIS_KEY.queue(storyId, true),
      ...queueItems.map((item) => QueueService.stringifyQueueItem(item))
    );
    return count;
  }

  /**
   * Reorder queue items
   * @param storyId
   * @param origin
   * @param dest
   */
  async reorderItems(storyId: string, origin: number, dest: number) {
    // FIXME: Need better performant strategy
    const allItems = await this.context.redis.lrange(
      REDIS_KEY.queue(storyId),
      0,
      -1
    );
    await this.deleteById(storyId);
    const count = await this.context.redis.rpush(
      REDIS_KEY.queue(storyId),
      reorder(allItems, origin, dest)
    );
    this.notifyUpdate(storyId);
    return count;
  }

  /**
   * Remove a queue item
   * @param storyId
   * @param pos
   */
  async removeItem(
    storyId: string,
    removeArg: Omit<MutationQueueRemoveArgs, "id">
  ): Promise<number> {
    // redis does not have remove item from list by index
    const count = await this.context.redis.lrem(
      REDIS_KEY.queue(storyId),
      1,
      QueueService.stringifyQueueItem(removeArg)
    );
    if (count) this.notifyUpdate(storyId);
    return count;
  }

  /**
   * Delete a queue item
   * @param storyId
   */
  async deleteById(storyId: string) {
    return this.context.redis.del(REDIS_KEY.queue(storyId));
  }

  /**
   * Execute a queue action
   * Usually a public API to GraphQL
   * @param me
   * @param story
   * @param actions
   */
  async executeQueueAction(
    me: UserDbObject | null,
    story: StoryDbObject | null,
    actions: {
      add?: Omit<MutationQueueAddArgs, "id">;
      reorder?: Omit<MutationQueueReorderArgs, "id">;
      remove?: Omit<MutationQueueRemoveArgs, "id">;
    }
  ) {
    if (!story) throw new ForbiddenError("Story does not exist");

    const id = String(story._id);
    if (!me) throw new AuthenticationError("");

    if (!story.isLive) throw new ForbiddenError("Story is no longer live");

    if (!StoryService.getPermission(me, story).isQueueable)
      throw new ForbiddenError("You are not allowed to add to this queue");

    if (actions.add) {
      await this.pushItems(
        id,
        ...actions.add.tracks.map((trackId) => ({
          trackId,
          creatorId: me._id,
        }))
      );

      // It is possible that adding a new item will restart nowPlaying
      NowPlayingWorker.requestResolve(this.context.pubsub, String(story._id));

      return true;
    } else if (actions.remove) {
      return Boolean(await this.removeItem(id, actions.remove));
    } else if (actions.reorder) {
      await this.reorderItems(
        id,
        actions.reorder.position,
        actions.reorder.insertPosition
      );
      return true;
    }
    return false;
  }
}
