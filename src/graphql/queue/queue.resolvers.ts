import { PUBSUB_CHANNELS } from "../../utils/constant.js";
import type { Resolvers } from "../graphql.gen.js";

const resolvers: Resolvers = {
  Query: {
    async queue(parent, { id }) {
      // FIXME: Check auth
      return { id, items: [] };
    },
  },
  Mutation: {
    async queueAdd(parent, { id, ...addArgs }, { user, services }) {
      return services.Queue.executeQueueAction(
        user,
        await services.Story.findById(id),
        { add: addArgs }
      );
    },
    async queueRemove(parent, { id, uids }, { user, services }) {
      return services.Queue.executeQueueAction(
        user,
        await services.Story.findById(id),
        { remove: uids }
      );
    },
    async queueReorder(parent, { id, ...reorderArgs }, { user, services }) {
      return services.Queue.executeQueueAction(
        user,
        await services.Story.findById(id),
        { reorder: reorderArgs }
      );
    },
  },
  Subscription: {
    queueUpdated: {
      subscribe(parent, { id }, { pubsub }) {
        // FIXME: This allows nonmember to subscribe
        return pubsub.on(
          PUBSUB_CHANNELS.queueUpdated,
          (payload) => payload.queueUpdated.id === id
        );
      },
    },
  },
  Queue: {
    async items({ id }, args, { services }) {
      return services.Queue.findById(id, 0, -1);
    },
  },
};

export default resolvers;
