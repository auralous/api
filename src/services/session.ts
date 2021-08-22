import DataLoader from "dataloader";
import mongodb from "mongodb";
import { nanoid } from "nanoid";
import { AuthState } from "../auth/types.js";
import { db } from "../data/mongo.js";
import { pubsub } from "../data/pubsub.js";
import { deleteByPattern, redis } from "../data/redis.js";
import { SessionDbObject } from "../data/types.js";
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

export class SessionService {
  private collection = db.collection<SessionDbObject>("sessions");
  private loader: DataLoader<string, SessionDbObject | null>;

  constructor(private context: ServiceContext) {
    this.loader = new DataLoader(
      async (keys) => {
        const sessions = await this.collection
          .find({
            _id: { $in: keys.map(mongodb.ObjectID.createFromHexString) },
          })
          .toArray()
          .then((sessions) => sessions.map((s) => this.checkSessionStatus(s)));
        // retain order
        return keys.map(
          (key) =>
            sessions.find(
              (session: SessionDbObject) => session._id.toHexString() === key
            ) || null
        );
      },
      { cache: false }
    );
  }

  private loaderUpdateCache(session: SessionDbObject) {
    this.loader.clear(String(session._id)).prime(String(session._id), session);
  }

  /**
   * Notify the session has changed
   * Possibly because a new collaboratorId, or isLive
   * @param session
   */
  private notifyUpdate(session: SessionDbObject) {
    pubsub.publish(PUBSUB_CHANNELS.sessionUpdated, {
      id: session._id.toHexString(),
      sessionUpdated: session,
    });
  }

  /**
   * Check a session to see if it needs to be unlived
   * Sometimes, the creator does not unlive a session manually
   * We define a inactivity duration to unlive the session (CONFIG.sessionLiveTimeout)
   * This is often run everytime a session is accessed (either by itself or as part of a collection)
   * Return the session itself for convenience passing into callbacks
   * @param session
   */
  private checkSessionStatus(session: SessionDbObject): SessionDbObject {
    if (
      session.isLive &&
      Date.now() - session.lastCreatorActivityAt.getTime() >
        CONFIG.sessionLiveTimeout
    ) {
      // creator is not active in awhile unlive session
      session.isLive = false;
      // async update it
      this.unliveSession(session._id.toHexString());
    }
    return session;
  }

  /**
   * Unlive a session (aka archieved)
   * An unlived sessions can be replayed at any time
   * but no new songs can be added to it
   * @param sessionId
   */
  async unliveSession(sessionId: string): Promise<SessionDbObject> {
    // WARN: this does not check auth
    // Delete queue. See QueueService#deleteById
    await redis.del(REDIS_KEY.queue(sessionId));
    // Skip/Stop nowPlaying
    NowPlayingWorker.requestSkip(pubsub, sessionId);
    // Extract played tracks into session.trackIds
    const queueItems = await new QueueService(this.context).findById(
      `${sessionId}:played`
    );
    // Unlive it and set tracks
    const { value } = await this.collection.findOneAndUpdate(
      { _id: new mongodb.ObjectID(sessionId) },
      {
        $set: {
          isLive: false,
          trackIds: queueItems.map((queueItem) => queueItem.trackId),
        },
      },
      { returnDocument: "after" }
    );
    if (!value) throw new ForbiddenError("Cannot delete this session");
    this.invalidateInviteToken(value);
    this.notifyUpdate(value);
    this.loaderUpdateCache(value);
    return value;
  }

  async getInviteToken(me: AuthState | null, sessionId: string) {
    if (!me) throw new AuthenticationError("");
    const session = await this.findById(sessionId);
    if (!session) throw new UserInputError("Session not found", ["id"]);
    if (!session.collaboratorIds.includes(me.userId))
      throw new ForbiddenError("Not allowed to get invite link");
    const token = await redis.get(
      REDIS_KEY.sessionInviteToken(String(session._id))
    );
    if (!token)
      throw new Error(`Cannot get invite token for session ${session._id}`);
    return token;
  }

  /**
   * Create an invite token that can be used
   * to add collaborators
   * @param session
   */
  private async createInviteToken(session: SessionDbObject) {
    const token = nanoid(21);
    await redis.set(REDIS_KEY.sessionInviteToken(String(session._id)), token);
    return token;
  }

  /**
   * Invalidate the invite token in case
   * session is unlived
   * @param session
   * @returns
   */
  private async invalidateInviteToken(session: SessionDbObject) {
    return redis.del(REDIS_KEY.sessionInviteToken(String(session._id)));
  }

  /**
   * Add oneself as a collaborator
   * using an invite token
   */
  async addCollabFromToken(
    me: AuthState | null,
    sessionId: string,
    token: string
  ) {
    if (!me) throw new AuthenticationError("");
    const session = await this.findById(sessionId);
    if (!session) throw new UserInputError("Session not found", ["id"]);
    const verifyToken = await redis.get(
      REDIS_KEY.sessionInviteToken(String(session._id))
    );
    if (!verifyToken) return false;
    if (verifyToken !== token) return false;
    const { value } = await this.collection.findOneAndUpdate(
      { _id: session._id, isLive: true },
      { $addToSet: { collaboratorIds: me.userId } },
      { returnDocument: "after" }
    );
    if (value) this.loaderUpdateCache(value);
    return Boolean(value);
  }

