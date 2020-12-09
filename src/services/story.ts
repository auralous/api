import DataLoader from "dataloader";
import { ObjectID } from "mongodb";
import { AuthenticationError, ForbiddenError } from "../error/index";
import { deleteByPattern } from "../db/redis";
import { PUBSUB_CHANNELS, REDIS_KEY, CONFIG } from "../lib/constant";
import { deleteCloudinaryImagesByPrefix } from "../lib/cloudinary";
import { MessageType, UserDbObject } from "../types/index";

import type { ServiceContext } from "./types";
import type { StoryDbObject, NullablePartial } from "../types/index";
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
          .find({ _id: { $in: keys.map(ObjectID.createFromHexString) } })
          .toArray()
          .then((stories) => stories.map((s) => this.checkStoryStatus(s)));
        // retain order
        return keys.map(
          (key) =>
            stories.find(
              (story: StoryDbObject) => story._id.toHexString() === key
            ) || null
        );
      },
      { cache: !context.isWs }
    );
  }

  // Return the story itself but switch it to "published if applicable"
  private checkStoryStatus(story: StoryDbObject): StoryDbObject {
    if (
      story.isLive &&
      Date.now() - story.lastCreatorActivityAt.getTime() >
        CONFIG.storyLiveTimeout
    ) {
      // creator is not active in awhile unlive story
      story.isLive = false;
      // async update it
      this.unliveStory(story._id.toHexString());
    }
    return story;
  }

  async unliveStory(storyId: string): Promise<StoryDbObject> {
    return this.updateById(storyId, { isLive: false });
  }

  async create({ text, isPublic }: Pick<StoryDbObject, "text" | "isPublic">) {
    if (!this.context.user) throw new AuthenticationError("");

    const createdAt = new Date();

    text = text.trim().substring(0, CONFIG.storyTextMaxLength);

    const {
      ops: [story],
    } = await this.collection.insertOne({
      text,
      isPublic,
      creatorId: this.context.user._id,
      createdAt,
      isLive: true,
      viewable: [],
      queueable: [],
      lastCreatorActivityAt: createdAt,
    });
    const idStr = story._id.toHexString();
    this.loader.clear(idStr).prime(idStr, story);
    return story;
  }

  findById(id: string) {
    return this.loader.load(id);
  }

  async findByCreatorId(creatorId: string) {
    return this.collection
      .find({ creatorId })
      .sort({ $natural: -1 })
      .toArray()
      .then((stories) => stories.map((s) => this.checkStoryStatus(s)));
  }

  async findForFeedPublic(
    limit: number,
    next?: string | null
  ): Promise<StoryDbObject[]> {
    return this.collection
      .find({
        isPublic: true,
        ...(next && { _id: { $lt: new ObjectID(next) } }),
      })
      .sort({ $natural: -1 })
      .limit(limit)
      .toArray()
      .then((stories) => stories.map((s) => this.checkStoryStatus(s)));
  }

  // Manage API

  async updateById(
    id: string,
    {
      text,
      image,
      queueable,
      lastCreatorActivityAt,
      isLive,
    }: NullablePartial<StoryDbObject>
  ): Promise<StoryDbObject> {
    if (!this.context.user) throw new AuthenticationError("");
    const { value: story } = await this.collection.findOneAndUpdate(
      {
        _id: new ObjectID(id),
        creatorId: this.context.user._id,
      },
      {
        $set: {
          ...(text && { text }),
          ...(image !== undefined && { image }),
          ...(queueable && { queueable }),
          ...(lastCreatorActivityAt && { lastCreatorActivityAt }),
          ...(typeof isLive === "boolean" && { isLive }),
        },
      },
      { returnOriginal: false }
    );
    if (!story) throw new ForbiddenError("Cannot update story");
    // save to cache
    this.loader.clear(id).prime(id, story);

    return story;
  }

  async deleteById(id: string) {
    if (!this.context.user) throw new AuthenticationError("");
    const { deletedCount } = await this.collection.deleteOne({
      _id: new ObjectID(id),
      creatorId: this.context.user._id,
    });
    if (!deletedCount) throw new ForbiddenError("Cannot delete story");
    // remove from cache
    this.loader.clear(id);
    // delete associated
    await Promise.all([
      deleteCloudinaryImagesByPrefix(
        `users/${this.context.user._id}/stories/${id}`
      ),
      deleteByPattern(this.context.redis, `${REDIS_KEY.story(id)}:*`),
    ]);
    return true;
  }

  async addOrRemoveQueueable(
    id: string,
    addingUser: UserDbObject,
    isRemoving: boolean
  ) {
    if (!this.context.user) throw new AuthenticationError("");
    const { value: story } = await this.collection.findOneAndUpdate(
      {
        _id: new ObjectID(id),
        creatorId: this.context.user._id,
      },
      isRemoving
        ? { $pull: { queueable: addingUser._id } }
        : { $addToSet: { queueable: addingUser._id } },
      { returnOriginal: false }
    );
    if (!story) throw new ForbiddenError("Cannot update story");
    return story;
  }

  // Presence API

  async pingPresence(storyId: string, userId: string): Promise<void> {
    const story = await this.findById(storyId);
    if (!story || !this.getPermission(story, userId).isViewable) return;

    // update lastCreatorActivityAt
    if (userId === story.creatorId) {
      await this.updateById(storyId, { lastCreatorActivityAt: new Date() });
    }

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
      // notify that user just joined via message
      this.messageService.add(`story:${storyId}`, {
        text: storyId,
        type: MessageType.Join,
        creatorId: userId,
      });

      // Notify story user update via subscription
      this.context.pubsub.publish(PUBSUB_CHANNELS.storyUsersUpdated, {
        id: storyId,
        storyUsersUpdated: await this.getPresences(storyId),
      });
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

  // Util

  getPermission(
    story: StoryDbObject,
    userId: string | undefined
  ): { isViewable: boolean; isQueueable: boolean } {
    return {
      isViewable:
        story.isPublic ||
        story.creatorId === userId ||
        (!!userId && !!story.viewable.includes(userId)),
      isQueueable: Boolean(
        !!userId &&
          (story.creatorId === userId || story.queueable.includes(userId))
      ),
    };
  }
}
