import DataLoader from "dataloader";
import mongodb from "mongodb";
import { nanoid } from "nanoid";
import { AuthState } from "../auth/types.js";
import { db } from "../data/mongo.js";
import { pubsub } from "../data/pubsub.js";
import { deleteByPattern, redis } from "../data/redis.js";
import { StoryDbObject } from "../data/types.js";
import {
  AuthenticationError,
  ForbiddenError,
  UserInputError,
} from "../error/index.js";
import { LocationInput, MessageType } from "../graphql/graphql.gen.js";
import { CONFIG, PUBSUB_CHANNELS, REDIS_KEY } from "../utils/constant.js";
import type { NullablePartial } from "../utils/types.js";
import { MessageService } from "./message.js";
import { NotificationService } from "./notification.js";
import { NowPlayingWorker } from "./nowPlayingWorker.js";
import { QueueService } from "./queue.js";
import { TrackService } from "./track.js";
import type { ServiceContext } from "./types.js";

export class StoryService {
  private collection = db.collection<StoryDbObject>("stories");
  private loader: DataLoader<string, StoryDbObject | null>;

  constructor(private context: ServiceContext) {
    this.loader = new DataLoader(
      async (keys) => {
        const stories = await this.collection
          .find({
            _id: { $in: keys.map(mongodb.ObjectID.createFromHexString) },
          })
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

  private loaderUpdateCache(story: StoryDbObject) {
    this.loader.clear(String(story._id)).prime(String(story._id), story);
  }

  /**
   * Notify the story has changed
   * Possibly because a new collaboratorId, or isLive
   * @param story
   */
  private notifyUpdate(story: StoryDbObject) {
    pubsub.publish(PUBSUB_CHANNELS.storyUpdated, {
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
  async unliveStory(storyId: string): Promise<StoryDbObject> {
    // WARN: this does not check auth
    // Delete queue. See QueueService#deleteById
    await redis.del(REDIS_KEY.queue(storyId));
    // Skip/Stop nowPlaying
    NowPlayingWorker.requestSkip(pubsub, storyId);
    // Extract played tracks into story.trackIds
    const queueItems = await new QueueService(this.context).findById(
      `${storyId}:played`
    );
    // Unlive it and set tracks
    const { value } = await this.collection.findOneAndUpdate(
      { _id: new mongodb.ObjectID(storyId) },
      {
        $set: {
          isLive: false,
          trackIds: queueItems.map((queueItem) => queueItem.trackId),
        },
      },
      { returnDocument: "after" }
    );
    if (!value) throw new ForbiddenError("Cannot delete this story");
    this.invalidateInviteToken(value);
    this.notifyUpdate(value);
    this.loaderUpdateCache(value);
    return value;
  }

  async getInviteToken(me: AuthState | null, storyId: string) {
    if (!me) throw new AuthenticationError("");
    const story = await this.findById(storyId);
    if (!story) throw new UserInputError("Story not found", ["id"]);
    if (!story.collaboratorIds.includes(me.userId))
      throw new ForbiddenError("Not allowed to get invite link");
    const token = await redis.get(
      REDIS_KEY.storyInviteToken(String(story._id))
    );
    if (!token)
      throw new Error(`Cannot get invite token for story ${story._id}`);
    return token;
  }

  /**
   * Create an invite token that can be used
   * to add collaborators
   * @param story
   */
  private async createInviteToken(story: StoryDbObject) {
    const token = nanoid(21);
    await redis.set(REDIS_KEY.storyInviteToken(String(story._id)), token);
    return token;
  }

  /**
   * Invalidate the invite token in case
   * story is unlived
   * @param story
   * @returns
   */
  private async invalidateInviteToken(story: StoryDbObject) {
    return redis.del(REDIS_KEY.storyInviteToken(String(story._id)));
  }

  /**
   * Add oneself as a collaborator
   * using an invite token
   */
  async addCollabFromToken(
    me: AuthState | null,
    storyId: string,
    token: string
  ) {
    if (!me) throw new AuthenticationError("");
    const story = await this.findById(storyId);
    if (!story) throw new UserInputError("Story not found", ["id"]);
    const verifyToken = await redis.get(
      REDIS_KEY.storyInviteToken(String(story._id))
    );
    if (!verifyToken) return false;
    if (verifyToken !== token) return false;
    const { value } = await this.collection.findOneAndUpdate(
      { _id: story._id, isLive: true },
      { $addToSet: { collaboratorIds: me.userId } },
      { returnDocument: "after" }
    );
    if (value) this.loaderUpdateCache(value);
    return Boolean(value);
  }

  /**
   * Create a story
   * @param me
   * @param param1 data of the new story
   */
  async create(
    me: AuthState | null,
    {
      text,
      location,
    }: Pick<StoryDbObject, "text"> & {
      location: LocationInput | null | undefined;
    },
    tracks: string[]
  ) {
    if (!me) throw new AuthenticationError("");

    if (tracks.length < 1)
      throw new UserInputError("Require at least a track", ["tracks"]);

    // use first track as image
    const track = await new TrackService(this.context).findTrack(tracks[0]);
    const image = track?.image;

    const createdAt = new Date();

    text = text.trim().substring(0, CONFIG.storyTextMaxLength);

    // Unlive all other stories
    await this.collection.updateMany(
      { isLive: true, creatorId: me.userId },
      { $set: { isLive: false } }
    );

    const {
      ops: [story],
    } = await this.collection.insertOne({
      text,
      creatorId: me.userId,
      createdAt,
      isLive: true,
      image,
      collaboratorIds: [me.userId],
      lastCreatorActivityAt: createdAt,
      ...(location && {
        location: { type: "Point", coordinates: [location.lng, location.lat] },
      }),
      trackIds: [],
    });

    await new QueueService(this.context).executeQueueAction(
      me,
      String(story._id),
      { add: { tracks } }
    );

    this.loaderUpdateCache(story);

    // create a secure invite link
    await this.createInviteToken(story);

    const notificationService = new NotificationService(this.context);

    notificationService.notifyFollowersOfNewStory(story);

    return story;
  }

  /**
   * Update a story by id
   * @param me the creator of this story
   * @param id
   * @param param2
   */
  async updateById(
    me: AuthState | null,
    id: string,
    {
      text,
      image,
      location,
    }: NullablePartial<Pick<StoryDbObject, "text" | "image">> & {
      location: LocationInput | null | undefined;
    }
  ): Promise<StoryDbObject> {
    if (!me) throw new AuthenticationError("");
    const { value: story } = await this.collection.findOneAndUpdate(
      {
        _id: new mongodb.ObjectID(id),
        creatorId: me.userId,
      },
      {
        $set: {
          ...(text && { text }),
          ...(image !== undefined && { image }),
          ...(location !== undefined && {
            location: location
              ? {
                  type: "Point",
                  coordinates: [location.lng, location.lat],
                }
              : null,
          }),
        },
      },
      { returnDocument: "after" }
    );
    if (!story) throw new ForbiddenError("Cannot update story");
    this.loaderUpdateCache(story);
    this.notifyUpdate(story);
    return story;
  }

  /**
   * Delete a story by id
   * @param me the creator of that story
   * @param id
   */
  async deleteById(me: AuthState | null, id: string) {
    if (!me) throw new AuthenticationError("");
    const { deletedCount } = await this.collection.deleteOne({
      _id: new mongodb.ObjectID(id),
      creatorId: me.userId,
    });
    if (!deletedCount) throw new ForbiddenError("Cannot delete story");
    // delete associated
    await Promise.all([deleteByPattern(redis, `${REDIS_KEY.queue(id)}:*`)]);
    return true;
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
      .find({
        creatorId,
        ...(next && { _id: { $lt: new mongodb.ObjectID(next) } }),
      })
      .sort({ $natural: -1 })
      .limit(limit || 99999)
      .toArray()
      .then((stories) => stories.map((s) => this.checkStoryStatus(s)));
  }

  /**
   * Find first live story by creatorId
   * @param creatorId
   */
  async findLiveByCreatorId(creatorId: string) {
    return this.collection
      .findOne({ creatorId, isLive: true })
      .then((story) => {
        if (!story) return null;
        story = this.checkStoryStatus(story);
        return story.isLive ? story : null;
      });
  }

  async findByLocation(lng: number, lat: number, radius: number) {
    return this.collection
      .find({
        isLive: true,
        location: {
          $near: {
            $geometry: { type: "Point", coordinates: [lng, lat] },
            $maxDistance: radius, // in meter
            $minDistance: 0,
          },
        },
      })
      .toArray();
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
        ...(next && { _id: { $lt: new mongodb.ObjectID(next) } }),
      })
      .sort({ $natural: -1 })
      .limit(limit)
      .toArray()
      .then((stories) => stories.map((s) => this.checkStoryStatus(s)));
  }

  /**
   * Notify that the user is still in story
   * @param user
   * @param storyId
   */
  async pingPresence(me: AuthState, storyId: string): Promise<void> {
    const story = await this.findById(storyId);

    if (!story) throw new ForbiddenError("Cannot ping to this story");

    // story presence does not apply to unlive story
    if (!story.isLive) return;

    // update lastCreatorActivityAt since the pinging user is create
    if (me.userId === story.creatorId) {
      await this.collection.updateOne(
        { _id: new mongodb.ObjectID(storyId), creatorId: me.userId },
        { $set: { lastCreatorActivityAt: new Date() } }
      );
    }

    const now = Date.now();
    // when was user last in story or possibly NaN if never in
    const lastTimestamp: number = parseInt(
      await redis.zscore(REDIS_KEY.storyListenerPresences(storyId), me.userId),
      10
    );

    const justJoined =
      !lastTimestamp || now - lastTimestamp > CONFIG.activityTimeout;

    // Ping that user is still here
    await redis.zadd(REDIS_KEY.storyListenerPresences(storyId), now, me.userId);

    if (justJoined) {
      const messageService = new MessageService(this.context);

      // notify that user just joined via message
      messageService.add(storyId, {
        text: storyId,
        type: MessageType.Join,
        creatorId: me.userId,
      });

      // Notify story user update via subscription
      pubsub.publish(PUBSUB_CHANNELS.storyListenersUpdated, {
        id: storyId,
        storyListenersUpdated: await this.getCurrentListeners(storyId),
      });
    }
  }

  /**
   * Get all user currently in a room
   * @param _id
   */
  async getCurrentListeners(_id: string): Promise<string[]> {
    // user is considered present if they still ping within activityTimeout
    const minRange = Date.now() - CONFIG.activityTimeout;
    return redis.zrevrangebyscore(
      REDIS_KEY.storyListenerPresences(_id),
      Infinity,
      minRange
    );
  }

  async getTrackIds(
    _id: string,
    from?: number,
    to?: number
  ): Promise<string[]> {
    const story = await this.findById(_id);
    if (!story) return [];
    // JS slice's "end" is not included so we +1
    return story?.trackIds.slice(from, typeof to === "number" ? to + 1 : to);
  }
}
