import { PUBSUB_CHANNELS } from "../../lib/constant";
import { defaultAvatar } from "../../lib/defaultAvatar";

import type { Resolvers } from "../../types/index";

const resolvers: Resolvers = {
  Query: {
    story(parent, { id }, { services }) {
      return services.Story.findById(id);
    },
    stories(parent, { creatorId }, { services }) {
      if (creatorId) return services.Story.findByCreatorId(creatorId);
      return null;
    },
    async storyUsers(parent, { id }, { services, user }) {
      const story = await services.Story.findById(id);
      if (!story || !services.Story.getPermission(story, user?._id).isViewable)
        return null;
      return services.Story.getPresences(id);
    },
    storyFeed(parent, { next }, { services }) {
      return services.Story.findForFeedPublic(undefined, next);
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
