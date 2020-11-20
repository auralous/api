import DataLoader from "dataloader";
import { nanoid } from "nanoid";
import {
  AuthenticationError,
  ForbiddenError,
  UserInputError,
} from "../error/index";
import { deleteByPattern } from "../db/redis";
import { PUBSUB_CHANNELS, REDIS_KEY, CONFIG } from "../lib/constant";
import { deleteCloudinaryImagesByPrefix } from "../lib/cloudinary";
import { MessageType, RoomMembership } from "../types/index";

import type { UpdateQuery } from "mongodb";
import type { ServiceContext } from "./types";
import type {
  RoomDbObject,
  NullablePartial,
  RoomPermission,
  RoomState,
  UserDbObject,
} from "../types/index";
import type { MessageService } from "./message";

export class RoomService {
  private collection = this.context.db.collection<RoomDbObject>("rooms");
  private loader: DataLoader<string, RoomDbObject | null>;

  constructor(
    private context: ServiceContext,
    private messageService: MessageService
  ) {
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

  private notifyStateUpdate(id: string) {
    this.context.pubsub.publish(PUBSUB_CHANNELS.roomStateUpdated, {
      roomStateUpdated: this.getRoomState(id),
    });
  }

  findById(id: string) {
    return this.loader.load(id);
  }

  async getRoomState(id: string): Promise<RoomState | null> {
    const room = await this.findById(id);
    if (!room) return null;
    const permission = this.getPermission(room, this.context.user?._id);
    return {
      id,
      userIds: permission.viewable ? await this.getPresences(id) : [],
      anyoneCanAdd: room.anyoneCanAdd || false,
      collabs: (permission.viewable && room.collabs) || [],
      permission: permission,
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

  getPermission(
    room: RoomDbObject,
    userId: string | undefined
  ): RoomPermission {
    const isMember =
      !!userId &&
      (room.creatorId === userId || !!room.collabs?.includes(userId));
    return {
      viewable: room.isPublic || isMember,
      queueCanAdd:
        Boolean(userId) &&
        (room.creatorId === userId || isMember || Boolean(room.anyoneCanAdd)),
      queueCanManage: room.creatorId === userId,
    };
  }

  async updateMembershipById(
    _id: string,
    addingUser: UserDbObject,
    role?: RoomMembership | null,
    DANGEROUSLY_BYPASS_CHECK = false
  ) {
    if (!this.context.user) throw new AuthenticationError("");

    if (addingUser._id === this.context.user._id && !DANGEROUSLY_BYPASS_CHECK)
      throw new UserInputError(
        `You added yourself... Wait you can't do that!`,
        ["userId"]
      );

    let update: UpdateQuery<RoomDbObject>;

    if (role === RoomMembership.Collab) {
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

  async pingPresence(roomId: string, userId: string): Promise<void> {
    const room = await this.findById(roomId);
    if (!room || !this.getPermission(room, userId).viewable) return;
    const now = Date.now();
    // when was user last in room or possibly NaN if never in
    const lastTimestamp: number = parseInt(
      await this.context.redis.zscore(REDIS_KEY.roomUserStatus(roomId), userId),
      10
    );

    const justJoined =
      !lastTimestamp || now - lastTimestamp > CONFIG.activityTimeout;

    // Ping that user is still here
    await this.context.redis.zadd(
      REDIS_KEY.roomUserStatus(roomId),
      now,
      userId
    );
    if (justJoined) {
      // notify that user just joined
      this.messageService.add(`room:${roomId}`, {
        text: roomId,
        type: MessageType.Join,
        creatorId: userId,
      });
      this.notifyStateUpdate(roomId);
    }
  }

  async getPresences(_id: string): Promise<string[]> {
    const minRange = Date.now() - CONFIG.activityTimeout;
    return this.context.redis.zrevrangebyscore(
      REDIS_KEY.roomUserStatus(_id),
      Infinity,
      minRange
    );
  }
}
