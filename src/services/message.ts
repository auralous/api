import fastJson from "fast-json-stringify";
import { nanoid } from "nanoid/non-secure";
import { pubsub } from "../data/pubsub.js";
import { redis } from "../data/redis.js";
import type { Message } from "../graphql/graphql.gen.js";
import { PUBSUB_CHANNELS, REDIS_KEY } from "../utils/constant.js";
import type { ServiceContext } from "./types.js";

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

  static parseMessage(str: string): Message {
    return JSON.parse(str, (key, value) =>
      key === "createdAt" ? new Date(value) : value
    );
  }

  static stringifyMessage(message: Partial<Message>) {
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
  private notifyMessage(id: string, message: Omit<Message, "creator">) {
    pubsub.publish(PUBSUB_CHANNELS.messageAdded, {
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
  async findById(id: string, start = 0, stop = -1): Promise<Message[] | null> {
    return redis
      .lrange(REDIS_KEY.message(id), start, stop)
      .then((strs) => strs.map(MessageService.parseMessage));
  }

  /**
   * Add a new message
   * @param id
   * @param message
   */
  async add(
    id: string,
    message: Pick<Message, "text" | "type" | "creatorId">
  ): Promise<number> {
    const newMessage = {
      ...message,
      id: MessageService.randomMessageItemId(),
      createdAt: new Date(),
      creatorId: message.creatorId,
    };

    const count = await redis.rpush(
      REDIS_KEY.message(id),
      MessageService.stringifyMessage(newMessage)
    );

    if (count) this.notifyMessage(id, newMessage);
    return count;
  }
}
