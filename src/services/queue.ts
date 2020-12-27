import { nanoid } from "nanoid/non-secure";
import fastJson from "fast-json-stringify";
import { reorder } from "../lib/utils";
import { REDIS_KEY, PUBSUB_CHANNELS } from "../lib/constant";

import type { ServiceContext } from "./types";
import type {
  NowPlayingItemDbObject,
  QueueItemDbObject,
  StoryDbObject,
  UserDbObject,
} from "../types/index";
import { AuthenticationError, ForbiddenError, UserInputError } from "../error";
import { StoryService } from "./story";
import { QueueAction } from "../types/graphql.gen";
import { NowPlayingWorker } from "./nowPlayingWorker";

const queueItemStringify = fastJson({
  title: "Queue Item",
  type: "object",
  properties: {
    id: { type: "string" },
    trackId: { type: "string" },
    creatorId: { type: "string" },
    // additional props
    playedAt: { type: "string" },
    endedAt: { type: "string" },
  },
  required: ["id", "trackId", "creatorId"],
});

export class QueueService {
  constructor(private context: ServiceContext) {}

  notifyUpdate(id: string) {
    this.context.pubsub.publish(PUBSUB_CHANNELS.queueUpdated, {
      queueUpdated: { id },
    });
  }

  static stringifyQueue(item: QueueItemDbObject): string {
    return queueItemStringify(item);
  }

  static parseQueue(str: string): QueueItemDbObject | NowPlayingItemDbObject {
    return JSON.parse(str, (key, value) =>
      key === "playedAt" || key === "endedAt" ? new Date(value) : value
    );
  }

  static randomItemId(): string {
    return nanoid(4);
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
    stop = -1
  ): Promise<QueueItemDbObject[]> {
    return this.context.redis
      .lrange(REDIS_KEY.queue(id), start, stop)
      .then((res) => res.map(QueueService.parseQueue));
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
    return QueueService.parseQueue(str);
  }

  /**
   * Push a queue item to the end
   * @param id
   * @param items
   */
  async pushItems(
    id: string,
    ...items: (Omit<QueueItemDbObject, "id"> & {
      id?: string;
    })[]
  ): Promise<number> {
    const queueItems: QueueItemDbObject[] = items.map((item) => {
      return {
        ...item,
        id: item.id || QueueService.randomItemId(),
      };
    });
    const count = await this.context.redis.rpush(
      REDIS_KEY.queue(id),
      ...queueItems.map(QueueService.stringifyQueue)
    );
    if (count) this.notifyUpdate(id);
    return count;
  }

  /**
   * Reorder queue items
   * @param id
   * @param origin
   * @param dest
   */
  async reorderItems(id: string, origin: number, dest: number) {
    // FIXME: Need better performant strategy
    const allItems = await this.context.redis.lrange(
      REDIS_KEY.queue(id),
      0,
      -1
    );
    await this.deleteById(id);
    const count = await this.context.redis.rpush(
      REDIS_KEY.queue(id),
      reorder(allItems, origin, dest)
    );
    this.notifyUpdate(id);
    return count;
  }

  /**
   * Remove a queue item
   * @param id
   * @param pos
   */
  async removeItem(id: string, pos: number): Promise<number> {
    // redis does not have remove item from list by index
    const DEL_VAL = "";
    await this.context.redis.lset(REDIS_KEY.queue(id), pos, DEL_VAL);
    const count = await this.context.redis.lrem(
      REDIS_KEY.queue(id),
      1,
      DEL_VAL
    );
    if (count) this.notifyUpdate(id);
    return count;
  }

  /**
   * Delete a queue item
   * @param id
   */
  async deleteById(id: string) {
    return this.context.redis.del(REDIS_KEY.queue(id));
  }

  /**
   * Execute a queue action
   * Usually a public API to GraphQL
   * @param me
   * @param story
   * @param param2
   */
  async executeQueueAction(
    me: UserDbObject | null,
    story: StoryDbObject,
    {
      action,
      tracks,
      position,
      insertPosition,
    }: {
      action: QueueAction;
      tracks?: string[] | null;
      position?: number | null;
      insertPosition?: number | null;
    }
  ) {
    const id = String(story._id);
    if (!me) throw new AuthenticationError("");

    if (!story.isLive) throw new ForbiddenError("Story is not live");

    if (!StoryService.getPermission(me, story).isQueueable)
      throw new ForbiddenError("You are not allowed to add to this queue");

    switch (action) {
      case QueueAction.Add: {
        if (!tracks) throw new UserInputError("Missing tracks", ["tracks"]);

        await this.pushItems(
          id,
          ...tracks.map((trackId) => ({
            trackId,
            creatorId: me._id,
          }))
        );

        // It is possible that adding a new item will restart nowPlaying
        NowPlayingWorker.requestResolve(this.context.pubsub, String(story._id));
        break;
      }
      case QueueAction.Remove:
        if (typeof position !== "number")
          throw new UserInputError("Missing position", ["position"]);

        await this.removeItem(id, position);
        break;
      case QueueAction.Reorder:
        if (typeof insertPosition !== "number")
          throw new UserInputError("Missing destination position", [
            "insertPosition",
          ]);
        if (typeof position !== "number")
          throw new UserInputError("Missing originated position", ["position"]);

        await this.reorderItems(id, position, insertPosition);
        break;
      case QueueAction.Clear:
        await this.deleteById(id);
        break;
      default:
        throw new ForbiddenError("Invalid action");
    }

    return true;
  }
}
