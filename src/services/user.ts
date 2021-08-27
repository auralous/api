import DataLoader from "dataloader";
import { nanoid } from "nanoid";
import slug from "slug";
import { AuthState } from "../auth/types.js";
import { db } from "../data/mongo.js";
import type { UserDbObject } from "../data/types.js";
import { CustomError, UnauthorizedError } from "../error/errors.js";
import { CONFIG } from "../utils/constant.js";
import type { NullablePartial } from "../utils/types.js";
import { SessionService } from "./session.js";
import { ServiceContext } from "./types.js";

export class UserService {
  private static collection = db.collection<UserDbObject>("users");

  static createLoader() {
    return new DataLoader(
      async (keys) => {
        const users = await UserService.collection
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
   * Invalidate dataloader after updates
   * @param context
   * @param session
   * @private
   */
  private static invalidateLoaderCache(
    context: ServiceContext,
    user: UserDbObject
  ) {
    context.loaders.user.clear(user._id).prime(user._id, user);
  }

  /**
   * Find a user by id
   * @param id
   */
  static findById(context: ServiceContext, id: string) {
    return context.loaders.user.load(id);
  }

  static async findManyByIds(context: ServiceContext, ids: string[]) {
    return (await context.loaders.user.loadMany(ids)).map((item) =>
      item instanceof Error ? null : item
    );
  }

  /**
   * Find a user by username
   * @param username
   */
  static async findByUsername(context: ServiceContext, username: string) {
    const user = await UserService.collection.findOne({ username });
    if (!user) return null;
    UserService.invalidateLoaderCache(context, user);
    return user;
  }

  static async create({
    profilePicture,
    email,
    oauthId,
    oauthProvider,
    bio,
  }: Pick<
    UserDbObject,
    "profilePicture" | "email" | "oauthId" | "oauthProvider" | "bio"
  >) {
    const _id = nanoid(12);
    const user: UserDbObject = {
      _id,
      username: _id,
      profilePicture,
      email,
      oauthId,
      oauthProvider,
      bio,
      createdAt: new Date(),
    };
    await UserService.collection.insertOne(user);
    // send onboarding email
    if (email) {
      // to be implemented
    }
    return user;
  }

  static async authOrCreate(
    authState: Pick<AuthState, "oauthId" | "provider">,
    data: Pick<UserDbObject, "profilePicture" | "email">
  ) {
    let me = await UserService.collection.findOne({
      oauthProvider: authState.provider,
      oauthId: authState.oauthId,
    });
    if (!me) {
      me = await UserService.create({
        ...data,
        oauthProvider: authState.provider,
        oauthId: authState.oauthId,
      });
      // @ts-expect-error: isNew is a special field to check if user is newly registered
      me.isNew = true;
    }
    return me;
  }

  static async updateMe(
    context: ServiceContext,
    {
      username: rawUsername,
      bio,
      profilePicture,
    }: NullablePartial<UserDbObject>
  ) {
    if (!context.auth) throw new UnauthorizedError();
    const username = rawUsername
      ? slug(rawUsername, {
          lower: true,
          symbols: false,
          charmap: {},
        }).substring(0, CONFIG.usernameMaxLength)
      : null;
    if (username) {
      const checkUser = await UserService.findByUsername(context, username);
      if (checkUser && checkUser._id !== context.auth.userId)
        throw new CustomError("error.username_taken", { username });
    }
    const { value: user } = await UserService.collection.findOneAndUpdate(
      { _id: context.auth.userId },
      {
        $set: {
          ...(username && { username }),
          ...(bio !== undefined && { bio }),
          ...(profilePicture && { profilePicture }),
        },
      },
      { returnDocument: "after" }
    );
    if (!user)
      throw new Error(`Cannot update user with id = ${context.auth.userId}`);
    return user;
  }

  static async deleteMe(context: ServiceContext) {
    if (!context.auth) throw new UnauthorizedError();
    const { deletedCount } = await UserService.collection.deleteOne({
      _id: context.auth.userId,
    });
    if (!deletedCount)
      throw new Error(`Cannot delete user with id = ${context.auth.userId}`);

    // delete every session
    const allSessions = await SessionService.findByCreatorId(
      context,
      context.auth.userId
    );

    const deletePromises: Promise<unknown>[] = [];

    for (const session of allSessions) {
      deletePromises.push(
        SessionService.deleteById(context, session._id.toHexString())
      );
    }

    await Promise.all(deletePromises);

    return true;
  }
}
