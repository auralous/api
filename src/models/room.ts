import DataLoader from "dataloader";
import { UpdateQuery } from "mongodb";
import {
  AuthenticationError,
  ForbiddenError,
  UserInputError,
} from "apollo-server-errors";
import { nanoid } from "nanoid";
import { BaseModel, ModelInit } from "./base";
import { deleteByPattern } from "../db/redis";
import { REDIS_KEY } from "../lib/constant";
import { deleteCloudinaryImagesByPrefix } from "../lib/cloudinary";
import { RoomDbObject } from "../types/db";
import { NullablePartial } from "../types/utils";
import { IRoomMembership } from "../types/resolvers.gen";

export class RoomModel extends BaseModel {
  private collection = this.context.db.collection<RoomDbObject>("rooms");
  private loader: DataLoader<string, RoomDbObject | null>;
  constructor(options: ModelInit) {
    super(options);
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
      { cache: !options.noCache }
    );
  }

  async create({
    title,
    description,
  }: {
    title: string;
    description?: string | null;
  }) {
    if (!this.context.user) throw new AuthenticationError("");
    const {
      ops: [room],
    } = await this.collection.insertOne({
      _id: nanoid(12),
      title,
      description: description || undefined,
      isPublic: true,
      creatorId: this.context.user._id,
      createdAt: new Date(),
    });
    this.loader.clear(room._id).prime(room._id, room);
    return room;
  }

  findById(id: string) {
    return this.loader.load(id);
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
    return rooms.filter(
      (room) => room.isPublic || room.creatorId === this.context.user?._id
    );
  }

  async updateById(
    _id: string,
    {
      title,
      description,
      image,
      anyoneCanAdd,
      collabs,
      queueMax,
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
          ...(typeof queueMax === "number" && { queueMax }),
          ...(collabs && { collabs }),
          ...(typeof anyoneCanAdd === "boolean" && { anyoneCanAdd }),
        },
      },
      { returnOriginal: false }
    );
    if (!room) throw new ForbiddenError("Cannot update room");
    // save to cache
    this.loader.clear(_id).prime(_id, room);

    // If anyoneCanAdd, collabs, or queueMax is changed, publish to roomState
    if (
      typeof queueMax === "number" ||
      collabs ||
      typeof anyoneCanAdd === "boolean"
    )
      this.context.pubsub.publish("ROOM_STATE_UPDATED", {
        roomStateUpdated: { id: _id },
      });

    return room;
  }

  async updateMembershipById(
    _id: string,
    username: string,
    role?: IRoomMembership | null,
    isUserId = false
  ) {
    if (!this.context.user) throw new AuthenticationError("");

    if (this.context.user.username === username)
      throw new UserInputError(`You added yourself... Wait you can't do that!`);

    const addingUser = await this.services.User[
      isUserId ? "findById" : "findByUsername"
    ](username);
    if (!addingUser) throw new UserInputError("User does not exist");

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
      { _id, creatorId: this.context.user._id },
      update,
      { returnOriginal: false }
    );

    if (!room) throw new ForbiddenError("Cannot update room");
    // save to cache
    this.loader.clear(_id).prime(_id, room);

    // Publish
    this.context.pubsub.publish("ROOM_STATE_UPDATED", {
      roomStateUpdated: { id: _id },
    });

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

  async setUserPresence(_id: string, joining: boolean) {
    const room = await this.findById(_id);
    if (!room) return;
    if (this.context.user) {
      if (joining === true) {
        await this.context.redis.sadd(
          REDIS_KEY.roomUsers(_id),
          this.context.user._id
        );
      } else {
        await this.context.redis.srem(
          REDIS_KEY.roomUsers(_id),
          this.context.user._id
        );
      }
      this.context.pubsub.publish("ROOM_STATE_UPDATED", {
        roomStateUpdated: { id: _id },
      });
    }
  }

  async getCurrentUsers(_id: string): Promise<string[]> {
    return this.context.redis.smembers(REDIS_KEY.roomUsers(_id));
  }
}
