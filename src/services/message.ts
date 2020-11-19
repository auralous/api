import fastJson from "fast-json-stringify";
import { nanoid } from "nanoid/non-secure";
import { AuthenticationError, ForbiddenError } from "../error";

import { REDIS_KEY, PUBSUB_CHANNELS } from "../lib/constant";
import type { RoomService } from "./room";
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
  constructor(
    private context: ServiceContext,
    private roomService: RoomService
  ) {}

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
    const { id: roomId, key } = REDIS_KEY.message(id);
    // id is roomId
    if (!(await this.roomService.isViewable(roomId, this.context.user?._id)))
      return null;
    return this.context.redis
      .lrange(key, start, stop)
      .then((strs) => strs.map(this.parseItem));
  }

  // add a new message
  async add(
    id: string,
    message: Pick<MessageDbObject, "text" | "type">
  ): Promise<number> {
    if (!this.context.user?._id) throw new AuthenticationError("");
    const { id: roomId, key } = REDIS_KEY.message(id);
    // id is roomId
    if (!(await this.roomService.isViewable(roomId, this.context.user._id)))
      throw new ForbiddenError(
        "You are not allowed to send message to this channel"
      );

    const newMessage: MessageDbObject = {
      ...message,
      id: this.randomItemId(),
      createdAt: new Date(),
      creatorId: this.context.user._id,
    };

    const count = await this.context.redis.rpush(
      key,
      this.stringifyItem(newMessage)
    );

    if (count) this.notifyUpdate(id, newMessage);
    return count;
  }
}
