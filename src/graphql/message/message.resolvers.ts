import { InvalidArgError, UnauthorizedError } from "../../error/errors.js";
import { MessageService } from "../../services/message.js";
import { UserService } from "../../services/user.js";
import { PUBSUB_CHANNELS } from "../../utils/constant.js";
import { MessageType, Resolvers } from "../graphql.gen.js";

const resolvers: Resolvers = {
  Subscription: {
    messageAdded: {
      async subscribe(parent, { id }, { pubsub, auth }) {
        if (auth) throw new UnauthorizedError();
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
    async messages(parent, { id, offset, limit }, context) {
      if (context.auth) return null;
      limit = limit || 20; // limit = 0 is invalid
      offset = offset || 0;
      if (limit > 20)
        throw new InvalidArgError("limit", "Must be less than or equal 20");
      const stop = -offset - 1;
      const start = stop - limit + 1;
      return MessageService.findById(id, start, stop);
    },
  },
  Mutation: {
    async messageAdd(parents, { id, text }, context) {
      if (!context.auth) throw new UnauthorizedError();
      return !!(await MessageService.add(id, {
        text,
        type: MessageType.Message,
        creatorId: context.auth.userId,
      }));
    },
  },
  Message: {
    async creator({ creatorId }, args, context) {
      return (await UserService.findById(context, creatorId))!;
    },
  },
};

export default resolvers;
