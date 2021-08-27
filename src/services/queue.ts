/**
 * QUEUE SERVICE
 *
 * QueueService maintains a queue of tracks to be used
 * by LIVE sessions
 *
 * A queue is stored in two redis keys:
 *
 * queue:{id}:list
 * which is a list of uid strings
 *
 * queue:{id}:data
 * which is a hash in which the field key is the uid
 * and the field value is an stringify object containing trackId and creatorId
 */

import fastJson from "fast-json-stringify";
import { nanoid } from "nanoid/non-secure";
import { redis } from "../data/redis.js";
import {
  CustomError,
  NotFoundError,
  UnauthorizedError,
} from "../error/errors.js";
import type {
  MutationQueueAddArgs,
  MutationQueueReorderArgs,
  MutationQueueToTopArgs,
  QueueItem,
} from "../graphql/graphql.gen.js";
import { REDIS_KEY } from "../utils/constant.js";
import { NowPlayingService } from "./nowPlaying.js";
import { NowPlayingWorker } from "./nowPlayingWorker.js";
import { SessionService } from "./session.js";
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

  static randomUid() {
    return nanoid(6);
  }

  static stringifyQueueItemData(item: Omit<QueueItem, "uid">): string {
    return queueItemStringify(item);
  }

  static parseQueueItemData(str: string): Omit<QueueItem, "uid"> {
    return JSON.parse(str);
  }

  /**
   * Find queue items by id
   * @param id
   * @param start
   * @param stop
   */
  static async findById(
    id: string,
    start = 0,
    stop = -1
  ): Promise<QueueItem[]> {
    const result = await redis
      .pipeline()
      .lrange(REDIS_KEY.queueList(id), start, stop)
      .hgetall(REDIS_KEY.queueData(id))
      .exec();

    const err = result[0][0] || result[1][0];
    if (err) throw err;

    const list = result[0][1] as string[];
    const datas = result[1][1] as Record<string, string>;

    return list.map((uid) => {
      const dataStr = datas[uid];
      if (!dataStr)
        throw new Error(`QueueItem is null for id = ${id}, uid = ${uid}`);
      const data = QueueService.parseQueueItemData(dataStr);
      return {
        uid,
        ...data,
      };
    });
  }

  static async getUidAtIndex(id: string, index: number) {
    try {
      const uid = await redis.lindex(REDIS_KEY.queueList(id), index);
      return uid;
    } catch (e) {
      return null;
    }
  }

  static async getIndexByUid(id: string, uid: string) {
    return redis.lpos(REDIS_KEY.queueList(id), uid);
  }

  static async getQueueLength(id: string) {
    return redis.llen(REDIS_KEY.queueList(id));
  }

  /**
   * Get queue item data of specific uid
   * @param id
   * @param uid
   * @returns
   */
  static async findQueueItemData(
    id: string,
    uid: string
  ): Promise<Omit<QueueItem, "uid"> | null> {
    const str = await redis.hget(REDIS_KEY.queueData(id), uid);
    if (!str) return null;
    return QueueService.parseQueueItemData(str);
  }

  /**
   * Push a queue item to the end
   * @param id
   * @param items
   */
  static async pushItems(
    id: string,
    ...queueItems: QueueItem[]
  ): Promise<number> {
    const dataStrMap = new Map<string, string>();
    const list = [];

    for (const queueItem of queueItems) {
      list.push(queueItem.uid);
      dataStrMap.set(
        queueItem.uid,
        QueueService.stringifyQueueItemData({
          creatorId: queueItem.creatorId,
          trackId: queueItem.trackId,
        })
      );
    }

    const result = await redis
      .multi()
      .rpush(REDIS_KEY.queueList(id), ...list)
      .hmset(REDIS_KEY.queueData(id), dataStrMap)
      .exec();

    const err = result[0][0] || result[1][0];
    if (err) throw err;

    NowPlayingService.notifyUpdate(id);

    return result[0][1];
  }

  /**
   * Reorder queue items
   * @param id
   * @param origin
   * @param dest
   */
  static async reorderItems(id: string, origin: number, dest: number) {
    // Redis is a linked list so we cannot reorder items
    // For now, we delete the list and readd the items
    const redisKey = REDIS_KEY.queueList(id);
    const allItems = await redis.lrange(redisKey, 0, -1);

    const reorderedItems = reorder(allItems, origin, dest);

    const result = await redis
      .multi()
      .del(redisKey)
      .rpush(redisKey, ...reorderedItems)
      .exec();

    const err = result[0][0] || result[1][0];
    if (err) throw err;

    NowPlayingService.notifyUpdate(id);
    return result[1][1];
  }

  /**
   * Remove queue items
   * @param ids
   */
  static async removeItems(id: string, uids: string[]): Promise<number> {
    const redisKey = REDIS_KEY.queueList(id);

    const pipeline = redis.pipeline();

    for (const uid of uids) {
      pipeline.lrem(redisKey, 1, uid);
    }

    const result = await pipeline.exec();

    NowPlayingService.notifyUpdate(id);
    return result.reduce((prev, curr) => prev + curr[1], 0);
  }

  /**
   * Move some items to the top
   * @param id
   * @param uids
   *
   * There is one caveat to this implementation
   * and that is if any of the uid is invalid
   * the bahavior will be undefined
   */
  static async toTopItems(
    id: string,
    uids: string[],
    afterUid: string
  ): Promise<number> {
    const redisKey = REDIS_KEY.queueList(id);
    // Delete those uids from list
    // and re-add them to the top
    const pipeline = redis.pipeline();

    for (const uid of uids) {
      pipeline.lrem(redisKey, 1, uid);
    }

    for (const uid of uids.reverse()) {
      pipeline.linsert(redisKey, "AFTER", afterUid, uid);
    }

    const result = await pipeline.exec();

    for (const resultItem of result) {
      if (resultItem[0]) throw resultItem[0];
    }

    NowPlayingService.notifyUpdate(id);
    // FIXME: report actual result
    return uids.length;
  }

  /**
   * Delete a queue
   * @param id
   */
  static async deleteById(id: string) {
    redis.del(REDIS_KEY.queueData(id), REDIS_KEY.queueList(id));
  }

  /**
   * Execute a queue action
   * Usually a public API to GraphQL
   * @param me
   * @param session
   * @param actions
   */
  static async executeQueueAction(
    context: ServiceContext,
    id: string,
    actions: {
      add?: Omit<MutationQueueAddArgs, "id">;
      reorder?: Omit<MutationQueueReorderArgs, "id">;
      remove?: string[];
      toTop?: Omit<MutationQueueToTopArgs, "id">;
    }
  ) {
    const auth = context.auth;
    // Assert auth
    if (!auth) throw new UnauthorizedError();
    const session = await SessionService.findById(context, id);
    if (!session) throw new NotFoundError("session", id);
    if (!session.isLive)
      throw new CustomError("error.session_ended", {
        session,
      });
    if (!session.collaboratorIds.includes(auth.userId))
      throw new CustomError("error.not_collaborator");

    if (actions.add) {
      await QueueService.pushItems(
        id,
        ...actions.add.tracks.map((trackId) => ({
          uid: QueueService.randomUid(),
          trackId,
          creatorId: auth.userId,
        }))
      );
      return true;
    } else if (actions.remove) {
      return Boolean(await QueueService.removeItems(id, actions.remove));
    } else if (actions.reorder) {
      // position depends on current playing index
      const { playingIndex } =
        await NowPlayingWorker.getFormattedNowPlayingState(id);
      await QueueService.reorderItems(
        id,
        playingIndex + 1 + actions.reorder.position,
        playingIndex + 1 + actions.reorder.insertPosition
      );
      return true;
    } else if (actions.toTop) {
      // position depends on current playing index
      const { queuePlayingUid } =
        await NowPlayingWorker.getFormattedNowPlayingState(id);
      await QueueService.toTopItems(id, actions.toTop.uids, queuePlayingUid);
    }
    return false;
  }
}
