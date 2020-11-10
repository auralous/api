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

import type { ServiceContext } from "./types";
import { UserDbObject, NullablePartial } from "../types/index";

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
    oauthQuery: Pick<UserDbObject["oauth"], "provider" | "id">,
    data: Pick<UserDbObject, "profilePicture" | "email" | "bio" | "oauth">
  ) {
    // Beware of side effect
    this.context.user = await this.collection.findOne({
      "oauth.provider": oauthQuery.provider,
      "oauth.id": oauthQuery.id,
    });
    if (!this.context.user) {
      // Create new user
      // Passport does not provide expiredAt value so we are assuming 30 min
      data.oauth.expiredAt =
        data.oauth.expiredAt || new Date(Date.now() + 30 * 60 * 1000);
      this.context.user = await this.create(data);
      // @ts-expect-error: isNew is a special field to check if user is newly registered
      this.context.user.isNew = true;
    } else {
      // If user exists, update OAuth tokens
      await this.updateMeOauth(data.oauth);
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

  async updateMeOauth({
    expiredAt,
    accessToken,
    refreshToken,
  }: {
    expiredAt?: Date | null;
    accessToken?: string | null;
    refreshToken?: string | null;
  }) {
    if (!this.context.user) return null;

    this.context.user.oauth = {
      ...this.context.user.oauth,
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
}
