import type { UserDbObject } from "../../data/types.js";
import { AuthenticationError } from "../../error/index.js";
import {
  SpotifyAuthService,
  YoutubeAuthService,
} from "../../services/music/index.js";
import { CONFIG } from "../../utils/constant.js";
import { defaultAvatar } from "../../utils/defaultAvatar.js";
import { PlatformName, Resolvers } from "../graphql.gen.js";

const resolvers: Resolvers = {
  Query: {
    async me(parent, args, { user, services, setCacheControl }) {
      setCacheControl?.(0, "PRIVATE");
      if (!user) return null;

      const authService =
        user.oauth.provider === PlatformName.Youtube
          ? new YoutubeAuthService()
          : new SpotifyAuthService();

      const accessToken = await authService.getAccessToken(user, services.User);

      return {
        user,
        oauthId: user.oauth.id,
        platform: user.oauth.provider,
        accessToken,
        expiredAt: user.oauth.expiredAt,
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
    async me(parent, { username, bio }, { user, services }) {
      if (!user) throw new AuthenticationError("");

      return services.User.updateMe(user, { username, bio });
    },
    async meDelete(parent, args, { services, user }) {
      if (!user) throw new AuthenticationError("");
      return services.User.deleteMe(user);
    },
    async userFollow(parent, { id }, { services, user }) {
      return services.Follow.follow(user, await services.User.findById(id));
    },
    async userUnfollow(parent, { id }, { services, user }) {
      return services.Follow.unfollow(user, id);
    },
  },
  User: {
    id: ({ _id }) => _id,
    profilePicture({ profilePicture, username }) {
      return profilePicture || defaultAvatar("user", username);
    },
  },
};

export default resolvers;
