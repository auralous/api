import type { SessionDbObject } from "../../data/types.js";
import { InvalidArgError, NotFoundError } from "../../error/errors.js";
import { NowPlayingService } from "../../services/nowPlaying.js";
import { SessionService } from "../../services/session.js";
import { TrackService } from "../../services/track.js";
import { UserService } from "../../services/user.js";
import { ENV, PUBSUB_CHANNELS } from "../../utils/constant.js";
import { isDefined } from "../../utils/utils.js";
import type { Resolvers } from "../graphql.gen.js";

const resolvers: Resolvers = {
  Query: {
    session(parent, { id }, context) {
      return SessionService.findById(context, id);
    },
    async sessions(parent, { creatorId, following, limit, next }, context) {
      if (limit > 20)
        throw new InvalidArgError("limit", "Must be less than or equal 20");
      let sessions: SessionDbObject[] = [];
      if (creatorId) {
        sessions = await SessionService.findByCreatorId(
          context,
          creatorId,
          limit,
          next
        );
      } else if (following) {
        sessions = await SessionService.findFromFollowings(
          context,
          limit,
          next
        );
      } else {
        sessions = await SessionService.findRecommendations(
          context,
          limit,
          next
        );
      }
      return sessions;
    },
    async sessionsOnMap(parent, { lng, lat, radius }, context) {
      return SessionService.findByLocation(context, lng, lat, radius);
    },
    async sessionListeners(parent, { id }) {
      return SessionService.getCurrentListeners(id);
    },
    // @ts-ignore: Invalid TS Error
    async sessionCurrentLive(parent, { creatorId, mine }, context) {
      if (mine) {
        if (!context.auth) return null;
        creatorId = context.auth.userId;
      }
      if (creatorId) {
        const session = await SessionService.findLiveByCreatorId(
          context,
          creatorId
        );
        if (!session) return null;
        return {
          creatorId,
          sessionId: session._id,
        };
      }
      throw new InvalidArgError(
        "creatorId",
        "Provide either creatorId or mine = true"
      );
    },
    async sessionTracks(parent, { id, from, to }, context) {
      const sessionTrackIds = await SessionService.getTrackIds(
        context,
        id,
        from || undefined,
        to || undefined
      );
      return (await TrackService.findTracks(context, sessionTrackIds)).filter(
        isDefined
      );
    },
    async sessionInviteLink(parent, { id }, context) {
      return `${
        ENV.APP_URI
      }/session/${id}/invite/${await SessionService.getInviteToken(
        context,
        id
      )}`;
    },
  },
  Mutation: {
    sessionCreate(parent, { text, location, tracks }, context) {
      return SessionService.create(
        context,
        {
          text,
          location,
        },
        tracks
      );
    },
    sessionUpdate(parent, { id, text, location }, context) {
      return SessionService.update(context, id, { text, location });
    },
    async sessionEnd(parent, { id }, context) {
      return SessionService.end(context, id);
    },
    async sessionDelete(parent, { id }, context) {
      await SessionService.deleteById(context, id);
      return id;
    },
    sessionPing(parent, { id }, context) {
      SessionService.pingPresence(context, id);
      return true;
    },
    async sessionCollabAddFromToken(parent, { id, token }, context) {
      return SessionService.addCollabFromToken(context, id, token);
    },
  },
  Subscription: {
    sessionListenersUpdated: {
      subscribe(parent, { id }, { pubsub }) {
        return pubsub.on(
          PUBSUB_CHANNELS.sessionListenersUpdated,
          (payload) => payload.id === id
        );
      },
    },
    sessionUpdated: {
      async subscribe(parent, { id }, context) {
        const session = await SessionService.findById(context, id);
        if (!session) throw new NotFoundError("session", id);
        return context.pubsub.on(
          PUBSUB_CHANNELS.sessionUpdated,
          (payload) => payload.id === id
        );
      },
    },
  },
  Session: {
    id: ({ _id }) => String(_id),
    async image({ isLive, image, _id }, args, context) {
      if (image) return image;
      if (isLive) {
        const np = await NowPlayingService.findCurrentItemById(String(_id));
        return (
          (np?.trackId &&
            (await TrackService.findTrack(context, np.trackId))?.image) ||
          null
        );
      }
      return null;
    },
    async creator({ creatorId }, args, context) {
      return (await UserService.findById(context, creatorId))!;
    },
    onMap({ creatorId, location }, args, { auth }) {
      // only visible to creator
      if (creatorId === auth?.userId) return Boolean(location);
      return null;
    },
    trackTotal({ trackIds }) {
      return trackIds.length;
    },
  },
};

export default resolvers;
