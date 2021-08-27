import { db } from "../data/mongo.js";
import type { FollowDbObject } from "../data/types.js";
import { NotFoundError, UnauthorizedError } from "../error/errors.js";
import { NotificationService } from "./notification.js";
import type { ServiceContext } from "./types.js";
import { UserService } from "./user.js";

export class FollowService {
  private static collection = db.collection<FollowDbObject>("follows");

  /**
   * Get a list of users who follow userId
   * @param userId
   */
  static findFollows(userId: string): Promise<FollowDbObject[]> {
    return FollowService.collection
      .find({ following: userId, unfollowedAt: null })
      .sort({ $natural: -1 })
      .toArray();
  }

  /**
   * Get a list of users userId is following
   * @param userId
   */
  static findFollowings(userId: string): Promise<FollowDbObject[]> {
    return this.collection
      .find({ follower: userId, unfollowedAt: null })
      .sort({ $natural: -1 })
      .toArray();
  }

  /**
   * Get following stats includer followerCount and followingCount
   * @param userId
   */
  static async getFollowStat(
    userId: string
  ): Promise<{ followerCount: number; followingCount: number }> {
    const [followerCount, followingCount] = await Promise.all([
      FollowService.collection.countDocuments({
        following: userId,
        unfollowedAt: null,
      }),
      FollowService.collection.countDocuments({
        follower: userId,
        unfollowedAt: null,
      }),
    ]);
    return { followerCount, followingCount };
  }

  /**
   * Follow a user
   * @param me
   * @param followingUser
   */
  static async follow(
    context: ServiceContext,
    followingUserId: string
  ): Promise<boolean> {
    if (!context.auth) throw new UnauthorizedError();
    const followingUser = await UserService.findById(context, followingUserId);
    if (!followingUser) throw new NotFoundError("user", followingUserId);

    const followedAt = new Date();

    const newFollow = await this.collection
      .findOneAndUpdate(
        {
          follower: context.auth.userId,
          following: followingUser._id,
        },
        {
          $set: {
            follower: context.auth.userId,
            following: followingUser._id,
            followedAt,
            unfollowedAt: null,
          },
        },
        { upsert: true, returnDocument: "after" }
      )
      .then((result) => result.value);

    if (newFollow) {
      NotificationService.notifyUserOfNewFollower(context, newFollow);
    }

    return true;
  }

  /**
   * Unfollow a user
   * @param me
   * @param unfollowingUserId possibly an invalid one or deleted one
   */
  static async unfollow(
    context: ServiceContext,
    unfollowingUserId: string
  ): Promise<boolean> {
    if (!context.auth) throw new UnauthorizedError();
    const result = await FollowService.collection.updateOne(
      {
        follower: context.auth.userId,
        following: unfollowingUserId,
      },
      { $set: { unfollowedAt: new Date() } }
    );
    return !!result.modifiedCount;
  }
}
