import { PUBSUB_CHANNELS } from "../../lib/constant";
import { StoryService } from "../../services/story";
import type { Resolvers } from "../../types/index";

const resolvers: Resolvers = {
  Query: {
    async queue(parent, { id }, { services, user }) {
      const story = await services.Story.findById(id.split(":")[0]);
      if (!story || !StoryService.getPermission(user, story).isViewable)
        return null;
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
    async queueRemove(parent, { id, ...removeArgs }, { user, services }) {
      return services.Queue.executeQueueAction(
        user,
        await services.Story.findById(id),
        { remove: removeArgs }
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
      return services.Queue.findById(id);
    },
  },
};

export default resolvers;
