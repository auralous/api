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
        ...(next && { _id: { $lt: new mongodb.ObjectID(next) } }),
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
          _id: { $in: ids.map((id) => new mongodb.ObjectID(id)) },
        },
        { $set: { hasRead: true } }
      )
      .then((result) => result.modifiedCount);
  }

  async add(notification: NotificationDbObjectUnion) {
    const newNotification = await this.collection
      .insertOne({
        ...notification,
        hasRead: false,
      })
      .then((result) => result.ops[0]);
    pubsub.publish(PUBSUB_CHANNELS.notificationAdded, {
      notificationAdded: newNotification,
    });
    return newNotification;
  }

  async notifyUserOfNewFollower(newFollow: FollowDbObject) {
    this.add({
      type: "follow",
      userId: newFollow.following,
      hasRead: false,
      followedBy: newFollow.follower,
      createdAt: newFollow.followedAt,
    });
  }

  async notifyFollowersOfNewSession(session: SessionDbObject) {
    const followService = new FollowService(this.context);
    const follows = await followService.findFollows(session.creatorId);

    const promises: Promise<WithId<NotificationDbObjectUnion> | null>[] = [];

    follows.forEach((follow) => {
      promises.push(
        this.add({
          userId: follow.follower,
          hasRead: false,
          sessionId: String(session._id),
          type: "new-session",
          createdAt: session.createdAt,
        })
      );
    });

    await Promise.all(promises);
  }
}
