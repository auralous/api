import { AuthenticationError, UserInputError } from "../error";
import { FollowDbObject, UserDbObject } from "../types";
import { ServiceContext } from "./types";

export class FollowService {
  private collection = this.context.db.collection<FollowDbObject>("follows");

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
  async follow(me: UserDbObject | null, followingUser: UserDbObject | null) {
    if (!me) throw new AuthenticationError("");
    if (!followingUser)
      throw new UserInputError("User does not exist to follow", ["id"]);
    await this.collection.findOneAndUpdate(
      {
        follower: me._id,
        following: followingUser._id,
      },
      {
        $set: {
          follower: me._id,
          following: followingUser._id,
          followedAt: new Date(),
          unfollowedAt: null,
        },
      },
      { upsert: true }
    );
    return true;
  }

  /**
   * Unfollow a user
   * @param me
   * @param unfollowingUserId possibly an invalid one or deleted one
   */
  async unfollow(me: UserDbObject | null, unfollowingUserId: string) {
    if (!me) throw new AuthenticationError("");
    const result = await this.collection.updateOne(
      {
        follower: me._id,
        following: unfollowingUserId,
      },
      { $set: { unfollowedAt: new Date() } }
    );
    return !!result.modifiedCount;
  }
}
