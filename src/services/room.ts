import DataLoader from "dataloader";
import { UpdateQuery } from "mongodb";
import { nanoid } from "nanoid";
import {
  AuthenticationError,
  ForbiddenError,
  UserInputError,
} from "../error/index";
import { deleteByPattern } from "../db/redis";
import { PUBSUB_CHANNELS, REDIS_KEY } from "../lib/constant";
import { deleteCloudinaryImagesByPrefix } from "../lib/cloudinary";
import { RoomDbObject } from "../types/db";
import { NullablePartial } from "../types/utils";
import { IRoomMembership, IRoomState } from "../types/resolvers.gen";
import { UserService } from "./user";
import { ServiceContext } from "./types";
import type Services from ".";

export class RoomService {
  private collection = this.context.db.collection<RoomDbObject>("rooms");
  private loader: DataLoader<string, RoomDbObject | null>;

  private userService: UserService;

  constructor(private context: ServiceContext, self: Services) {
    this.loader = new DataLoader(
      async (keys) => {
        const rooms = await this.collection
          .find({ _id: { $in: keys as string[] } })
          .toArray();
        // retain order
        return keys.map(
          (key) => rooms.find((room: RoomDbObject) => room._id === key) || null
        );
      },
      { cache: !context.isWs }
    );
    this.userService = self.User;
  }

  async create({
    title,
    description,
    isPublic,
    anyoneCanAdd,
    password,
  }: {
    title: string;
    description?: string | null;
    isPublic: boolean;
    anyoneCanAdd?: boolean | null;
    password?: string | null;
  }) {
    if (!this.context.user) throw new AuthenticationError("");
    const {
      ops: [room],
    } = await this.collection.insertOne({
      _id: nanoid(12),
      title,
      description: description || undefined,
      isPublic,
      creatorId: this.context.user._id,
      createdAt: new Date(),
      ...(typeof anyoneCanAdd === "boolean" && { anyoneCanAdd }),
      ...(typeof password === "string" && { password }),
    });
    this.loader.clear(room._id).prime(room._id, room);
    return room;
  }

  notifyStateUpdate(id: string) {
    this.context.pubsub.publish(PUBSUB_CHANNELS.roomStateUpdated, {
      roomStateUpdated: this.getRoomState(id),
    });
  }

  findById(id: string) {
    return this.loader.load(id);
  }

  async getRoomState(id: string): Promise<IRoomState | null> {
    const room = await this.findById(id);
    const isViewable = this.isViewable(id, this.context.user?._id);
    if (!room) return null;

    return {
      id,
      userIds: isViewable ? await this.getCurrentUsers(id) : [],
      anyoneCanAdd: room.anyoneCanAdd || false,
      collabs: (isViewable && room.collabs) || [],
    };
  }

  async findByCreatorId(creatorId: string) {
    return this.collection.find({ creatorId }).toArray();
  }

  async findRandom(size: number) {
    const rooms = await this.collection
      .aggregate([{ $sample: { size } }])
      .toArray();
    // save them to cache
    for (let i = 0; i < rooms.length; i += 1) {
      const { _id } = rooms[i];
      this.loader.clear(_id).prime(_id, rooms[i]);
    }
    return rooms;
  }

  async updateById(
    _id: string,
    {
      title,
      description,
      image,
      anyoneCanAdd,
      collabs,
      password,
    }: NullablePartial<RoomDbObject>
  ) {
    if (!this.context.user) throw new AuthenticationError("");
    const { value: room } = await this.collection.findOneAndUpdate(
      {
        _id,
        creatorId: this.context.user._id,
      },
      {
        $set: {
          ...(title && { title }),
          ...(description !== undefined && { description }),
          ...(image !== undefined && { image }),
          ...(collabs && { collabs }),
          ...(typeof anyoneCanAdd === "boolean" && { anyoneCanAdd }),
          ...(typeof password === "string" && { password }),
        },
      },
      { returnOriginal: false }
    );
    if (!room) throw new ForbiddenError("Cannot update room");
    // save to cache
    this.loader.clear(_id).prime(_id, room);

    // If anyoneCanAdd, collabs, is changed, publish to roomState
    if (collabs || typeof anyoneCanAdd === "boolean")
      this.notifyStateUpdate(_id);

    return room;
  }

