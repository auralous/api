import mongodb, { WithoutId } from "mongodb";
import { db } from "../data/mongo.js";
import { pubsub } from "../data/pubsub.js";
import { MessageDbObject } from "../data/types.js";
import { PUBSUB_CHANNELS } from "../utils/constant.js";

export class MessageService {
  private static collection = db.collection<MessageDbObject>("messages");

  /**
   * Notify a message to pubsub channels
   * @param id the id of message room
   * @param message message object to be notify
   */
  private static notifyMessage(id: string, message: MessageDbObject) {
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
  static async findById(
    sessionId: string,
    limit: number,
    next?: string | null
  ): Promise<MessageDbObject[] | null> {
    return MessageService.collection
      .find({
        sessionId: new mongodb.ObjectId(sessionId),
        ...(next && { _id: { $lt: new mongodb.ObjectId(next) } }),
      })
      .sort({ $natural: -1 })
      .limit(limit)
      .toArray();
  }

  /**
   * Add a new message
   * @param id
   * @param message
   */
  static async add(
    sessionId: string,
    message: Pick<MessageDbObject, "text" | "type" | "creatorId">
  ): Promise<number> {
    const newMessage: WithoutId<MessageDbObject> = {
      ...message,
      createdAt: new Date(),
      creatorId: message.creatorId,
      sessionId: new mongodb.ObjectId(sessionId),
    };

    const { acknowledged, insertedId } =
      await MessageService.collection.insertOne(newMessage);

    MessageService.notifyMessage(sessionId, {
      _id: insertedId,
      ...newMessage,
    });

    return Number(acknowledged);
  }
}
