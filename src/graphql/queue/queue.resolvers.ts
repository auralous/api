import { QueueService } from "../../services/queue.js";
import type { Resolvers } from "../graphql.gen.js";

const resolvers: Resolvers = {
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
};

export default resolvers;
