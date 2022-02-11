import type { UserDbObject } from "../../data/types.js";
import { FollowService } from "../../services/follow.js";
import { UserService } from "../../services/user.js";
import { CONFIG } from "../../utils/constant.js";
import { Resolvers } from "../graphql.gen.js";

const resolvers: Resolvers = {
  Query: {
    async me(parent, args, context) {
      context.setCacheControl?.(0, "PRIVATE");
      if (!context.auth) return null;

      const [user, accessToken] = await Promise.all([
        UserService.findById(context, context.auth.userId),
        context.auth.accessTokenPromise,
      ]);

      return {
        user: user!,
        oauthId: context.auth.oauthId,
        platform: context.auth.provider,
        accessToken: accessToken,
      };
    },
    async user(parent, { username, id }, context) {
      let user: UserDbObject | null = null;
      if (username) user = await UserService.findByUsername(context, username);
      if (id) user = await UserService.findById(context, id);
      if (user) context.setCacheControl?.(CONFIG.userMaxAge);
      return user;
    },
    async users(parent, { ids }, context) {
      return UserService.findManyByIds(context, ids);
    },
    async userFollowers(parent, { id }) {
      return (await FollowService.findFollows(id)).map(
        (followEntry) => followEntry.follower
      );
    },
    async userFollowings(parent, { id }) {
      return (await FollowService.findFollowings(id)).map(
        (followEntry) => followEntry.following
      );
    },
    userStat(parent, { id }) {
      return FollowService.getFollowStat(id).then((stat) => ({
        id,
        ...stat,
      }));
    },
  },
  Mutation: {
    async me(parent, { username, bio }, context) {
      return UserService.updateMe(context, { username, bio });
    },
    async meDelete(parent, args, context) {
      return UserService.deleteMe(context);
    },
    async userFollow(parent, { id }, context) {
      return FollowService.follow(context, id);
    },
    async userUnfollow(parent, { id }, context) {
      return FollowService.unfollow(context, id);
    },
  },
  User: {
    id: ({ _id }) => _id,
  },
};

export default resolvers;
