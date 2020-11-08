import DataLoader from "dataloader";
import { nanoid } from "nanoid";
import slug from "slug";
// @ts-ignore
import { hri } from "human-readable-ids";
import {
  AuthenticationError,
  ForbiddenError,
  UserInputError,
} from "../error/index";
import { deleteCloudinaryImagesByPrefix } from "../lib/cloudinary";

import type { FilterQuery } from "mongodb";
import type { ServiceContext } from "./types";
import type { UserDbObject, UserOauthProvider } from "../types/db";
import type { OAuthProviderName } from "../types/common";
import type { NullablePartial } from "../types/utils";

export class UserService {
  private collection = this.context.db.collection<UserDbObject>("users");
  private loader: DataLoader<string, UserDbObject | null>;

  constructor(private context: ServiceContext) {
    this.loader = new DataLoader(
      async (keys) => {
        const users = await this.collection
          .find({ _id: { $in: keys as string[] } })
          .toArray();
        // retain order
        return keys.map(
          (key) =>
            users.find(({ _id }: Pick<UserDbObject, "_id">) => _id === key) ||
            null
        );
      },
      { cache: !context.isWs }
    );
  }

  get me() {
    return this.context.user;
  }

  findById(id: string) {
    return this.loader.load(id);
  }

  async findByUsername(username: string) {
    const user = await this.collection.findOne({ username });
    // save to cache
    if (!user) return null;
    this.loader.clear(user._id).prime(user._id, user);
    return user;
  }

  async create({
    profilePicture,
    email,
    oauth,
    bio,
  }: Pick<UserDbObject, "profilePicture" | "email" | "oauth" | "bio">) {
    const username = hri.random() as string;
    const {
      ops: [user],
    } = await this.collection.insertOne({
      _id: nanoid(12),
      username,
      profilePicture,
      email,
      oauth,
      bio,
    });
    this.loader.prime(user._id, user);
    // send onboarding email
    if (email) {
      // to be implemented
    }
    return user;
  }

  async findOrCreate(
    userQuery: FilterQuery<UserDbObject>,
    userCreate: Pick<UserDbObject, "profilePicture" | "email" | "bio">,
    authTokens: {
      id: string;
      provider: OAuthProviderName;
      accessToken?: string;
      refreshToken?: string;
    }
  ) {
    // Beware of side effect
    this.context.user = await this.collection.findOne(userQuery);
    if (!this.context.user) {
      // We are accepting only YouTube/Google and Spotify signup currently
      if (
        authTokens.provider !== "youtube" &&
        authTokens.provider !== "spotify"
      )
        throw new ForbiddenError(
          "You must sign up with either YouTube or Spotify"
        );
      this.context.user = await this.create({
        ...userCreate,
        oauth: {
          [authTokens.provider]: authTokens,
        },
      });
      // @ts-expect-error: isNew is a special field to check if user is newly registered
      this.context.user.isNew = true;
    } else {
      // If user exists, update OAuth information
      await this.updateMeOauth(authTokens.provider, authTokens);
    }
    return this.context.user;
  }

  async updateMe({
    username: rawUsername,
    bio,
    profilePicture,
  }: NullablePartial<UserDbObject>) {
    if (!this.context.user) throw new AuthenticationError("");
    const username = rawUsername
      ? slug(rawUsername, {
          lower: true,
          symbols: false,
          charmap: {},
        }).substring(0, 15)
      : null;
    if (username) {
      const checkUser = await this.findByUsername(username);
      if (checkUser && checkUser._id !== this.context.user._id)
        throw new UserInputError("This username has been taken", ["username"]);
    }
    const { value: user } = await this.collection.findOneAndUpdate(
      { _id: this.context.user._id },
      {
        $set: {
          ...(username && { username }),
          ...(bio !== undefined && { bio }),
          ...(profilePicture && { profilePicture }),
        },
      },
      { returnOriginal: false }
    );
    // Update to cache
    if (user) {
      this.loader.clear(user._id).prime(user._id, user);
      Object.assign(this.context.user, user);
    }
    return user || null;
  }

  async deleteMe() {
    if (!this.context.user) throw new AuthenticationError("");
    const { deletedCount } = await this.collection.deleteOne({
      _id: this.context.user._id,
    });
    if (!deletedCount)
      throw new ForbiddenError("Cannot deactivate your account");
    await deleteCloudinaryImagesByPrefix(`users/${this.context.user._id}`);
    return true;
  }

  async updateMeOauth(
    provider: OAuthProviderName,
    {
      expiredAt,
      accessToken,
      refreshToken,
      id,
    }: {
      expiredAt?: Date;
      accessToken?: string | null;
      refreshToken?: string | null;
      id: string;
    }
  ) {
    if (!this.context.user) return null;

    // Make sure this provider is not linked with another account
    const isUsedElsewhere = !!(await this.collection.countDocuments({
      _id: { $ne: this.context.user._id },
      [`oauth.${provider}.id`]: id,
    }));
    if (isUsedElsewhere) {
      throw new ForbiddenError(
        `This '${provider}' account is linked to a different Stereo account.`
      );
    }

    const thisOauth = this.context.user.oauth[provider];

    if (thisOauth) {
      // Reconnect to an account

      // Check that this is not another account from the same provider
      if (id !== thisOauth.id)
        throw new ForbiddenError(
          `This Stereo account is linked to a different '${provider}' account.`
        );
    } else {
      // Only allow 1 music account
      if (
        (provider === "spotify" && this.context.user.oauth.youtube) ||
        (provider === "youtube" && this.context.user.oauth.spotify)
      ) {
        throw new ForbiddenError("You can only connect to one Music provider");
      }
    }

    (this.context.user.oauth[provider] as UserOauthProvider<
      typeof provider
    >) = {
      id,
      provider,
      ...(accessToken !== undefined && { accessToken }),
      ...(refreshToken !== undefined && { refreshToken }),
      ...(expiredAt !== undefined && { expiredAt }),
    };

    await this.collection.updateOne(
      { _id: this.context.user._id },
      { $set: { oauth: this.context.user.oauth } }
    );

    this.loader
      .clear(this.context.user._id)
      .prime(this.context.user._id, this.context.user);
    return this.context.user;
  }

  async removeMeOauth(provider: OAuthProviderName) {
    if (!this.context.user) throw new AuthenticationError("");
    if (Object.keys(this.context.user.oauth).length <= 1)
      throw new ForbiddenError("There must be at least one linked account");
    const oauthProvider = this.context.user.oauth[provider];
    if (!oauthProvider) throw new ForbiddenError("Account is not linked");
    await this.collection.updateOne(
      { _id: this.context.user._id },
      { $unset: { [`oauth.${provider}`]: "" } }
    );

    delete this.context.user.oauth[provider];
  }
}
