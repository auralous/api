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
    async stories(parent, { creatorId }, { services, user }) {
      let stories: StoryDbObject[] | null = null;
      if (creatorId) {
        stories = (await services.Story.findByCreatorId(creatorId)).filter(
          (s) => services.Story.getPermission(s, user?._id).isViewable
        );
      }
      return stories;
    },
    async storyUsers(parent, { id }, { services, user }) {
      const story = await services.Story.findById(id);
      if (!story || !services.Story.getPermission(story, user?._id).isViewable)
        return null;
      return services.Story.getPresences(id);
    },
    storyFeed(parent, { id, next, limit }, { services }) {
      if (limit > 20) throw new ForbiddenError("Too large limit");
      if (id === "PUBLIC") return services.Story.findForFeedPublic(limit, next);
      return [];
    },
  },
  Mutation: {
    createStory(parent, { text, isPublic }, { services }) {
      return services.Story.create({
        text,
        isPublic,
      });
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
  },
  Story: {
    id: ({ _id }) => _id.toHexString(),
    image({ image, _id }) {
      return image || defaultAvatar("story", _id.toHexString());
    },
  },
};

export default resolvers;