  /**
   * Create a session
   * @param me
   * @param param1 data of the new session
   */
  async create(
    me: AuthState | null,
    {
      text,
      location,
    }: Pick<SessionDbObject, "text"> & {
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

    text = text.trim().substring(0, CONFIG.sessionTextMaxLength);

    // Unlive all other sessions
    await this.collection.updateMany(
      { isLive: true, creatorId: me.userId },
      { $set: { isLive: false } }
    );

    const {
      ops: [session],
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
      String(session._id),
      { add: { tracks } }
    );

    this.loaderUpdateCache(session);

    // create a secure invite link
    await this.createInviteToken(session);

    const notificationService = new NotificationService(this.context);

    notificationService.notifyFollowersOfNewSession(session);

    return session;
  }

  /**
   * Update a session by id
   * @param me the creator of this session
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
    }: NullablePartial<Pick<SessionDbObject, "text" | "image">> & {
      location: LocationInput | null | undefined;
    }
  ): Promise<SessionDbObject> {
    if (!me) throw new AuthenticationError("");
    const { value: session } = await this.collection.findOneAndUpdate(
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
    if (!session) throw new ForbiddenError("Cannot update session");
    this.loaderUpdateCache(session);
    this.notifyUpdate(session);
    return session;
  }

  /**
   * Delete a session by id
   * @param me the creator of that session
   * @param id
   */
  async deleteById(me: AuthState | null, id: string) {
    if (!me) throw new AuthenticationError("");
    const { deletedCount } = await this.collection.deleteOne({
      _id: new mongodb.ObjectID(id),
      creatorId: me.userId,
    });
    if (!deletedCount) throw new ForbiddenError("Cannot delete session");
    // delete associated
    await Promise.all([deleteByPattern(redis, `${REDIS_KEY.queue(id)}:*`)]);
    return true;
  }

  /**
   * Find a session by id
   * @param id
   */
  findById(id: string) {
    return this.loader.load(id);
  }

  /**
   * Find sessions created by a user
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
      .then((sessions) => sessions.map((s) => this.checkSessionStatus(s)));
  }

  /**
   * Find first live session by creatorId
   * @param creatorId
   */
  async findLiveByCreatorId(creatorId: string) {
    return this.collection
      .findOne({ creatorId, isLive: true })
      .then((session) => {
        if (!session) return null;
        session = this.checkSessionStatus(session);
        return session.isLive ? session : null;
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
   * Find all public sessions
   * @param limit
   * @param next
   */
  async findForFeedPublic(
    limit: number,
    next?: string | null
  ): Promise<SessionDbObject[]> {
    return this.collection
      .find({
        ...(next && { _id: { $lt: new mongodb.ObjectID(next) } }),
      })
      .sort({ $natural: -1 })
      .limit(limit)
      .toArray()
      .then((sessions) => sessions.map((s) => this.checkSessionStatus(s)));
  }

  /**
   * Notify that the user is still in session
   * @param user
   * @param sessionId
   */
  async pingPresence(me: AuthState, sessionId: string): Promise<void> {
    const session = await this.findById(sessionId);

    if (!session) throw new ForbiddenError("Cannot ping to this session");

    // session presence does not apply to unlive session
    if (!session.isLive) return;

    // update lastCreatorActivityAt since the pinging user is create
    if (me.userId === session.creatorId) {
      await this.collection.updateOne(
        { _id: new mongodb.ObjectID(sessionId), creatorId: me.userId },
        { $set: { lastCreatorActivityAt: new Date() } }
      );
    }

    const now = Date.now();
    // when was user last in session or possibly NaN if never in
    const lastTimestamp: number = parseInt(
      await redis.zscore(
        REDIS_KEY.sessionListenerPresences(sessionId),
        me.userId
      ),
      10
    );

    const justJoined =
      !lastTimestamp || now - lastTimestamp > CONFIG.activityTimeout;

    // Ping that user is still here
    await redis.zadd(
      REDIS_KEY.sessionListenerPresences(sessionId),
      now,
      me.userId
    );

    if (justJoined) {
      const messageService = new MessageService(this.context);

      // notify that user just joined via message
      messageService.add(sessionId, {
        text: sessionId,
        type: MessageType.Join,
        creatorId: me.userId,
      });

      // Notify session user update via subscription
      pubsub.publish(PUBSUB_CHANNELS.sessionListenersUpdated, {
        id: sessionId,
        sessionListenersUpdated: await this.getCurrentListeners(sessionId),
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
      REDIS_KEY.sessionListenerPresences(_id),
      Infinity,
      minRange
    );
  }

  async getTrackIds(
    _id: string,
    from?: number,
    to?: number
  ): Promise<string[]> {
    const session = await this.findById(_id);
    if (!session) return [];
    // JS slice's "end" is not included so we +1
    return session?.trackIds.slice(from, typeof to === "number" ? to + 1 : to);
  }
}
