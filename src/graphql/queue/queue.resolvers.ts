import { StoryService } from "../../services/story.js";
import { PUBSUB_CHANNELS } from "../../utils/constant.js";
import type { Resolvers } from "../graphql.gen.js";

const resolvers: Resolvers = {
  Query: {
    async queue(parent, { id }, { services, user }) {
      const [storyId] = id.split(":");
      const story = await services.Story.findById(storyId);
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
      const [storyId, played] = id.split(":");
      return services.Queue.findById(storyId, 0, -1, Boolean(played));
    },
  },
};

export default resolvers;
