import { UserDbObject } from "../../data/types.js";
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
      await services.Queue.assertStoryQueueActionable(user, id);
      return services.Queue.executeQueueAction(user as UserDbObject, id, {
        add: addArgs,
      });
    },
    async queueRemove(parent, { id, uids }, { user, services }) {
      await services.Queue.assertStoryQueueActionable(user, id);
      return services.Queue.executeQueueAction(user as UserDbObject, id, {
        remove: uids,
      });
    },
    async queueReorder(parent, { id, ...reorderArgs }, { user, services }) {
      await services.Queue.assertStoryQueueActionable(user, id);
      return services.Queue.executeQueueAction(user as UserDbObject, id, {
        reorder: reorderArgs,
      });
    },
    async queueToTop(parent, { id, ...toTopArgs }, { user, services }) {
      await services.Queue.assertStoryQueueActionable(user, id);
      return services.Queue.executeQueueAction(user as UserDbObject, id, {
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
  Queue: {
    async items({ id }, args, { services }) {
      return services.Queue.findById(id, 0, -1);
    },
  },
};

export default resolvers;
