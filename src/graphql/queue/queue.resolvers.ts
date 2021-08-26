import { QueueService } from "../../services/queue.js";
import { PUBSUB_CHANNELS } from "../../utils/constant.js";
import type { Resolvers } from "../graphql.gen.js";

const resolvers: Resolvers = {
  Query: {
    async queue(parent, { id, from, to }) {
      return {
        id,
        items: await QueueService.findById(id, from ?? 0, to ?? -1),
      };
    },
  },
  Mutation: {
    async queueAdd(parent, { id, ...addArgs }, context) {
      return QueueService.executeQueueAction(context, id, {
        add: addArgs,
      });
    },
    async queueRemove(parent, { id, uids }, context) {
      return QueueService.executeQueueAction(context, id, {
        remove: uids,
      });
    },
    async queueReorder(parent, { id, ...reorderArgs }, context) {
      return QueueService.executeQueueAction(context, id, {
        reorder: reorderArgs,
      });
    },
    async queueToTop(parent, { id, ...toTopArgs }, context) {
      return QueueService.executeQueueAction(context, id, {
        toTop: toTopArgs,
      });
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
};

export default resolvers;
