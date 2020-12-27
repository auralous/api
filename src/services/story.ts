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

  /**
   * Notify the story has changed
   * Possibly because a new queueable, viewable, or isLive
   * @param story
   */
  private notifyUpdate(story: StoryDbObject) {
    this.context.pubsub.publish(PUBSUB_CHANNELS.storyUpdated, {
      id: story._id.toHexString(),
      storyUpdated: story,
    });
  }

  /**
   * Check a story to see if it needs to be unlived
   * Sometimes, the creator does not unlive a story manually
   * We define a inactivity duration to unlive the story (CONFIG.storyLiveTimeout)
   * This is often run everytime a story is accessed (either by itself or as part of a collection)
   * Return the story itself for convenience passing into callbacks
   * @param story
   */
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

  /**
   * Unlive a story (aka archieved)
   * An unlived stories can be replayed at any time
   * but no new songs can be added to it
   * @param storyId
   */
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
    this.notifyUpdate(value);
    return true;
  }

  /**
   * Create a story
   * @param me
   * @param param1 data of the new story
   */
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
    return story;
  }

  /**
   * Find a story by id
   * @param id
   */
  findById(id: string) {
    return this.loader.load(id);
  }

  /**
   * Find stories created by a user
   * @param creatorId
   * @param limit
   * @param next
   */
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

  /**
   * Find all public stories
   * @param limit
   * @param next
   */
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

  /**
   * Update a story by id
   * @param me the creator of this story
   * @param id
   * @param param2
   */
  async updateById(
    me: UserDbObject | null,
    id: string,
    { text, image, queueable, isLive }: NullablePartial<StoryDbObject>
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
          ...(typeof isLive === "boolean" && { isLive }),
        },
      },
      { returnOriginal: false }
    );
    if (!story) throw new ForbiddenError("Cannot update story");
    this.notifyUpdate(story);
    return story;
  }

  /**
   * Delete a story by id
   * @param me the creator of that story
   * @param id
   */
  async deleteById(me: UserDbObject | null, id: string) {
    if (!me) throw new AuthenticationError("");
    const { deletedCount } = await this.collection.deleteOne({
      _id: new ObjectID(id),
      creatorId: me._id,
    });
    if (!deletedCount) throw new ForbiddenError("Cannot delete story");
    // delete associated
    await Promise.all([
      deleteCloudinaryImagesByPrefix(`users/${me._id}/stories/${id}`),
      deleteByPattern(this.context.redis, `${REDIS_KEY.story(id)}:*`),
    ]);
    return true;
  }

  /**
   * Add or remove the queueable by id
   * @param me the creator of that story
   * @param id
   * @param addingUser
   * @param isRemoving
   */
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

  /**
   * Notify that the user is still in story
   * @param messageService
   * @param user
   * @param storyId
   */
  async pingPresence(
    messageService: MessageService,
    user: UserDbObject,
    storyId: string
  ): Promise<void> {
    const story = await this.findById(storyId);
    if (!story || !StoryService.getPermission(user, story).isViewable)
      throw new ForbiddenError("Cannot ping to this story");

    // update lastCreatorActivityAt since the pinging user is create
    if (user?._id === story.creatorId) {
      await this.collection.updateOne(
        { _id: new ObjectID(storyId), creatorId: user._id },
        { $set: { lastCreatorActivityAt: new Date() } }
      );
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

  /**
   * Get all user currently in a room
   * @param _id
   */
  async getPresences(_id: string): Promise<string[]> {
    const minRange = Date.now() - CONFIG.activityTimeout;
    return this.context.redis.zrevrangebyscore(
      REDIS_KEY.storyUserStatus(_id),
      Infinity,
      minRange
    );
  }

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
