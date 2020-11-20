import { AuthenticationError, ForbiddenError } from "../../error/index";
import { PUBSUB_CHANNELS, REDIS_KEY } from "../../lib/constant";
import { MessageType } from "../../types";

import type { Resolvers } from "../../types";

const resolvers: Resolvers = {
  Subscription: {
    messageAdded: {
      subscribe(parent, { id }, { pubsub, user, services }) {
        if (
          !user ||
          !services.Room.isViewable(REDIS_KEY.message(id).id, user._id)
        )
          // id is roomId
          throw new ForbiddenError("Cannot subscribe to this room");
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
      const stop = -offset - 1;
      const start = stop - limit + 1;
      // id is roomId
      if (
        !user ||
        !services.Room.isViewable(REDIS_KEY.message(id).id, user._id)
      )
        return null;
      return services.Message.findById(id, start, stop);
    },
  },
  Mutation: {
    async addMessage(parents, { id, text }, { user, services }) {
      if (!user) throw new AuthenticationError("");

      // id is roomId
      if (!(await services.Room.isViewable(REDIS_KEY.message(id).id, user._id)))
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
