import fastJson from "fast-json-stringify";
import { pubsub } from "../data/pubsub.js";
import { redis } from "../data/redis.js";
import type {
  QueueItemDbObject,
  StoryDbObject,
  UserDbObject,
} from "../data/types.js";
import { AuthenticationError, ForbiddenError } from "../error/index.js";
import type {
  MutationQueueAddArgs,
  MutationQueueRemoveArgs,
  MutationQueueReorderArgs,
} from "../graphql/graphql.gen.js";
import { PUBSUB_CHANNELS, REDIS_KEY } from "../utils/constant.js";
import { NowPlayingWorker } from "./nowPlayingWorker.js";
import { StoryService } from "./story.js";
import type { ServiceContext } from "./types.js";

const queueItemStringify = fastJson({
  title: "Queue Item",
  type: "object",
  properties: {
    trackId: { type: "string" },
    creatorId: { type: "string" },
  },
  required: ["trackId", "creatorId"],
});

function reorder<T>(list: T[], startIndex: number, endIndex: number): T[] {
  const result = Array.from(list);
  const [removed] = result.splice(startIndex, 1);
  result.splice(endIndex, 0, removed);
  return result;
}

export class QueueService {
  constructor(private context: ServiceContext) {}

  static stringifyQueueItem(item: QueueItemDbObject): string {
    return queueItemStringify(item);
  }

  private notifyUpdate(id: string) {
    pubsub.publish(PUBSUB_CHANNELS.queueUpdated, {
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
    return redis
      .lrange(REDIS_KEY.queue(id, played), start, stop)
      .then((res) => res.map((it) => JSON.parse(it)));
  }

  /**
   * Get length of queue
   * @param id
   */
  async lengthById(id: string): Promise<number> {
    return redis.llen(REDIS_KEY.queue(id));
  }

  /**
   * Shift an queue item (take out the first one)
   * @param id
   */
  async shiftItem(id: string): Promise<QueueItemDbObject | null> {
    const str = await redis.lpop(REDIS_KEY.queue(id));
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
    const count = await redis.rpush(
      REDIS_KEY.queue(storyId),
      ...queueItems.map((item) => QueueService.stringifyQueueItem(item))
    );
    if (count) this.notifyUpdate(storyId);
    return count;
  }

  async pushItemsPlayed(storyId: string, ...queueItems: QueueItemDbObject[]) {
    const count = await redis.rpush(
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
    const allItems = await redis.lrange(REDIS_KEY.queue(storyId), 0, -1);
    await this.deleteById(storyId);
    const count = await redis.rpush(
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
    const count = await redis.lrem(
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
    return redis.del(REDIS_KEY.queue(storyId));
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
      NowPlayingWorker.requestResolve(pubsub, String(story._id));

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
