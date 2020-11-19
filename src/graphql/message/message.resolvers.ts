import { AuthenticationError, ForbiddenError } from "../../error/index";
import { PUBSUB_CHANNELS } from "../../lib/constant";
import { MessageType } from "../../types";

import type { Resolvers } from "../../types";

const resolvers: Resolvers = {
  Subscription: {
    messageAdded: {
      subscribe(parent, { id }, { pubsub }) {
        return pubsub.on(
          PUBSUB_CHANNELS.messageAdded,
          (payload) => payload.id === id
        );
      },
    },
  },
  Query: {
    messages(parent, { id, offset, limit }, { user, services }) {
      limit = limit || 20; // limit = 0 is invalid
      offset = offset || 0;
      if (limit > 20) throw new ForbiddenError("Too large limit");
      if (!user) return null;
      const stop = -offset - 1;
      const start = stop - limit + 1;
      return services.Message.findById(id, start, stop, user._id);
    },
  },
  Mutation: {
    async addMessage(parents, { id, text }, { user, services }) {
      if (!user) throw new AuthenticationError("");
      return !!(await services.Message.add(id, {
        text,
        type: MessageType.Message,
        creatorId: user._id,
      }));
    },
  },
};

export default resolvers;
