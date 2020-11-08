import { nanoid } from "nanoid/non-secure";
import fastJson from "fast-json-stringify";
import { reorder } from "../lib/utils";
import { REDIS_KEY, PUBSUB_CHANNELS } from "../lib/constant";
import { NowPlayingItemDbObject, QueueItemDbObject } from "../types/db";
import { ServiceContext } from "./types";

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

  stringifyItem(item: QueueItemDbObject): string {
    return queueItemStringify(item);
  }

  parseItem(str: string): QueueItemDbObject | NowPlayingItemDbObject {
    return JSON.parse(str, (key, value) =>
      key === "playedAt" || key === "endedAt" ? new Date(value) : value
    );
  }

  randomItemId(): string {
    return nanoid(4);
  }

  async findById(
    id: string,
    start = 0,
    stop = -1
  ): Promise<QueueItemDbObject[]> {
    return this.context.redis
      .lrange(REDIS_KEY.queue(id), start, stop)
      .then((res) => res.map(this.parseItem));
  }

  async lengthById(id: string): Promise<number> {
    return this.context.redis.llen(REDIS_KEY.queue(id));
  }

  async shiftItem(id: string): Promise<QueueItemDbObject | null> {
    const str = await this.context.redis.lpop(REDIS_KEY.queue(id));
    if (!str) return null;
    this.notifyUpdate(id);
    return this.parseItem(str);
  }

  async pushItems(
    id: string,
    ...items: (Omit<QueueItemDbObject, "id"> & {
      id?: string;
    })[]
  ): Promise<number> {
    const queueItems: QueueItemDbObject[] = items.map((item) => {
      return {
        ...item,
        id: item.id || this.randomItemId(),
      };
    });
    const count = await this.context.redis.rpush(
      REDIS_KEY.queue(id),
      ...queueItems.map(this.stringifyItem)
    );
    if (count) this.notifyUpdate(id);
    return count;
  }

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

  async deleteById(id: string) {
    return this.context.redis.del(REDIS_KEY.queue(id));
  }
}
