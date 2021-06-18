import fastJson from "fast-json-stringify";
import { nanoid } from "nanoid/non-secure";
import { pubsub } from "../data/pubsub.js";
import { redis } from "../data/redis.js";
import { UserDbObject } from "../data/types.js";
import { AuthenticationError, ForbiddenError } from "../error/index.js";
import type {
  MutationQueueAddArgs,
  MutationQueueReorderArgs,
  MutationQueueToTopArgs,
  QueueItem,
} from "../graphql/graphql.gen.js";
import { PUBSUB_CHANNELS, REDIS_KEY } from "../utils/constant.js";
import { NowPlayingWorker } from "./nowPlayingWorker.js";
import { StoryService } from "./story.js";
import type { ServiceContext } from "./types.js";

const queueItemStringify = fastJson({
  title: "Queue Item",
  type: "object",
  properties: {
    uid: { type: "string" },
    trackId: { type: "string" },
    creatorId: { type: "string" },
  },
  required: ["uid", "trackId", "creatorId"],
});

function reorder<T>(list: T[], startIndex: number, endIndex: number): T[] {
  const result = Array.from(list);
  const [removed] = result.splice(startIndex, 1);
  result.splice(endIndex, 0, removed);
  return result;
}

export class QueueService {
  constructor(private context: ServiceContext) {}

  static stringifyQueueItem(item: QueueItem): string {
    return queueItemStringify(item);
  }

  static parseQueueItem(str: string): QueueItem {
    return JSON.parse(str);
  }

  private notifyUpdate(id: string) {
    pubsub.publish(PUBSUB_CHANNELS.queueUpdated, {
      queueUpdated: { id },
    });
  }

  /**
   * Find queue items by id
   * @param id
   * @param start
   * @param stop
   */
  async findById(id: string, start = 0, stop = -1): Promise<QueueItem[]> {
    return redis
      .lrange(REDIS_KEY.queue(id), start, stop)
      .then((res) => res.map(QueueService.parseQueueItem));
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
  async shiftItem(id: string): Promise<QueueItem | null> {
    const str = await redis.lpop(REDIS_KEY.queue(id));
    if (!str) return null;
    this.notifyUpdate(id);
    return QueueService.parseQueueItem(str);
  }

  /**
   * Push a queue item to the end
   * @param id
   * @param items
   */
  async pushItems(id: string, ...queueItems: QueueItem[]): Promise<number> {
    const count = await redis.rpush(
      REDIS_KEY.queue(id),
      ...queueItems.map((item) => QueueService.stringifyQueueItem(item))
    );
    if (count) this.notifyUpdate(id);
    return count;
  }

  async pushItemsPlayed(id: string, ...queueItems: QueueItem[]) {
    const count = await redis.rpush(
      REDIS_KEY.queue(`${id}:played`),
      ...queueItems.map((item) => QueueService.stringifyQueueItem(item))
    );
    return count;
  }

  /**
   * Reorder queue items
   * @param id
   * @param origin
   * @param dest
   */
  async reorderItems(id: string, origin: number, dest: number) {
    // FIXME: Redis linked list is not the best
    // data structure for reordering
    const allItems = await redis.lrange(REDIS_KEY.queue(id), 0, -1);
    await this.deleteById(id);
    const count = await redis.rpush(
      REDIS_KEY.queue(id),
      ...reorder(allItems, origin, dest)
    );
    this.notifyUpdate(id);
    return count;
  }

  /**
   * Remove queue items
   * @param ids
   */
  async removeItems(id: string, uids: string[]): Promise<number> {
    // FIXME: Redis linked list is not the best
    // data structure for this
    const deleteCount = 0;
    const allItems = await this.findById(id);
    await this.deleteById(id);

    const remainingItems = allItems
      .filter((item) => !uids.includes(item.uid))
      .map(QueueService.stringifyQueueItem);

    if (remainingItems.length > 0) {
      await redis.rpush(REDIS_KEY.queue(id), ...remainingItems);
    }

    if (remainingItems.length !== allItems.length) this.notifyUpdate(id);
    return deleteCount;
  }

  /**
   * Move some items to the top
   */
  async toTopItems(id: string, uids: string[]): Promise<number> {
    const allItems = await this.findById(id);
    const movingItems: QueueItem[] = [];
    const resultingItems = allItems.filter((item) => {
      if (uids.includes(item.uid)) {
        movingItems.push(item);
        return false;
      }
      return true;
    });
    if (movingItems.length > 0) {
      resultingItems.unshift(...movingItems);
      await this.deleteById(id);
      await redis.rpush(
        REDIS_KEY.queue(id),
        ...resultingItems.map(QueueService.stringifyQueueItem)
      );
      this.notifyUpdate(id);
    }
    return movingItems.length;
  }

  /**
   * Delete a queue
   * @param id
   */
  async deleteById(id: string) {
    return redis.del(REDIS_KEY.queue(id));
  }

  async assertStoryQueueActionable<TMe extends UserDbObject | null>(
    me: TMe,
    storyId: string
  ) {
    if (!me) throw new AuthenticationError("");
    const story = await new StoryService(this.context).findById(storyId);
    if (!story) throw new ForbiddenError("Story does not exist");
    if (!story.isLive) throw new ForbiddenError("Story is no longer live");
    if (!StoryService.getPermission(me, story).isQueueable)
      throw new ForbiddenError("You are not allowed to add to this queue");
    return true;
  }

  /**
   * Execute a queue action
   * Usually a public API to GraphQL
   * @param me
   * @param story
   * @param actions
   */
  async executeQueueAction(
    me: UserDbObject,
    id: string,
    actions: {
      add?: Omit<MutationQueueAddArgs, "id">;
      reorder?: Omit<MutationQueueReorderArgs, "id">;
      remove?: string[];
      toTop?: Omit<MutationQueueToTopArgs, "id">;
    }
  ) {
    if (!me) throw new AuthenticationError("");

    if (actions.add) {
      await this.pushItems(
        id,
        ...actions.add.tracks.map((trackId) => ({
          uid: nanoid(6),
          trackId,
          creatorId: me._id,
        }))
      );

      // It is possible that adding a new item will restart nowPlaying
      NowPlayingWorker.requestResolve(pubsub, id);

      return true;
    } else if (actions.remove) {
      return Boolean(await this.removeItems(id, actions.remove));
    } else if (actions.reorder) {
      await this.reorderItems(
        id,
        actions.reorder.position,
        actions.reorder.insertPosition
      );
      return true;
    } else if (actions.toTop) {
      await this.toTopItems(id, actions.toTop.uids);
    }
    return false;
  }
}
