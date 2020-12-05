import { UserInputError } from "../../error/index";
import { CONFIG, PUBSUB_CHANNELS } from "../../lib/constant";
import { defaultAvatar } from "../../lib/defaultAvatar";

import type { Resolvers, UserDbObject } from "../../types/index";

const resolvers: Resolvers = {
  Query: {
    story(parent, { id }, { services }) {
      return services.Story.findById(id);
    },
    stories(parent, { creatorId }, { services }) {
      if (creatorId) return services.Story.findByCreatorId(creatorId);
      return null;
    },
    async exploreStories(parent, { by }, { services, setCacheControl }) {
      if (by === "random") {
        const stories = await services.Story.findRandom(20);
        if (stories) setCacheControl?.(CONFIG.randomStoriesMaxAge);
        return stories;
      }
      throw new UserInputError("Invalid `by` parameter", ["by"]);
    },
    storyState(parent, { id }, { services }) {
      return services.Story.getStoryState(id);
    },
  },
  Mutation: {
    createStory(parent, { text, isPublic }, { services }) {
      return services.Story.create({
        text,
        isPublic,
      });
    },
    async updateStoryMembership(
      parent,
      { id, username, userId, role },
      { services }
    ) {
      let user: UserDbObject | undefined | null;

      if (username) {
        user = await services.User.findByUsername(username);
      } else if (userId) {
        user = await services.User.findById(userId);
      }

      if (!user)
        throw new UserInputError("User cannot be found", [
          "username",
          "userId",
        ]);

      await services.Story.updateMembershipById(id, user, role);

      return true;
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
    storyStateUpdated: {
      subscribe(parent, { id }, { pubsub }) {
        return pubsub.on(
          PUBSUB_CHANNELS.storyStateUpdated,
          (payload) => payload.storyStateUpdated.id === id
        );
      },
    },
  },
  Story: {
    id: ({ _id }) => _id,
    image({ image, _id }) {
      return image || defaultAvatar("story", _id);
    },
  },
};

export default resolvers;
