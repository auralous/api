import type { StoryDbObject, UserDbObject } from "../../data/types.js";
import { ForbiddenError, UserInputError } from "../../error/index.js";
import { StoryService } from "../../services/story.js";
import { PUBSUB_CHANNELS } from "../../utils/constant.js";
import type { Resolvers } from "../graphql.gen.js";

const resolvers: Resolvers = {
  Query: {
    story(parent, { id }, { services, user }) {
      return services.Story.findById(id).then((s) => {
        if (!s || !StoryService.getPermission(user, s).isViewable) return null;
        return s;
      });
    },
    async stories(parent, { id, limit, next }, { services, user }) {
      if (limit > 20) throw new ForbiddenError("Too large limit");
      let stories: StoryDbObject[] = [];
      if (id === "PUBLIC")
        stories = await services.Story.findForFeedPublic(limit, next);
      else if (id.startsWith("creatorId:")) {
        const creatorId = id.substring(10);
        stories = await services.Story.findByCreatorId(creatorId, limit, next);
      }
      return stories.filter(
        (s) => StoryService.getPermission(user, s).isViewable
      );
    },
    async storiesOnMap(parent, { lng, lat, radius }, { services }) {
      return services.Story.findByLocation(lng, lat, radius);
    },
    async storyUsers(parent, { id }, { services, user }) {
      const story = await services.Story.findById(id);
      if (!story || !StoryService.getPermission(user, story).isViewable)
        return null;
      return services.Story.getPresences(id);
    },
    async storyLive(parent, { creatorId }, { services }) {
      if (!creatorId) return null;
      return services.Story.findLiveByCreatorId(creatorId);
    },
    // @ts-ignore
    async storyTracks(parent, { id }, { services, user }) {
      const story = await services.Story.findById(id);
      if (!story || !StoryService.getPermission(user, story).isViewable)
        return null;
      const queueItems = await services.Queue.findById(`${id}:played`, 0, -1);
      return Promise.all(
        queueItems.map((queueItem) =>
          services.Track.findTrack(queueItem.trackId)
        )
      );
    },
  },
  Mutation: {
    storyCreate(
      parent,
      { text, isPublic, location, tracks },
      { services, user }
    ) {
      return services.Story.create(
        user,
        {
          text,
          isPublic,
          location,
        },
        tracks
      );
    },
    async storyUnlive(parent, { id }, { services, user }) {
      const story = await services.Story.findById(id);
      if (!story) throw new UserInputError("Story not found", ["id"]);
      if (story.creatorId !== user?._id)
        throw new ForbiddenError("Story cannot be updated");
      return services.Story.unliveStory(id);
    },
    async storyDelete(parent, { id }, { services, user }) {
      await services.Story.deleteById(user, id);
      return id;
    },
    storyPing(parent, { id }, { services, user }) {
      if (!user) return false;
      services.Story.pingPresence(user, id);
      return true;
    },
    async storyChangeQueueable(
      parent,
      { id, userId, isRemoving },
      { services, user }
    ) {
      const addingUser = await services.User.findById(userId);
      if (!addingUser)
        throw new UserInputError("User does not exist", ["userId"]);
      return services.Story.addOrRemoveQueueable(
        user,
        id,
        addingUser,
        isRemoving
      );
    },
    async storySendInvites(parent, { id, invitedIds }, { services, user }) {
      const story = await services.Story.findById(id);
      if (!story) throw new UserInputError("Story does not exist", ["storyId"]);

      await services.Notification.addInvitesToStory(user, story, invitedIds);

      return true;
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
      async subscribe(parent, { id }, { pubsub, services, user }) {
        const story = await services.Story.findById(id);
        if (!story) throw new UserInputError("Story not found", ["id"]);
        if (!StoryService.getPermission(user, story).isViewable)
          throw new ForbiddenError("Story cannot be subscribed");
        return pubsub.on(
          PUBSUB_CHANNELS.storyUpdated,
          (payload) => payload.id === id
        );
      },
    },
  },
  Story: {
    id: ({ _id }) => String(_id),
    async image({ isLive, image, _id }, args, { services, user }) {
      if (image) return image;
      if (isLive) {
        const np = await services.NowPlaying.findById(String(_id), true);
        return (
          (np?.trackId &&
            (await services.Track.findTrack(np.trackId, user))?.image) ||
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