  async isViewable(id: string, userId?: string): Promise<boolean> {
    const room = await this.findById(id);
    if (!room) return false;
    return room.isPublic || this.isMember(id, userId);
  }

  async isMember(id: string, userId?: string): Promise<boolean> {
    const room = await this.findById(id);
    if (!room || !userId) return false;
    return room.creatorId === userId || !!room.collabs?.includes(userId);
  }

  async updateMembershipById(
    _id: string,
    username: string,
    role?: IRoomMembership | null,
    isUserId = false,
    DANGEROUSLY_BYPASS_CHECK = false
  ) {
    if (!this.context.user) throw new AuthenticationError("");

    const addingUser = await this.userService[
      isUserId ? "findById" : "findByUsername"
    ](username);

    if (!addingUser)
      throw new UserInputError("User does not exist", ["username"]);

    if (addingUser._id === this.context.user._id && !DANGEROUSLY_BYPASS_CHECK)
      throw new UserInputError(
        `You added yourself... Wait you can't do that!`,
        ["userId"]
      );

    let update: UpdateQuery<RoomDbObject>;

    if (role === IRoomMembership.Collab) {
      update = {
        $addToSet: { collabs: addingUser._id },
      };
    } else {
      update = {
        $pull: { collabs: addingUser._id },
      };
    }

    const { value: room } = await this.collection.findOneAndUpdate(
      {
        _id,
        ...(!DANGEROUSLY_BYPASS_CHECK && { creatorId: this.context.user._id }),
      },
      update,
      { returnOriginal: false }
    );

    if (!room) throw new ForbiddenError("Cannot update room");
    // save to cache
    this.loader.clear(_id).prime(_id, room);

    // Publish
    this.notifyStateUpdate(_id);

    return room;
  }

  async deleteById(_id: string) {
    if (!this.context.user) throw new AuthenticationError("");
    const { deletedCount } = await this.collection.deleteOne({
      _id,
      creatorId: this.context.user._id,
    });
    if (!deletedCount) throw new ForbiddenError("Cannot delete room");
    // remove from cache
    this.loader.clear(_id);
    // delete associated
    await Promise.all([
      deleteCloudinaryImagesByPrefix(
        `users/${this.context.user._id}/rooms/${_id}`
      ),
      deleteByPattern(this.context.redis, `${REDIS_KEY.room(_id)}:*`),
    ]);
    return true;
  }

  async deleteByCreatorId(creatorId: string) {
    // Internal API. Used when deleting user
    const rooms = await this.findByCreatorId(creatorId);
    for (const room of rooms) {
      await this.deleteById(room._id);
    }
    return true;
  }

  async search(query: string, limit?: number | null) {
    const rooms = await this.collection
      .aggregate([
        { $searchBeta: { search: { query, path: "title" } } },
        { $limit: limit || 30 },
      ])
      .toArray();
    // save them to cache
    for (let i = 0; i < rooms.length; i += 1) {
      const id = rooms[i]._id.toString();
      this.loader.clear(id).prime(id, rooms[i]);
    }
    return rooms.filter(
      (room) => room.isPublic || room.creatorId === this.context.user?._id
    );
  }

  async setUserPresence(_id: string, userId: string, joining: boolean) {
    await this.context.redis[joining ? "sadd" : "srem"](
      REDIS_KEY.roomUsers(_id),
      userId
    );
    this.notifyStateUpdate(_id);
  }

  async getCurrentUsers(_id: string): Promise<string[]> {
    return this.context.redis.smembers(REDIS_KEY.roomUsers(_id));
  }
}
