import { AuthenticationError, ForbiddenError } from "../../error/index";
import { PUBSUB_CHANNELS, REDIS_KEY } from "../../lib/constant";
import { MessageType } from "../../types";

import type { Resolvers } from "../../types";
import { StoryService } from "../../services/story";

const resolvers: Resolvers = {
  Subscription: {
    messageAdded: {
      async subscribe(parent, { id }, { pubsub, services, user }) {
        const story = await services.Story.findById(REDIS_KEY.message(id).id);
        if (!story || !StoryService.getPermission(user, story).isViewable)
          throw new ForbiddenError(
            "You are not allowed to subscribe to this channel"
          );

        return pubsub.on(
          PUBSUB_CHANNELS.messageAdded,
          (payload) => payload.id === id
        );
      },
    },
  },
  Query: {
    async messages(parent, { id, offset, limit }, { user, services }) {
      limit = limit || 20; // limit = 0 is invalid
      offset = offset || 0;
      if (limit > 20) throw new ForbiddenError("Too large limit");
      const stop = -offset - 1;
      const start = stop - limit + 1;
      // id is storyId
      const story = await services.Story.findById(REDIS_KEY.message(id).id);
      if (!story || !StoryService.getPermission(user, story).isViewable)
        return null;
      return services.Message.findById(id, start, stop);
    },
  },
  Mutation: {
    async addMessage(parents, { id, text }, { user, services }) {
      if (!user) throw new AuthenticationError("");

      const story = await services.Story.findById(REDIS_KEY.message(id).id);

      if (!story || !StoryService.getPermission(user, story).isViewable)
        throw new ForbiddenError(
          "You are not allowed to send message to this channel"
        );

      return !!(await services.Message.add(id, {
        text,
        type: MessageType.Message,
        creatorId: user._id,
      }));
    },
  },
};

export default resolvers;
