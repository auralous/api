import { ObjectID } from "mongodb";
import type { NotificationDbObject, UserDbObject } from "../types";
import type { ServiceContext } from "./types";

export class NotificationService {
  private collection = this.context.db.collection<NotificationDbObject>(
    "notifications"
  );

  constructor(private context: ServiceContext) {}

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
}
