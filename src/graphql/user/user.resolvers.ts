import { AuthenticationError } from "../../error";
import { uploadStreamToCloudinary } from "../../lib/cloudinary";
import { defaultAvatar } from "../../lib/defaultAvatar";
import { CONFIG } from "../../lib/constant";

import type { Resolvers, UserDbObject } from "../../types/index";

const resolvers: Resolvers = {
  Query: {
    me(parent, args, { user, setCacheControl }) {
      setCacheControl?.(0, "PRIVATE");
      return user;
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
    async me(
      parent,
      { username, bio, profilePicture: profilePictureFile },
      { user, services }
    ) {
      if (!user) throw new AuthenticationError("");
      const profilePicture = profilePictureFile
        ? await uploadStreamToCloudinary(
            (await profilePictureFile).createReadStream(),
            { publicId: `users/${user._id}/profilePicture` }
          )
        : undefined;
      return services.User.updateMe(user, { username, bio, profilePicture });
    },
    async deleteMe(parent, args, { services, user }) {
      if (!user) throw new AuthenticationError("");
      return services.User.deleteMe(user);
    },
    async followUser(parent, { id }, { services, user }) {
      return services.Follow.follow(user, await services.User.findById(id));
    },
    async unfollowUser(parent, { id }, { services, user }) {
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
