import { AuthenticationError, ForbiddenError } from "../../error/index";
import { PUBSUB_CHANNELS, REDIS_KEY } from "../../lib/constant";
import { MessageType } from "../../types";

import type { Resolvers } from "../../types";

const resolvers: Resolvers = {
  Subscription: {
    messageAdded: {
      subscribe(parent, { id }, { pubsub }) {
        // FIXME: This allows nonmember to subscribe
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
      if (!story || !services.Story.getPermission(story, user?._id).isViewable)
        return null;
      return services.Message.findById(id, start, stop);
    },
  },
  Mutation: {
    async addMessage(parents, { id, text }, { user, services }) {
      if (!user) throw new AuthenticationError("");

      // id is storyId
      const story = await services.Story.findById(REDIS_KEY.message(id).id);

      if (!story || !services.Story.getPermission(story, user._id).isViewable)
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
