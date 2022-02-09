import DataLoader from "dataloader";
import mongodb, { OptionalUnlessRequiredId, WithoutId } from "mongodb";
import { nanoid } from "nanoid";
import pino from "pino";
import { db } from "../data/mongo.js";
import { pubsub } from "../data/pubsub.js";
import { redis } from "../data/redis.js";
import { SessionDbObject } from "../data/types.js";
import {
  CustomError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "../error/errors.js";
import { LocationInput, MessageType } from "../graphql/graphql.gen.js";
import { pinoOpts } from "../logger/options.js";
import { CONFIG, PUBSUB_CHANNELS, REDIS_KEY } from "../utils/constant.js";
import type { NullablePartial } from "../utils/types.js";
import { FollowService } from "./follow.js";
import { MessageService } from "./message.js";
import { NotificationService } from "./notification.js";
import { NowPlayingController } from "./nowPlayingController.js";
import { QueueService } from "./queue.js";
import { TrackService } from "./track.js";
import type { ServiceContext } from "./types.js";

const logger = pino({ ...pinoOpts, name: "services/session" });

export class SessionService {
  private static collection = db.collection<SessionDbObject>("sessions");

  static createLoader() {
    return new DataLoader<string, SessionDbObject | null>(
      async (keys) => {
        const sessions = await SessionService.collection
          .find({
            _id: { $in: keys.map(mongodb.ObjectId.createFromHexString) },
          })
          .toArray();
        // retain order
        return keys.map(
          (key) =>
            sessions.find(
              (session: SessionDbObject) => session._id.toHexString() === key
            ) || null
        );
      },
      { cache: true }
    );
  }

  /**
   * Invalidate dataloader after updates
   * @param context
   * @param session
   * @private
   */
  private static invalidateLoaderCache(
    context: ServiceContext,
    session: SessionDbObject
  ) {
    context.loaders.session
      .clear(String(session._id))
      .prime(String(session._id), session);
  }

  /**
   * Notify the session has changed
   * Possibly because a new collaboratorId, or isLive
   * @param session
   * @private
   */
  private static notifyUpdate(session: SessionDbObject) {
    pubsub.publish(PUBSUB_CHANNELS.sessionUpdated, {
      id: session._id.toHexString(),
      sessionUpdated: session,
    });
  }

  /**
   * Get the invite token that can be used to add collaborators
   * @param context
   * @param sessionId
   * @returns {string}
   */
  static async getInviteToken(context: ServiceContext, sessionId: string) {
    if (!context.auth) throw new UnauthorizedError();
    const session = await SessionService.findById(context, sessionId);
    if (!session) throw new NotFoundError("session", sessionId);
    if (!session.collaboratorIds.includes(context.auth.userId))
      throw new ForbiddenError("session", sessionId);
    const token = await redis.get(
      REDIS_KEY.sessionInviteToken(String(session._id))
    );
    if (!token) throw new Error(`Invite token is null for id = ${session._id}`);
    return token;
  }

  /**
   * Create an invite token that can be used
   * to add collaborators
   * @param session
   * @private
   */
  private static async createInviteToken(session: SessionDbObject) {
    const token = nanoid(21);
    await redis.set(REDIS_KEY.sessionInviteToken(String(session._id)), token);
    return token;
  }

  /**
   * Invalidate the invite token in case
   * session is ended
   * @param session
   * @returns
   */
  private static async invalidateInviteToken(session: SessionDbObject) {
    return redis.del(REDIS_KEY.sessionInviteToken(String(session._id)));
  }

  /**
   * Add oneself as a collaborator
   * using an invite token
   */
  static async addCollabFromToken(
    context: ServiceContext,
    sessionId: string,
    token: string
  ) {
    if (!context.auth) throw new UnauthorizedError();
    const session = await SessionService.findById(context, sessionId);
    if (!session) throw new NotFoundError("session", sessionId);
    const verifyToken = await redis.get(
      REDIS_KEY.sessionInviteToken(String(session._id))
    );
    if (!verifyToken) return false;
    if (verifyToken !== token) return false;
    const { value } = await SessionService.collection.findOneAndUpdate(
      { _id: session._id, isLive: true },
      { $addToSet: { collaboratorIds: context.auth.userId } },
      { returnDocument: "after" }
    );
    if (value) SessionService.invalidateLoaderCache(context, value);
    return Boolean(value);
  }

  /**
   * Create a session
   * @param me
   * @param param1 data of the new session
   */
  static async create(
    context: ServiceContext,
    {
      text,
      location,
    }: Pick<SessionDbObject, "text"> & {
      location: LocationInput | null | undefined;
    },
    tracks: string[]
  ): Promise<SessionDbObject> {
    if (!context.auth) throw new UnauthorizedError();

    if (tracks.length < 1) throw new CustomError("error.tracks_required");

    // use first track as image
    const track = await TrackService.findTrack(context, tracks[0]);
    const image = track?.image;

    const createdAt = new Date();

    text = text.trim().substring(0, CONFIG.sessionTextMaxLength);

    // Check if other live session available
    const liveCount = await SessionService.collection.countDocuments({
      isLive: true,
      creatorId: context.auth.userId,
    });
    if (liveCount) throw new CustomError("error.must_end_other_sessions");

    const session: WithoutId<SessionDbObject> = {
      text,
      creatorId: context.auth.userId,
      createdAt,
      isLive: true,
      image,
      collaboratorIds: [context.auth.userId],
      lastCreatorActivityAt: createdAt,
      ...(location && {
        location: {
          type: "Point",
          coordinates: [location.lng, location.lat],
        },
      }),
      trackIds: [],
    };

    const { insertedId } = await SessionService.collection.insertOne(
      session as OptionalUnlessRequiredId<SessionDbObject>
    );

    const insertedSession: SessionDbObject = { ...session, _id: insertedId };

    await redis.zadd(
      REDIS_KEY.sessionEndedAt,
      Date.now() + CONFIG.sessionLiveTimeout,
      String(insertedSession._id)
    );

    // FIXME: This requires manual updates when queue.ts changes
    await QueueService.pushItems(
      insertedId.toHexString(),
      ...tracks.map((trackId) => ({
        uid: QueueService.randomUid(),
        trackId,
        creatorId: context.auth?.userId as string,
      }))
    );

    // start now playing
    await NowPlayingController.setNewPlayingIndexOrUid(
      context,
      insertedId.toHexString(),
      0
    );

    SessionService.invalidateLoaderCache(context, insertedSession);

    // create a secure invite link
    await SessionService.createInviteToken(insertedSession);

    NotificationService.notifyFollowersOfNewSession(insertedSession);

    return insertedSession;
  }

  /**
   * End session and remove related resources
   * @private
   */
  static async _end(_id: string) {
    const queue = await QueueService.findById(_id, 0, -1);
    const { value } = await SessionService.collection.findOneAndUpdate(
      { _id: new mongodb.ObjectId(_id) },
      {
        $set: {
          isLive: false,
          trackIds: queue.map((queueItem) => queueItem.trackId),
        },
      },
      { returnDocument: "after" }
    );
    if (!value) throw new Error(`Cannot end session with id = ${_id}`);
    await Promise.all([
      QueueService.deleteById(value._id.toHexString()),
      SessionService.invalidateInviteToken(value),
      redis.del(REDIS_KEY.sessionListenerPresences(String(value._id))),
      NowPlayingController.remove(String(value._id)),
    ]);
    SessionService.notifyUpdate(value);
    return value;
  }

  /**
   * End a session (aka archieved)
   * An ended sessions can be replayed at any time
   * but no new songs can be added to it
   * @param sessionId
   */
  static async end(
    context: ServiceContext,
    sessionId: string
  ): Promise<SessionDbObject> {
    if (!context.auth) throw new UnauthorizedError();
    const session = await SessionService.findById(context, sessionId);
    if (!session) throw new NotFoundError("session", sessionId);
    if (session.creatorId !== context.auth?.userId)
      throw new ForbiddenError("session", sessionId);
    const endedSession = await SessionService._end(sessionId);
    SessionService.invalidateLoaderCache(context, endedSession);
    return endedSession;
  }

  /**
   * Update a session by id
   * @param me the creator of this session
   * @param id
   * @param param2
   */
  static async update(
    context: ServiceContext,
    id: string,
    {
      text,
      image,
      location,
    }: NullablePartial<Pick<SessionDbObject, "text" | "image">> & {
      location: LocationInput | null | undefined;
    }
  ): Promise<SessionDbObject> {
    if (!context.auth) throw new UnauthorizedError();
    const { value: session } = await SessionService.collection.findOneAndUpdate(
      {
        _id: new mongodb.ObjectId(id),
        creatorId: context.auth.userId,
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
    // TODO: Clarify either session is not found or user is not allowed to update
    if (!session) throw new NotFoundError("session", id);
    SessionService.invalidateLoaderCache(context, session);
    SessionService.notifyUpdate(session);
    return session;
  }

  /**
   * Delete a session by id
   * @param me the creator of that session
   * @param id
   */
  static async deleteById(context: ServiceContext, id: string) {
    if (!context.auth) throw new UnauthorizedError();

    const { value: session } = await SessionService.collection.findOneAndDelete(
      {
        _id: new mongodb.ObjectId(id),
        creatorId: context.auth.userId,
      }
    );

    // TODO: Clarify either session is not found or user is not allowed to update
    if (!session) throw new NotFoundError("session", id);

    // Delete related resources
    await Promise.all([
      QueueService.deleteById(session._id.toHexString()),
      SessionService.invalidateInviteToken(session),
    ]);

    return true;
  }

  /**
   * Find a session by id
   * @param id
   */
  static findById(context: ServiceContext, id: string) {
    return context.loaders.session.load(id);
  }

  /**
   * Find sessions created by a user
   * @param creatorId
   * @param limit
   * @param next
   */
  static async findByCreatorId(
    context: ServiceContext,
    creatorId: string,
    limit?: number,
    next?: string | null
  ) {
    return SessionService.collection
      .find({
        creatorId,
        ...(next && { _id: { $lt: new mongodb.ObjectId(next) } }),
      })
      .sort({ $natural: -1 })
      .limit(limit || 99999)
      .toArray();
  }

  /**
   * Find first live session by creatorId
   * @param creatorId
   */
  static async findLiveByCreatorId(context: ServiceContext, creatorId: string) {
    return SessionService.collection.findOne({ creatorId, isLive: true });
  }

  static async findByLocation(
    context: ServiceContext,
    lng: number,
    lat: number,
    radius: number
  ) {
    return SessionService.collection
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
  static async findRecommendations(
    context: ServiceContext,
    limit: number,
    next?: string | null
  ): Promise<SessionDbObject[]> {
    return SessionService.collection
      .find({
        ...(next && { _id: { $lt: new mongodb.ObjectId(next) } }),
      })
      .sort({ $natural: -1 })
      .limit(limit)
      .toArray();
  }

  /**
   *
   */
  static async findFromFollowings(
    context: ServiceContext,
    limit: number,
    next?: string | null
  ) {
    if (!context.auth) throw new UnauthorizedError();
    const followingIds = await FollowService.findFollowings(
      context.auth.userId
    );

    return SessionService.collection
      .find({
        creatorId: {
          $in: followingIds.map((followingId) => followingId.following),
        },
        ...(next && { _id: { $lt: new mongodb.ObjectId(next) } }),
      })
      .sort({ $natural: -1 })
      .limit(limit)
      .toArray();
  }

  /**
   * Notify that the user is still in session
   * @param user
   * @param sessionId
   */
  static async pingPresence(
    context: ServiceContext,
    sessionId: string
  ): Promise<void> {
    if (!context.auth) throw new UnauthorizedError();

    const session = await SessionService.findById(context, sessionId);

    if (!session) throw new NotFoundError("session", sessionId);

    // session presence does not apply to ended session
    if (!session.isLive) return;

    const now = Date.now();

    // update session_ended_at to extend session lifetime
    if (context.auth.userId === session.creatorId) {
      await redis.zadd(
        REDIS_KEY.sessionEndedAt,
        now + CONFIG.sessionLiveTimeout,
        String(session._id)
      );
    }

    // when was user last in session or possibly NaN if never in
    const lastTimestampStr = await redis.zscore(
      REDIS_KEY.sessionListenerPresences(sessionId),
      context.auth.userId
    );
    const lastTimestamp = lastTimestampStr
      ? parseInt(lastTimestampStr, 10)
      : undefined;

    const timeSinceLastPing =
      lastTimestamp !== undefined ? now - lastTimestamp : -1;
    const hasJustJoined =
      timeSinceLastPing === -1 || timeSinceLastPing > CONFIG.activityTimeout;

    logger.debug(
      {
        sessionId,
        userId: context.auth.userId,
        timeSinceLastPing,
        hasJustJoined,
      },
      "pingPresence"
    );

    // Ping that user is still here
    await redis.zadd(
      REDIS_KEY.sessionListenerPresences(sessionId),
      now,
      context.auth.userId
    );

    if (hasJustJoined) {
      // notify that user just joined via message
      MessageService.add(sessionId, {
        text: sessionId,
        type: MessageType.Join,
        creatorId: context.auth.userId,
      });

      // Notify session user update via subscription
      pubsub.publish(PUBSUB_CHANNELS.sessionListenersUpdated, {
        id: sessionId,
        sessionListenersUpdated: await SessionService.getCurrentListeners(
          sessionId
        ),
      });
    }
  }

  /**
   * Get all user currently in a room
   * @param _id
   */
  static async getCurrentListeners(_id: string): Promise<string[]> {
    // user is considered present if they still ping within activityTimeout
    const minRange = Date.now() - CONFIG.activityTimeout;
    return redis.zrevrangebyscore(
      REDIS_KEY.sessionListenerPresences(_id),
      Infinity,
      minRange
    );
  }

  static async getTrackIds(
    context: ServiceContext,
    _id: string,
    from?: number,
    to?: number
  ): Promise<string[]> {
    const session = await SessionService.findById(context, _id);
    if (!session) return [];
    // JS slice's "end" is not included so we +1
    return session?.trackIds.slice(from, typeof to === "number" ? to + 1 : to);
  }

  static async search(
    context: ServiceContext,
    query: string
  ): Promise<SessionDbObject[]> {
    return SessionService.collection
      .find({
        $text: { $search: query },
      })
      .toArray();
  }
}
