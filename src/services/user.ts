import DataLoader from "dataloader";
import { nanoid } from "nanoid";
import slug from "slug";
import {
  AuthenticationError,
  ForbiddenError,
  UserInputError,
} from "../error/index";
import { deleteCloudinaryImagesByPrefix } from "../lib/cloudinary";
import { CONFIG } from "../lib/constant";
import type { NullablePartial, UserDbObject } from "../types/index";
import { StoryService } from "./story";
import type { ServiceContext } from "./types";

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
      { cache: false }
    );
  }

  /**
   * Find a user by id
   * @param id
   */
  findById(id: string) {
    return this.loader.load(id);
  }

  /**
   * Find a user by username
   * @param username
   */
  async findByUsername(username: string) {
    const user = await this.collection.findOne({ username });
    if (!user) return null;
    return user;
  }

  async create({
    profilePicture,
    email,
    oauth,
    bio,
  }: Pick<UserDbObject, "profilePicture" | "email" | "oauth" | "bio">) {
    const _id = nanoid(12);
    const {
      ops: [user],
    } = await this.collection.insertOne({
      _id,
      username: _id,
      profilePicture,
      email,
      oauth,
      bio,
      createdAt: new Date(),
    });
    this.loader.prime(user._id, user);
    // send onboarding email
    if (email) {
      // to be implemented
    }
    return user;
  }

  async authOrCreate(
    oauth: UserDbObject["oauth"],
    data: Pick<UserDbObject, "profilePicture" | "email" | "bio">
  ) {
    let me = await this.collection.findOne({
      "oauth.provider": oauth.provider,
      "oauth.id": oauth.id,
    });
    if (!me) {
      oauth.expiredAt =
        oauth.expiredAt || new Date(Date.now() + 30 * 60 * 1000);
      me = await this.create({ ...data, oauth });
      // @ts-expect-error: isNew is a special field to check if user is newly registered
      me.isNew = true;
    } else {
      // If user exists, update OAuth tokens
      await this.updateMeOauth(me, oauth);
    }
    return me;
  }

  async updateMe(
    me: UserDbObject | null,
    {
      username: rawUsername,
      bio,
      profilePicture,
    }: NullablePartial<UserDbObject>
  ) {
    if (!me) throw new AuthenticationError("");
    const username = rawUsername
      ? slug(rawUsername, {
          lower: true,
          symbols: false,
          charmap: {},
        }).substring(0, CONFIG.usernameMaxLength)
      : null;
    if (username) {
      const checkUser = await this.findByUsername(username);
      if (checkUser && checkUser._id !== me._id)
        throw new UserInputError("This username has been taken", ["username"]);
    }
    const { value: user } = await this.collection.findOneAndUpdate(
      { _id: me._id },
      {
        $set: {
          ...(username && { username }),
          ...(bio !== undefined && { bio }),
          ...(profilePicture && { profilePicture }),
        },
      },
      { returnOriginal: false }
    );
    return user || null;
  }

  async deleteMe(me: UserDbObject | null) {
    if (!me) throw new AuthenticationError("");
    const { deletedCount } = await this.collection.deleteOne({
      _id: me._id,
    });
    if (!deletedCount)
      throw new ForbiddenError("Cannot deactivate your account");

    // delete every story
    const storyService = new StoryService(this.context);
    const allStories = await storyService.findByCreatorId(me._id);
    for (const story of allStories) {
      await storyService.deleteById(me, story._id.toHexString());
    }

    await deleteCloudinaryImagesByPrefix(`users/${me._id}`);
    return true;
  }

  async updateMeOauth(
    me: UserDbObject | null,
    {
      expiredAt,
      accessToken,
      refreshToken,
    }: {
      expiredAt?: Date | null;
      accessToken?: string | null;
      refreshToken?: string | null;
    }
  ) {
    if (!me) return null;

    me.oauth = {
      ...me.oauth,
      ...(accessToken !== undefined && { accessToken }),
      ...(refreshToken !== undefined && { refreshToken }),
      ...(expiredAt !== undefined && { expiredAt }),
    };

    await this.collection.updateOne(
      { _id: me._id },
      { $set: { oauth: me.oauth } }
    );
    return me;
  }
}
