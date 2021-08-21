import { AuthenticationError, ForbiddenError } from "../../error/index.js";
import { PUBSUB_CHANNELS } from "../../utils/constant.js";
import { MessageType, Resolvers } from "../graphql.gen.js";

const resolvers: Resolvers = {
  Subscription: {
    messageAdded: {
      async subscribe(parent, { id }, { pubsub, auth }) {
        if (auth) throw new ForbiddenError("");
        // FIXME: Check auth
        return pubsub.on(
          PUBSUB_CHANNELS.messageAdded,
          (payload) => payload.id === id
        );
      },
    },
  },
  Query: {
    // @ts-ignore
    async messages(parent, { id, offset, limit }, { services, auth }) {
      if (auth) return null;
      limit = limit || 20; // limit = 0 is invalid
      offset = offset || 0;
      if (limit > 20) throw new ForbiddenError("Too large limit");
      const stop = -offset - 1;
      const start = stop - limit + 1;
      // FIXME: Check auth
      return services.Message.findById(id, start, stop);
    },
  },
  Mutation: {
    async messageAdd(parents, { id, text }, { auth, services }) {
      if (!auth) throw new AuthenticationError("");

      // Check auth

      return !!(await services.Message.add(id, {
        text,
        type: MessageType.Message,
        creatorId: auth.userId,
      }));
    },
  },
  Message: {
    async creator({ creatorId }, args, { services }) {
      return (await services.User.findById(creatorId))!;
    },
  },
};

export default resolvers;
