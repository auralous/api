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

  private parseItem(str: string): MessageDbObject {
    return JSON.parse(str, (key, value) =>
      key === "createdAt" ? new Date(value) : value
    );
  }

  private stringifyItem(message: Partial<MessageDbObject>) {
    return messageStringify(message);
  }

  private randomItemId(): string {
    return nanoid(16);
  }

  private notifyUpdate(id: string, message: MessageDbObject) {
    this.context.pubsub.publish(PUBSUB_CHANNELS.messageAdded, {
      id,
      messageAdded: message,
    });
  }

  async findById(
    id: string,
    start = 0,
    stop = -1
  ): Promise<MessageDbObject[] | null> {
    return this.context.redis
      .lrange(REDIS_KEY.message(id).key, start, stop)
      .then((strs) => strs.map(this.parseItem));
  }

  // add a new message
  async add(
    id: string,
    message: Pick<MessageDbObject, "text" | "type" | "creatorId">
  ): Promise<number> {
    const newMessage: MessageDbObject = {
      ...message,
      id: this.randomItemId(),
      createdAt: new Date(),
      creatorId: message.creatorId,
    };

    const count = await this.context.redis.rpush(
      REDIS_KEY.message(id).key,
      this.stringifyItem(newMessage)
    );

    if (count) this.notifyUpdate(id, newMessage);
    return count;
  }
}
