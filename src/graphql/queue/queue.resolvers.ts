import { ForbiddenError } from "../../error/index";
import { PUBSUB_CHANNELS } from "../../lib/constant";

import type { Resolvers } from "../../types/index";
import { StoryService } from "../../services/story";

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
    async updateQueue(
      parent,
      { id, action, tracks, position, insertPosition },
      { user, services }
    ) {
      const story = await services.Story.findById(id);
      if (!story) throw new ForbiddenError("Story does not exist");

      return services.Queue.executeQueueAction(user, story, {
        action,
        tracks,
        position,
        insertPosition,
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
      return services.Queue.findById(id);
    },
  },
};

export default resolvers;
