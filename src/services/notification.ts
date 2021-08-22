import type { WithId } from "mongodb";
import mongodb from "mongodb";
import { AuthState } from "../auth/types.js";
import { db } from "../data/mongo.js";
import { pubsub } from "../data/pubsub.js";
import type {
  FollowDbObject,
  NotificationDbObjectUnion,
  SessionDbObject,
} from "../data/types.js";
import { AuthenticationError } from "../error/index.js";
import { PUBSUB_CHANNELS } from "../utils/constant.js";
import { FollowService } from "./follow.js";
import type { ServiceContext } from "./types.js";

export class NotificationService {
  private collection =
    db.collection<NotificationDbObjectUnion>("notifications");

  constructor(private context: ServiceContext) {}

  /**
   * Get current user's notifications
   * @param me
   * @param limit
   * @param next
   */
  findMine(me: AuthState, limit: number, next?: string | null) {
    return this.collection
      .find({
        userId: me.userId,
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
  markRead(me: AuthState | null, ids: string[]) {
    if (!me) throw new AuthenticationError("");
    return this.collection
      .updateMany(
        {
          userId: me.userId,
          _id: { $in: ids.map((id) => new mongodb.ObjectId(id)) },
        },
        { $set: { hasRead: true } }
      )
      .then((result) => result.modifiedCount);
  }

  async add(
    notification: NotificationDbObjectUnion
  ): Promise<WithId<NotificationDbObjectUnion>> {
    const newNotification = await this.collection
      .insertOne(notification)
      .then((result) => ({ _id: result.insertedId, ...notification }));
    pubsub.publish(PUBSUB_CHANNELS.notificationAdded, {
      notificationAdded: newNotification,
    });
    return newNotification;
  }

  async notifyUserOfNewFollower(newFollow: FollowDbObject) {
    await this.add({
      type: "follow",
      userId: newFollow.following,
      hasRead: false,
      createdAt: newFollow.followedAt,
      followedBy: newFollow.follower,
    });
  }

  async notifyFollowersOfNewSession(session: SessionDbObject) {
    const followService = new FollowService(this.context);
    const follows = await followService.findFollows(session.creatorId);

    const promises: Promise<WithId<NotificationDbObjectUnion> | null>[] = [];

    follows.forEach((follow) => {
      promises.push(
        this.add({
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
