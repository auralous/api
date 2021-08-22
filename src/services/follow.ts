import { AuthState } from "../auth/types.js";
import { db } from "../data/mongo.js";
import type { FollowDbObject, UserDbObject } from "../data/types.js";
import { AuthenticationError, UserInputError } from "../error/index.js";
import { NotificationService } from "./notification.js";
import type { ServiceContext } from "./types.js";

export class FollowService {
  private collection = db.collection<FollowDbObject>("follows");

  constructor(private context: ServiceContext) {}

  /**
   * Get a list of users who follow userId
   * @param userId
   */
  findFollows(userId: string) {
    return this.collection
      .find({ following: userId, unfollowedAt: null })
      .sort({ $natural: -1 })
      .toArray();
  }

  /**
   * Get a list of users userId is following
   * @param userId
   */
  findFollowings(userId: string) {
    return this.collection
      .find({ follower: userId, unfollowedAt: null })
      .sort({ $natural: -1 })
      .toArray();
  }

  /**
   * Get following stats includer followerCount and followingCount
   * @param userId
   */
  async getFollowStat(userId: string) {
    const [followerCount, followingCount] = await Promise.all([
      this.collection.countDocuments({ following: userId, unfollowedAt: null }),
      this.collection.countDocuments({ follower: userId, unfollowedAt: null }),
    ]);
    return { followerCount, followingCount };
  }

  /**
   * Follow a user
   * @param me
   * @param followingUser
   */
  async follow(me: AuthState | null, followingUser: UserDbObject | null) {
    if (!me) throw new AuthenticationError("");
    if (!followingUser)
      throw new UserInputError("User does not exist to follow", ["id"]);

    const followedAt = new Date();

    const newFollow = await this.collection
      .findOneAndUpdate(
        {
          follower: me.userId,
          following: followingUser._id,
        },
        {
          $set: {
            follower: me.userId,
            following: followingUser._id,
            followedAt,
            unfollowedAt: null,
          },
        },
        { upsert: true, returnDocument: "after" }
      )
      .then((result) => result.value);

    if (newFollow) {
      new NotificationService(this.context).notifyUserOfNewFollower(newFollow);
    }

    return true;
  }

  /**
   * Unfollow a user
   * @param me
   * @param unfollowingUserId possibly an invalid one or deleted one
   */
  async unfollow(me: AuthState | null, unfollowingUserId: string) {
    if (!me) throw new AuthenticationError("");
    const result = await this.collection.updateOne(
      {
        follower: me.userId,
        following: unfollowingUserId,
      },
      { $set: { unfollowedAt: new Date() } }
    );
    return !!result.modifiedCount;
  }
}
