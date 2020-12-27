import DataLoader from "dataloader";
import { ObjectID } from "mongodb";
import { AuthenticationError, ForbiddenError } from "../error/index";
import { deleteByPattern } from "../db/redis";
import { PUBSUB_CHANNELS, REDIS_KEY, CONFIG } from "../lib/constant";
import { deleteCloudinaryImagesByPrefix } from "../lib/cloudinary";
import { MessageType, UserDbObject } from "../types/index";

import type { ServiceContext } from "./types";
import type { StoryDbObject, NullablePartial } from "../types/index";
import { NowPlayingWorker } from "./nowPlayingWorker";
import { MessageService } from "./message";

export class StoryService {
  private collection = this.context.db.collection<StoryDbObject>("stories");
  private loader: DataLoader<string, StoryDbObject | null>;

  constructor(private context: ServiceContext) {
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
      { cache: false }
    );
  }

  notifyUpdate(story: StoryDbObject) {
    this.context.pubsub.publish(PUBSUB_CHANNELS.storyUpdated, {
      id: story._id.toHexString(),
      storyUpdated: story,
    });
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

  async unliveStory(storyId: string): Promise<boolean> {
    // WARN: this does not check auth
    // Delete queue. See QueueService#deleteById
    await this.context.redis.del(REDIS_KEY.queue(storyId));
    // Skip/Stop nowPlaying
    NowPlayingWorker.requestSkip(this.context.pubsub, storyId);
    // Unlive it
    const { value } = await this.collection.findOneAndUpdate(
      { _id: new ObjectID(storyId) },
      { $set: { isLive: false } },
      { returnOriginal: false }
    );
    if (!value) return false;
    this.loader.clear(storyId).prime(storyId, value);
    this.notifyUpdate(value);
    return true;
  }

  async create(
    me: UserDbObject | null,
    { text, isPublic }: Pick<StoryDbObject, "text" | "isPublic">
  ) {
    if (!me) throw new AuthenticationError("");

    const createdAt = new Date();

    text = text.trim().substring(0, CONFIG.storyTextMaxLength);

    // Unlive all other stories
    await this.collection.updateMany(
      { isLive: true, creatorId: me._id },
      { $set: { isLive: false } }
    );

    const {
      ops: [story],
    } = await this.collection.insertOne({
      text,
      isPublic,
      creatorId: me._id,
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

  async findByCreatorId(
    creatorId: string,
    limit?: number,
    next?: string | null
  ) {
    return this.collection
      .find({ creatorId, ...(next && { _id: { $lt: new ObjectID(next) } }) })
      .sort({ $natural: -1 })
      .limit(limit || 99999)
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
    me: UserDbObject | null,
    id: string,
    {
      text,
      image,
      queueable,
      lastCreatorActivityAt,
      isLive,
    }: NullablePartial<StoryDbObject>
  ): Promise<StoryDbObject> {
    if (!me) throw new AuthenticationError("");
    const { value: story } = await this.collection.findOneAndUpdate(
      {
        _id: new ObjectID(id),
        creatorId: me._id,
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
    this.notifyUpdate(story);
    return story;
  }

  async deleteById(me: UserDbObject | null, id: string) {
    if (!me) throw new AuthenticationError("");
    const { deletedCount } = await this.collection.deleteOne({
      _id: new ObjectID(id),
      creatorId: me._id,
    });
    if (!deletedCount) throw new ForbiddenError("Cannot delete story");
    // remove from cache
    this.loader.clear(id);
    // delete associated
    await Promise.all([
      deleteCloudinaryImagesByPrefix(`users/${me._id}/stories/${id}`),
      deleteByPattern(this.context.redis, `${REDIS_KEY.story(id)}:*`),
    ]);
    return true;
  }

  async addOrRemoveQueueable(
    me: UserDbObject | null,
    id: string,
    addingUser: UserDbObject,
    isRemoving: boolean
  ) {
    if (!me) throw new AuthenticationError("");
    const { value: story } = await this.collection.findOneAndUpdate(
      {
        _id: new ObjectID(id),
        creatorId: me._id,
      },
      isRemoving
        ? { $pull: { queueable: addingUser._id } }
        : { $addToSet: { queueable: addingUser._id } },
      { returnOriginal: false }
    );
    if (!story) throw new ForbiddenError("Cannot update story");
    this.notifyUpdate(story);
    return true;
  }

  // Presence API

  async pingPresence(
    messageService: MessageService,
    user: UserDbObject,
    storyId: string
  ): Promise<void> {
    const story = await this.findById(storyId);
    if (!story || !StoryService.getPermission(user, story).isViewable)
      throw new ForbiddenError("Cannot ping to this story");

    // update lastCreatorActivityAt
    if (user?._id === story.creatorId) {
      await this.updateById(user, storyId, {
        lastCreatorActivityAt: new Date(),
      });
    }

    const now = Date.now();
    // when was user last in story or possibly NaN if never in
    const lastTimestamp: number = parseInt(
      await this.context.redis.zscore(
        REDIS_KEY.storyUserStatus(storyId),
        user._id
      ),
      10
    );

    const justJoined =
      !lastTimestamp || now - lastTimestamp > CONFIG.activityTimeout;

    // Ping that user is still here
    await this.context.redis.zadd(
      REDIS_KEY.storyUserStatus(storyId),
      now,
      user._id
    );

    if (justJoined) {
      // notify that user just joined via message
      messageService.add(`story:${storyId}`, {
        text: storyId,
        type: MessageType.Join,
        creatorId: user._id,
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
  /**
   * Get a user's permission to a story
   * @param user the user in question, possibly null
   * @param story
   */
  static getPermission(
    user: UserDbObject | null,
    story: StoryDbObject
  ): { isViewable: boolean; isQueueable: boolean } {
    return {
      isViewable:
        story.isPublic ||
        story.creatorId === user?._id ||
        (!!user?._id && !!story.viewable.includes(user._id)),
      isQueueable: Boolean(
        !!user?._id &&
          (story.creatorId === user._id || story.queueable.includes(user._id))
      ),
    };
  }
}
