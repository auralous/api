import { ForbiddenError, UserInputError } from "../../error";
import { PUBSUB_CHANNELS } from "../../lib/constant";
import { defaultAvatar } from "../../lib/defaultAvatar";

import type { Resolvers, StoryDbObject } from "../../types/index";

const resolvers: Resolvers = {
  Query: {
    story(parent, { id }, { services, user }) {
      return services.Story.findById(id).then((s) => {
        if (!s || !services.Story.getPermission(s, user?._id).isViewable)
          return null;
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
        (s) => services.Story.getPermission(s, user?._id).isViewable
      );
    },
    async storyUsers(parent, { id }, { services, user }) {
      const story = await services.Story.findById(id);
      if (!story || !services.Story.getPermission(story, user?._id).isViewable)
        return null;
      return services.Story.getPresences(id);
    },
  },
  Mutation: {
    createStory(parent, { text, isPublic }, { services }) {
      return services.Story.create({
        text,
        isPublic,
      });
    },
    async unliveStory(parent, { id }, { services, user }) {
      const story = await services.Story.findById(id);
      if (!story) throw new UserInputError("Story not found", ["id"]);
      if (story.creatorId !== user?._id)
        throw new ForbiddenError("Story cannot be updated");
      return services.Story.unliveStory(id);
    },
    async deleteStory(parent, { id }, { services }) {
      await services.Story.deleteById(id);
      return id;
    },
    pingStory(parent, { id }, { services, user }) {
      if (!user) return false;
      services.Story.pingPresence(id, user._id);
      return true;
    },
    async changeStoryQueueable(
      parent,
      { id, userId, isRemoving },
      { services }
    ) {
      const addingUser = await services.User.findById(userId);
      if (!addingUser)
        throw new UserInputError("User does not exist", ["userId"]);
      return services.Story.addOrRemoveQueueable(id, addingUser, isRemoving);
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
        if (!services.Story.getPermission(story, user?._id).isViewable)
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
    image({ image, _id }) {
      return image || defaultAvatar("story", String(_id));
    },
  },
};

export default resolvers;
