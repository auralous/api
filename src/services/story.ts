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
import { MessageType, StoryMembership } from "../types/index";

import type { UpdateQuery } from "mongodb";
import type { ServiceContext } from "./types";
import type {
  StoryDbObject,
  NullablePartial,
  StoryPermission,
  StoryState,
  UserDbObject,
} from "../types/index";
import type { MessageService } from "./message";

export class StoryService {
  private collection = this.context.db.collection<StoryDbObject>("stories");
  private loader: DataLoader<string, StoryDbObject | null>;

  constructor(
    private context: ServiceContext,
    private messageService: MessageService
  ) {
    this.loader = new DataLoader(
      async (keys) => {
        const stories = await this.collection
          .find({ _id: { $in: keys as string[] } })
          .toArray();
        // retain order
        return keys.map(
          (key) =>
            stories.find((story: StoryDbObject) => story._id === key) || null
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
      ops: [story],
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
    this.loader.clear(story._id).prime(story._id, story);
    return story;
  }

  private async notifyStateUpdate(id: string) {
    this.context.pubsub.publish(PUBSUB_CHANNELS.storyStateUpdated, {
      storyStateUpdated: await this.getStoryState(id),
    });
  }

  findById(id: string) {
    return this.loader.load(id);
  }

  async getStoryState(id: string): Promise<StoryState | null> {
    const story = await this.findById(id);
    if (!story) return null;
    const permission = this.getPermission(story, this.context.user?._id);
    return {
      id,
      userIds: permission.viewable ? await this.getPresences(id) : [],
      anyoneCanAdd: story.anyoneCanAdd || false,
      collabs: (permission.viewable && story.collabs) || [],
      permission: permission,
    };
  }

  async findByCreatorId(creatorId: string) {
    return this.collection.find({ creatorId }).toArray();
  }

  async findRandom(size: number) {
    const stories = await this.collection
      .aggregate([{ $sample: { size } }])
      .toArray();
    // save them to cache
    for (let i = 0; i < stories.length; i += 1) {
      const { _id } = stories[i];
      this.loader.clear(_id).prime(_id, stories[i]);
    }
    return stories;
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
    }: NullablePartial<StoryDbObject>
  ) {
    if (!this.context.user) throw new AuthenticationError("");
    const { value: story } = await this.collection.findOneAndUpdate(
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
    if (!story) throw new ForbiddenError("Cannot update story");
    // save to cache
    this.loader.clear(_id).prime(_id, story);

    // If anyoneCanAdd, collabs, is changed, publish to storyState
    if (collabs || typeof anyoneCanAdd === "boolean")
      this.notifyStateUpdate(_id);

    return story;
  }

  getPermission(
    story: StoryDbObject,
    userId: string | undefined
  ): StoryPermission {
    const isMember =
      !!userId &&
      (story.creatorId === userId || !!story.collabs?.includes(userId));
    return {
      viewable: story.isPublic || isMember,
      queueCanAdd:
        Boolean(userId) &&
        (story.creatorId === userId || isMember || Boolean(story.anyoneCanAdd)),
      queueCanManage: story.creatorId === userId,
    };
  }

  async updateMembershipById(
    _id: string,
    addingUser: UserDbObject,
    role?: StoryMembership | null,
    DANGEROUSLY_BYPASS_CHECK = false
  ) {
    if (!this.context.user) throw new AuthenticationError("");

    if (addingUser._id === this.context.user._id && !DANGEROUSLY_BYPASS_CHECK)
      throw new UserInputError(
        `You added yourself... Wait you can't do that!`,
        ["userId"]
      );

    let update: UpdateQuery<StoryDbObject>;

    if (role === StoryMembership.Collab) {
      update = {
        $addToSet: { collabs: addingUser._id },
      };
    } else {
      update = {
        $pull: { collabs: addingUser._id },
      };
    }

    const { value: story } = await this.collection.findOneAndUpdate(
      {
        _id,
        ...(!DANGEROUSLY_BYPASS_CHECK && { creatorId: this.context.user._id }),
      },
      update,
      { returnOriginal: false }
    );

    if (!story) throw new ForbiddenError("Cannot update story");
    // save to cache
    this.loader.clear(_id).prime(_id, story);

    // Publish
    this.notifyStateUpdate(_id);

    return story;
  }

  async deleteById(_id: string) {
    if (!this.context.user) throw new AuthenticationError("");
    const { deletedCount } = await this.collection.deleteOne({
      _id,
      creatorId: this.context.user._id,
    });
    if (!deletedCount) throw new ForbiddenError("Cannot delete story");
    // remove from cache
    this.loader.clear(_id);
    // delete associated
    await Promise.all([
      deleteCloudinaryImagesByPrefix(
        `users/${this.context.user._id}/stories/${_id}`
      ),
      deleteByPattern(this.context.redis, `${REDIS_KEY.story(_id)}:*`),
    ]);
    return true;
  }

  async search(query: string, limit?: number | null) {
    const stories = await this.collection
      .aggregate([
        { $searchBeta: { search: { query, path: "title" } } },
        { $limit: limit || 30 },
      ])
      .toArray();
    // save them to cache
    for (let i = 0; i < stories.length; i += 1) {
      const id = stories[i]._id.toString();
      this.loader.clear(id).prime(id, stories[i]);
    }
    return stories.filter(
      (story) => story.isPublic || story.creatorId === this.context.user?._id
    );
  }

  async pingPresence(storyId: string, userId: string): Promise<void> {
    const story = await this.findById(storyId);
    if (!story || !this.getPermission(story, userId).viewable) return;
    const now = Date.now();
    // when was user last in story or possibly NaN if never in
    const lastTimestamp: number = parseInt(
      await this.context.redis.zscore(
        REDIS_KEY.storyUserStatus(storyId),
        userId
      ),
      10
    );

    const justJoined =
      !lastTimestamp || now - lastTimestamp > CONFIG.activityTimeout;

    // Ping that user is still here
    await this.context.redis.zadd(
      REDIS_KEY.storyUserStatus(storyId),
      now,
      userId
    );
    if (justJoined) {
      // notify that user just joined
      this.messageService.add(`story:${storyId}`, {
        text: storyId,
        type: MessageType.Join,
        creatorId: userId,
      });
      this.notifyStateUpdate(storyId);
    }
  }

  async getPresences(_id: string): Promise<string[]> {
    const minRange = Date.now() - CONFIG.activityTimeout;
    return this.context.redis.zrevrangebyscore(
      REDIS_KEY.storyUserStatus(_id),
      Infinity,
      minRange
    );
  }
}
