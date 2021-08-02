import type { UserDbObject } from "../../data/types.js";
import { CONFIG } from "../../utils/constant.js";
import { Resolvers } from "../graphql.gen.js";

const resolvers: Resolvers = {
  Query: {
    async me(parent, args, { auth, services, setCacheControl }) {
      setCacheControl?.(0, "PRIVATE");
      if (!auth) return null;

      const [user, accessToken] = await Promise.all([
        services.User.findById(auth.userId),
        auth.accessTokenPromise,
      ]);

      return {
        user: user!,
        oauthId: auth.oauthId,
        platform: auth.provider,
        accessToken: accessToken,
      };
    },
    async user(parent, { username, id }, { services, setCacheControl }) {
      let user: UserDbObject | null = null;
      if (username) user = await services.User.findByUsername(username);
      if (id) user = await services.User.findById(id);
      if (user) setCacheControl?.(CONFIG.userMaxAge);
      return user;
    },
    async userFollowers(parent, { id }, { services }) {
      return (await services.Follow.findFollows(id)).map(
        (followEntry) => followEntry.follower
      );
    },
    async userFollowings(parent, { id }, { services }) {
      return (await services.Follow.findFollowings(id)).map(
        (followEntry) => followEntry.following
      );
    },
    userStat(parent, { id }, { services }) {
      return services.Follow.getFollowStat(id).then((stat) => ({
        id,
        ...stat,
      }));
    },
  },
  Mutation: {
    async me(parent, { username, bio }, { auth, services }) {
      return services.User.updateMe(auth, { username, bio });
    },
    async meDelete(parent, args, { services, auth }) {
      return services.User.deleteMe(auth);
    },
    async userFollow(parent, { id }, { services, auth }) {
      return services.Follow.follow(auth, await services.User.findById(id));
    },
    async userUnfollow(parent, { id }, { services, auth }) {
      return services.Follow.unfollow(auth, id);
    },
  },
  User: {
    id: ({ _id }) => _id,
  },
};

export default resolvers;
