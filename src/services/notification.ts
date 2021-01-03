import { ObjectID } from "mongodb";
import { FollowService } from "./follow";
import { UserService } from "./user";
import { AuthenticationError } from "../error";
import { PUBSUB_CHANNELS } from "../lib/constant";

import type { WithId } from "mongodb";
import type {
  NotificationDbObject,
  StoryDbObject,
  UserDbObject,
} from "../types";
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

  async add(
    notification: Omit<NotificationDbObject, "createdAt" | "hasRead" | "_id">
  ) {
    const newNotification = await this.collection
      .insertOne({
        ...notification,
        createdAt: new Date(),
        hasRead: false,
      })
      .then((result) => result.ops[0]);
    this.context.pubsub.publish(PUBSUB_CHANNELS.notificationAdded, {
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
              this.add({
                userId: invitedId,
                storyId: String(story._id),
                inviterId: me._id,
                type: "invite",
              } as Omit<Extract<NotificationDbObject, { type: "invite" }>, "createdAt" | "hasRead" | "_id">)
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
        this.add({
          userId: follow.follower,
          creatorId: story.creatorId,
          storyId: String(story._id),
          type: "new-story",
        } as Omit<Extract<NotificationDbObject, { type: "new-story" }>, "createdAt" | "hasRead" | "_id">)
      );
    });

    await Promise.all(promises);
  }
}
