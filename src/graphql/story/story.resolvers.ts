import type { StoryDbObject, UserDbObject } from "../../data/types.js";
import { ForbiddenError, UserInputError } from "../../error/index.js";
import { PUBSUB_CHANNELS } from "../../utils/constant.js";
import type { Resolvers } from "../graphql.gen.js";

const resolvers: Resolvers = {
  Query: {
    story(parent, { id }, { services }) {
      return services.Story.findById(id);
    },
    async stories(parent, { id, limit, next }, { services }) {
      if (limit > 20) throw new ForbiddenError("Too large limit");
      let stories: StoryDbObject[] = [];
      if (id === "PUBLIC")
        stories = await services.Story.findForFeedPublic(limit, next);
      else if (id.startsWith("creatorId:")) {
        const creatorId = id.substring(10);
        stories = await services.Story.findByCreatorId(creatorId, limit, next);
      }
      return stories;
    },
    async storiesOnMap(parent, { lng, lat, radius }, { services }) {
      return services.Story.findByLocation(lng, lat, radius);
    },
    async storyUsers(parent, { id }, { services }) {
      return services.Story.getPresences(id);
    },
    async storyLive(parent, { creatorId }, { services }) {
      if (!creatorId) return null;
      return services.Story.findLiveByCreatorId(creatorId);
    },
    // @ts-ignore
    async storyTracks(parent, { id }, { services }) {
      const queueItems = await services.Queue.findById(`${id}:played`, 0, -1);
      return services.Track.findTracks(queueItems.map((item) => item.trackId));
    },
    async storyInviteLink(parent, { id }, { auth, services }) {
      return `${
        process.env.APP_URI
      }/story/${id}/invite/${await services.Story.getInviteToken(auth, id)}`;
    },
  },
  Mutation: {
    storyCreate(parent, { text, location, tracks }, { services, auth }) {
      return services.Story.create(
        auth,
        {
          text,
          location,
        },
        tracks
      );
    },
    async storyUnlive(parent, { id }, { services, auth }) {
      const story = await services.Story.findById(id);
      if (!story) throw new UserInputError("Story not found", ["id"]);
      if (story.creatorId !== auth?.userId)
        throw new ForbiddenError("Story cannot be updated");
      return services.Story.unliveStory(id);
    },
    async storyDelete(parent, { id }, { services, auth }) {
      await services.Story.deleteById(auth, id);
      return id;
    },
    storyPing(parent, { id }, { services, auth }) {
      if (!auth) return false;
      services.Story.pingPresence(auth, id);
      return true;
    },
    async storyCollabAddFromToken(parent, { id, token }, { services, auth }) {
      return services.Story.addCollabFromToken(auth, id, token);
    },
  },
  Subscription: {
    storyUsersUpdated: {
      subscribe(parent, { id }, { pubsub }) {
        return pubsub.on(
          PUBSUB_CHANNELS.storyUsersUpdated,
          (payload) => payload.id === id
        );
      },
    },
    storyUpdated: {
      async subscribe(parent, { id }, { pubsub, services }) {
        const story = await services.Story.findById(id);
        if (!story) throw new UserInputError("Story not found", ["id"]);
        return pubsub.on(
          PUBSUB_CHANNELS.storyUpdated,
          (payload) => payload.id === id
        );
      },
    },
  },
  Story: {
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
  },
};

export default resolvers;
