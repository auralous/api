import { InvalidArgError, UnauthorizedError } from "../../error/errors.js";
import { MessageService } from "../../services/message.js";
import { UserService } from "../../services/user.js";
import { PUBSUB_CHANNELS } from "../../utils/constant.js";
import { MessageType, Resolvers } from "../graphql.gen.js";

const resolvers: Resolvers = {
  Subscription: {
    messageAdded: {
      async subscribe(parent, { id }, { pubsub, auth }) {
        if (!auth) throw new UnauthorizedError();
        // FIXME: Check auth
        return pubsub.on(
          PUBSUB_CHANNELS.messageAdded,
          (payload) => payload.id === id
        );
      },
    },
  },
  Query: {
    async messages(parent, { id, next, limit }, context) {
      if (!context.auth) return null;
      limit = limit || 20; // limit = 0 is invalid
      if (limit > 20)
        throw new InvalidArgError("limit", "Must be less than or equal 20");
      return MessageService.findById(id, limit, next);
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
    id({ _id }) {
      return String(_id);
    },
    async creator({ creatorId }, args, context) {
      return (await UserService.findById(context, creatorId))!;
    },
  },
};

export default resolvers;
