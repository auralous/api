import type { WithId } from "mongodb";
import mongodb from "mongodb";
import { db } from "../data/mongo.js";
import { pubsub } from "../data/pubsub.js";
import type {
  NotificationDbObject,
  StoryDbObject,
  UserDbObject,
} from "../data/types.js";
import { AuthenticationError } from "../error/index.js";
import { PUBSUB_CHANNELS } from "../utils/constant.js";
import { FollowService } from "./follow.js";
import type { ServiceContext } from "./types.js";
import { UserService } from "./user.js";

export class NotificationService {
  private collection = db.collection<NotificationDbObject>("notifications");

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
  markRead(me: UserDbObject | null, ids: string[]) {
    if (!me) throw new AuthenticationError("");
    return this.collection
      .updateMany(
        {
          userId: me._id,
          _id: { $in: ids.map((id) => new mongodb.ObjectID(id)) },
        },
        { $set: { hasRead: true } }
      )
      .then((result) => result.modifiedCount);
  }

  async add<T extends NotificationDbObject>(
    notification: Omit<T, "createdAt" | "hasRead" | "_id">
  ) {
    const newNotification = await this.collection
      // @ts-ignore
      .insertOne({
        ...notification,
        createdAt: new Date(),
        hasRead: false,
      })
      .then((result) => result.ops[0]);
    pubsub.publish(PUBSUB_CHANNELS.notificationAdded, {
      notificationAdded: newNotification,
    });
    return newNotification;
  }

  async addInvitesToStory(
    me: UserDbObject | null,
    story: StoryDbObject,
    invitedIds: string[]
  ) {
    if (!me) throw new AuthenticationError("");

    const promises: Promise<WithId<NotificationDbObject> | null>[] = [];

    const userService = new UserService(this.context);

    invitedIds.forEach((invitedId) => {
      promises.push(
        userService.findById(invitedId).then((user) =>
          user
            ? // TODO: We need a way to throttle this
              this.add<Extract<NotificationDbObject, { type: "invite" }>>({
                userId: invitedId,
                storyId: String(story._id),
                inviterId: me._id,
                type: "invite",
              })
            : null
        )
      );
    });

    await Promise.all(promises);
  }

  async notifyFollowersOfNewStory(story: StoryDbObject) {
    const followService = new FollowService(this.context);
    const follows = await followService.findFollows(story.creatorId);

    const promises: Promise<WithId<NotificationDbObject> | null>[] = [];

    follows.forEach((follow) => {
      promises.push(
        this.add<Extract<NotificationDbObject, { type: "new-story" }>>({
          userId: follow.follower,
          creatorId: story.creatorId,
          storyId: String(story._id),
          type: "new-story",
        })
      );
    });

    await Promise.all(promises);
  }
}
