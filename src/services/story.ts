import DataLoader from "dataloader";
import { nanoid } from "nanoid";
import { AuthenticationError, ForbiddenError } from "../error/index";
import { deleteByPattern } from "../db/redis";
import { PUBSUB_CHANNELS, REDIS_KEY, CONFIG } from "../lib/constant";
import { deleteCloudinaryImagesByPrefix } from "../lib/cloudinary";
import { MessageType } from "../types/index";

import type { ServiceContext } from "./types";
import type {
  StoryDbObject,
  NullablePartial,
  StoryPermission,
  StoryState,
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

  async create({ text, isPublic }: Pick<StoryDbObject, "text" | "isPublic">) {
    if (!this.context.user) throw new AuthenticationError("");
    const {
      ops: [story],
    } = await this.collection.insertOne({
      _id: nanoid(12),
      text,
      isPublic,
      creatorId: this.context.user._id,
      createdAt: new Date(),
      viewable: [],
      queueable: [],
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
      userIds: permission.isViewable ? await this.getPresences(id) : [],
      queueable: (permission.isViewable && story.queueable) || [],
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
    { text, image, queueable }: NullablePartial<StoryDbObject>
  ) {
    if (!this.context.user) throw new AuthenticationError("");
    const { value: story } = await this.collection.findOneAndUpdate(
      {
        _id,
        creatorId: this.context.user._id,
      },
      {
        $set: {
          ...(text && { text }),
          ...(image !== undefined && { image }),
          ...(queueable && { queueable }),
        },
      },
      { returnOriginal: false }
    );
    if (!story) throw new ForbiddenError("Cannot update story");
    // save to cache
    this.loader.clear(_id).prime(_id, story);

    if (queueable) this.notifyStateUpdate(_id);

    return story;
  }

  getPermission(
    story: StoryDbObject,
    userId: string | undefined
  ): StoryPermission {
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

  async pingPresence(storyId: string, userId: string): Promise<void> {
    const story = await this.findById(storyId);
    if (!story || !this.getPermission(story, userId).isViewable) return;
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
