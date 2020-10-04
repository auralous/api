import DataLoader from "dataloader";
import {
  AuthenticationError,
  ForbiddenError,
  UserInputError,
} from "apollo-server-errors";
import { FilterQuery } from "mongodb";
import { nanoid } from "nanoid";
import slug from "slug";
// @ts-ignore
import { hri } from "human-readable-ids";
import { deleteCloudinaryImagesByPrefix } from "../lib/cloudinary";
import { BaseService, ServiceInit } from "./base";
import { UserDbObject, UserOauthProvider } from "../types/db";
import { OAuthProviderName } from "../types/common";
import { NullablePartial } from "../types/utils";

export class UserService extends BaseService {
  private collection = this.context.db.collection<UserDbObject>("users");
  private loader: DataLoader<string, UserDbObject | null>;
  constructor(options: ServiceInit) {
    super(options);
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
      { cache: !options.noCache }
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
      // Dangerous
      // Also sync playlist on user creation
      await this.services.Playlist.syncByPlatform(
        // Just created user only have one oauth
        // which is the platform they sign up with
        authTokens.provider
      );
      // Temporary set isNew flag to redirect user to Welcome page
      (this.context.user as any).isNew = true;
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
        throw new UserInputError("This username has been taken");
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
    await Promise.all([
      this.services.Room.deleteByCreatorId(this.context.user._id),
      deleteCloudinaryImagesByPrefix(`users/${this.context.user._id}`),
    ]);
    return true;
  }

  async updateMeOauth(
    provider: OAuthProviderName,
    {
      accessToken,
      refreshToken,
      id,
    }: {
      accessToken?: string | null;
      refreshToken?: string | null;
      id: string;
    }
  ) {
    if (!this.context.user) return null;

    const $set: any = {};

    // Make sure this provider is not linked with another account
    const checkingUser = await this.collection.findOne({
      [`oauth.${provider}`]: { $exists: true },
    });

    if (checkingUser && checkingUser._id !== this.context.user._id) {
      throw new UserInputError(
        "This service account is linked to another Stereo account."
      );
    }

    const thisOauth = this.context.user.oauth[provider];

    if (thisOauth) {
      // Reconnect to an account

      // Check that this is not another account from the same provider
      if (id !== thisOauth.id)
        throw new UserInputError(
          "You have already linked to another account. Disconnect it before continuing."
        );

      if (accessToken !== undefined)
        thisOauth.accessToken = $set[
          `oauth.${provider}.accessToken`
        ] = accessToken;
      if (refreshToken !== undefined)
        thisOauth.refreshToken = $set[
          `oauth.${provider}.refreshToken`
        ] = refreshToken;
    } else {
      // Only allow 1 music account
      if (
        (provider === "spotify" && this.context.user.oauth.youtube) ||
        (provider === "youtube" && this.context.user.oauth.spotify)
      ) {
        throw new ForbiddenError("You can only connect to one Music provider");
      }
      // Connect to a new account
      $set[`oauth.${provider}`] = (this.context.user.oauth[
        provider
      ] as UserOauthProvider<typeof provider>) = {
        id,
        provider,
        ...(accessToken !== undefined && { accessToken }),
        ...(refreshToken !== undefined && { refreshToken }),
      };
      // Reinitialize with the new auth
      this.services.Service.reinitialize();
    }

    await this.collection.updateOne({ _id: this.context.user._id }, { $set });

    if (provider === "youtube" || provider === "spotify") {
      // Dangerous
      await this.services.Playlist.syncByPlatform(provider);
    }

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

    if (provider === "spotify" || provider === "youtube")
      await this.services.Playlist.removeByMineByPlatform(provider);

    delete this.context.user.oauth[provider];
  }

  // Room Function
  async setPresence({ roomId }: { roomId?: string | null } = {}) {
    if (!this.context.user) return;

    if (roomId !== undefined) {
      const lastRoomId = await this.context.redis.hget(
        `user:${this.context.user._id}:state`,
        "where"
      );
      if (lastRoomId && lastRoomId !== roomId) {
        const [, roomTypeId] = lastRoomId.split(":");
        await this.services.Room.setUserPresence(roomTypeId, false);
      }
      if (roomId) {
        await this.context.redis.hset(
          `user:${this.context.user._id}:state`,
          "where",
          roomId
        );
        const [, roomTypeId] = roomId.split(":");
        await this.services.Room.setUserPresence(roomTypeId, true);
      } else {
        await this.context.redis.hdel(
          `user:${this.context.user._id}:state`,
          "where"
        );
      }
    }
  }
}
