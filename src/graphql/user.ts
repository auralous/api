import { AuthenticationError } from "../error";
import { uploadStreamToCloudinary } from "../lib/cloudinary";
import { defaultAvatar } from "../lib/defaultAvatar";
import { CONFIG } from "../lib/constant";

import type { IResolvers, UserDbObject } from "../types/index";

export const typeDefs = `
  type Query {
    me: User
    user(username: String, id: ID): User
    meAuth: UserAuthWrapper
  }

  type Mutation {
    me(name: String, username: String, bio: String, profilePicture: Upload): User
    deleteMe: Boolean!
    deleteMeOauth(provider: IOAuthProviderName!): Boolean!
  }

  enum IOAuthProviderName {
    youtube
    twitter
    facebook
    spotify
  }

  type User {
    id: ID!
    username: String!
    bio: String
    profilePicture: String!
  }

  type UserAuthWrapper {
    youtube: UserOauthProvider
    twitter: UserOauthProvider
    facebook: UserOauthProvider
    spotify: UserOauthProvider
  }

  type UserOauthProvider {
    provider: IOAuthProviderName!
    id: ID!
  }
`;

export const resolvers: IResolvers = {
  Query: {
    me(parent, args, { user, setCacheControl }) {
      setCacheControl?.(0, "PRIVATE");
      return user;
    },
    // @ts-expect-error: Invalid TS error
    async meAuth(parent, args, { user, setCacheControl }) {
      setCacheControl?.(0, "PRIVATE");
      return user?.oauth;
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
    async deleteMe(parent, args, { services }) {
      return services.User.deleteMe();
    },
    async deleteMeOauth(parent, { provider }, { services }) {
      await services.User.removeMeOauth(provider);
      return true;
    },
  },
  User: {
    id: ({ _id }) => _id,
    profilePicture({ profilePicture, username }) {
      return profilePicture || defaultAvatar("user", username);
    },
  },
};
