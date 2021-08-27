import type { WithId } from "mongodb";
import mongodb from "mongodb";
import { db } from "../data/mongo.js";
import { pubsub } from "../data/pubsub.js";
import type {
  FollowDbObject,
  NotificationDbObjectUnion,
  SessionDbObject,
} from "../data/types.js";
import { UnauthorizedError } from "../error/errors.js";
import { PUBSUB_CHANNELS } from "../utils/constant.js";
import { FollowService } from "./follow.js";
import { ServiceContext } from "./types.js";

export class NotificationService {
  private static collection =
    db.collection<NotificationDbObjectUnion>("notifications");

  /**
   * Get current user's notifications
   * @param me
   * @param limit
   * @param next
   */
  static findMine(
    context: ServiceContext,
    limit: number,
    next?: string | null
  ) {
    if (!context.auth) throw new UnauthorizedError();
    return NotificationService.collection
      .find({
        userId: context.auth.userId,
        ...(next && { _id: { $lt: new mongodb.ObjectId(next) } }),
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
  static markRead(context: ServiceContext, ids: string[]) {
    if (!context.auth) throw new UnauthorizedError();
    return this.collection
      .updateMany(
        {
          userId: context.auth.userId,
          _id: { $in: ids.map((id) => new mongodb.ObjectId(id)) },
        },
        { $set: { hasRead: true } }
      )
      .then((result) => result.modifiedCount);
  }

  /**
   * Add a new notification
   * @param context
   * @param notification
   * @returns
   */
  static async add(
    notification: NotificationDbObjectUnion
  ): Promise<WithId<NotificationDbObjectUnion>> {
    const newNotification = await NotificationService.collection
      .insertOne(notification)
      .then((result) => ({ _id: result.insertedId, ...notification }));
    pubsub.publish(PUBSUB_CHANNELS.notificationAdded, {
      notificationAdded: newNotification,
    });
    return newNotification;
  }

  static async notifyUserOfNewFollower(
    context: ServiceContext,
    newFollow: FollowDbObject
  ) {
    await NotificationService.add({
      type: "follow",
      userId: newFollow.following,
      hasRead: false,
      createdAt: newFollow.followedAt,
      followedBy: newFollow.follower,
    });
  }

  static async notifyFollowersOfNewSession(session: SessionDbObject) {
    const follows = await FollowService.findFollows(session.creatorId);

    const promises: Promise<WithId<NotificationDbObjectUnion> | null>[] = [];

    follows.forEach((follow) => {
      promises.push(
        NotificationService.add({
          type: "new-session",
          userId: follow.follower,
          hasRead: false,
          createdAt: session.createdAt,
          sessionId: String(session._id),
        })
      );
    });

    await Promise.all(promises);
  }
}
