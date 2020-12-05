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
      return services.User.updateMe({ username, bio, profilePicture });
    },
    async deleteMe(parent, args, { services, user }) {
      if (!user) throw new AuthenticationError("");
      const deleted = await services.User.deleteMe();
      if (deleted) {
        // delete every story
        const allStories = await services.Story.findByCreatorId(user._id);
        for (const story of allStories) {
          await services.Story.deleteById(story._id);
        }
      }
      return deleted;
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
