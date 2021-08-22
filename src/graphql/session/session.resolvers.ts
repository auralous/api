import type { SessionDbObject, UserDbObject } from "../../data/types.js";
import { ForbiddenError, UserInputError } from "../../error/index.js";
import { PUBSUB_CHANNELS } from "../../utils/constant.js";
import { isDefined } from "../../utils/utils.js";
import type { Resolvers } from "../graphql.gen.js";

const resolvers: Resolvers = {
  Query: {
    session(parent, { id }, { services }) {
      return services.Session.findById(id);
    },
    async sessions(parent, { creatorId, limit, next }, { services }) {
      if (limit > 20) throw new ForbiddenError("Too large limit");
      let sessions: SessionDbObject[] = [];
      if (creatorId) {
        sessions = await services.Session.findByCreatorId(
          creatorId,
          limit,
          next
        );
      } else {
        sessions = await services.Session.findForFeedPublic(limit, next);
      }
      return sessions;
    },
    async sessionsOnMap(parent, { lng, lat, radius }, { services }) {
      return services.Session.findByLocation(lng, lat, radius);
    },
    async sessionListeners(parent, { id }, { services }) {
      return services.Session.getCurrentListeners(id);
    },
    // @ts-ignore
    async sessionCurrentLive(parent, { creatorId }, { services }) {
      if (!creatorId) return null;
      const session = await services.Session.findLiveByCreatorId(creatorId);
      if (!session) return null;
      return {
        creatorId,
        sessionId: session._id,
      };
    },
    async sessionTracks(parent, { id, from, to }, { services }) {
      const sessionTrackIds = await services.Session.getTrackIds(
        id,
        from || undefined,
        to || undefined
      );
      return (await services.Track.findTracks(sessionTrackIds)).filter(
        isDefined
      );
    },
    async sessionInviteLink(parent, { id }, { auth, services }) {
      return `${
        process.env.APP_URI
      }/session/${id}/invite/${await services.Session.getInviteToken(
        auth,
        id
      )}`;
    },
  },
  Mutation: {
    sessionCreate(parent, { text, location, tracks }, { services, auth }) {
      return services.Session.create(
        auth,
        {
          text,
          location,
        },
        tracks
      );
    },
    sessionUpdate(parent, { id, text, location }, { services, auth }) {
      return services.Session.updateById(auth, id, { text, location });
    },
    async sessionUnlive(parent, { id }, { services, auth }) {
      const session = await services.Session.findById(id);
      if (!session) throw new UserInputError("Session not found", ["id"]);
      if (session.creatorId !== auth?.userId)
        throw new ForbiddenError("Session cannot be updated");
      return services.Session.unliveSession(id);
    },
    async sessionDelete(parent, { id }, { services, auth }) {
      await services.Session.deleteById(auth, id);
      return id;
    },
    sessionPing(parent, { id }, { services, auth }) {
      if (!auth) return false;
      services.Session.pingPresence(auth, id);
      return true;
    },
    async sessionCollabAddFromToken(parent, { id, token }, { services, auth }) {
      return services.Session.addCollabFromToken(auth, id, token);
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
      async subscribe(parent, { id }, { pubsub, services }) {
        const session = await services.Session.findById(id);
        if (!session) throw new UserInputError("Session not found", ["id"]);
        return pubsub.on(
          PUBSUB_CHANNELS.sessionUpdated,
          (payload) => payload.id === id
        );
      },
    },
  },
  Session: {
    id: ({ _id }) => String(_id),
    async image({ isLive, image, _id }, args, { services }) {
      if (image) return image;
      if (isLive) {
        const np = await services.NowPlaying.findById(String(_id), true);
        return (
          (np?.trackId &&
            (await services.Track.findTrack(np.trackId))?.image) ||
          null
        );
      }
      return null;
    },
    async creator({ creatorId }, args, { services }) {
      return (await services.User.findById(creatorId)) as UserDbObject;
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
