import { ObjectID } from "mongodb";
import { AuthenticationError } from "../error";
import type { NotificationDbObject, UserDbObject } from "../types";
import type { ServiceContext } from "./types";

export class NotificationService {
  private collection = this.context.db.collection<NotificationDbObject>(
    "notifications"
  );

  constructor(private context: ServiceContext) {}

  /**
   * Get current user's notifications
   * @param me
   * @param limit
   * @param next
   */
  findMine(me: UserDbObject, limit: number, next?: string | null) {
    return this.collection
      .find({
        userId: me._id,
        ...(next && { _id: { $lt: new ObjectID(next) } }),
      })
      .sort({ $natural: -1 })
      .limit(limit)
      .toArray();
  }

  /**
   * Mark certain notifications as read
   * @param me
   * @param ids
   */
  markRead(me: UserDbObject | null, ids: string[]) {
    if (!me) throw new AuthenticationError("");
    return this.collection
      .updateMany(
        { userId: me._id, _id: { $in: ids.map((id) => new ObjectID(id)) } },
        { $set: { hasRead: true } }
      )
      .then((result) => result.modifiedCount);
  }
}
