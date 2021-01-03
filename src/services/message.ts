import fastJson from "fast-json-stringify";
import { nanoid } from "nanoid/non-secure";
import { REDIS_KEY, PUBSUB_CHANNELS } from "../lib/constant";

import type { ServiceContext } from "./types";
import type { MessageDbObject } from "../types";

const messageStringify = fastJson({
  title: "Message",
  type: "object",
  properties: {
    id: { type: "string" },
    creatorId: { type: "string" },
    createdAt: { type: "string" },
    text: { type: "string" },
    type: { type: "string" },
  },
  required: ["id", "creatorId", "createdAt", "type"],
});

export class MessageService {
  constructor(private context: ServiceContext) {}

  static parseMessage(str: string): MessageDbObject {
    return JSON.parse(str, (key, value) =>
      key === "createdAt" ? new Date(value) : value
    );
  }

  static stringifyMessage(message: Partial<MessageDbObject>) {
    return messageStringify(message);
  }

  static randomMessageItemId(): string {
    return nanoid(16);
  }

  /**
   * Notify a message to pubsub channels
   * @param id the id of message room
   * @param message message object to be notify
   */
  private notifyMessage(id: string, message: MessageDbObject) {
    this.context.pubsub.publish(PUBSUB_CHANNELS.messageAdded, {
      id,
      messageAdded: message,
    });
  }

  /**
   * Find a message by id
   * @param id
   * @param start
   * @param stop
   */
  async findById(
    id: string,
    start = 0,
    stop = -1
  ): Promise<MessageDbObject[] | null> {
    return this.context.redis
      .lrange(REDIS_KEY.message(id).key, start, stop)
      .then((strs) => strs.map(MessageService.parseMessage));
  }

  /**
   * Add a new message
   * @param id
   * @param message
   */
  async add(
    id: string,
    message: Pick<MessageDbObject, "text" | "type" | "creatorId">
  ): Promise<number> {
    const newMessage: MessageDbObject = {
      ...message,
      id: MessageService.randomMessageItemId(),
      createdAt: new Date(),
      creatorId: message.creatorId,
    };

    const count = await this.context.redis.rpush(
      REDIS_KEY.message(id).key,
      MessageService.stringifyMessage(newMessage)
    );

    if (count) this.notifyMessage(id, newMessage);
    return count;
  }
}
