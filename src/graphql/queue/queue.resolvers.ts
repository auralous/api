import { NowPlayingWorker } from "../../services/nowPlayingWorker";
import {
  AuthenticationError,
  ForbiddenError,
  UserInputError,
} from "../../error/index";
import { PUBSUB_CHANNELS } from "../../lib/constant";

import type { Resolvers } from "../../types/index";
import { QueueAction } from "../../types/graphql.gen";

const resolvers: Resolvers = {
  Query: {
    async queue(parent, { id }, { services, user }) {
      const story = await services.Story.findById(id.split(":")[0]);
      if (!story || !services.Story.getPermission(story, user?._id).isViewable)
        return null;
      return { id, items: [] };
    },
  },
  Mutation: {
    async updateQueue(
      parent,
      { id, action, tracks, position, insertPosition },
      { user, services, pubsub }
    ) {
      if (!user) throw new AuthenticationError("");
      const story = await services.Story.findById(id);
      if (!story) throw new ForbiddenError("Story does not exist");

      // Check permission
      if (!services.Story.getPermission(story, user._id).isQueueable)
        throw new ForbiddenError("You are not allowed to add to this queue");

      switch (action) {
        case QueueAction.Add: {
          if (!tracks) throw new UserInputError("Missing tracks", ["tracks"]);

          await services.Queue.pushItems(
            id,
            ...tracks.map((trackId) => ({
              trackId,
              creatorId: user?._id,
            }))
          );

          // It is possible that adding a new item will restart nowPlaying
          NowPlayingWorker.requestResolve(pubsub, story._id.toHexString());
          break;
        }
        case QueueAction.Remove:
          if (typeof position !== "number")
            throw new UserInputError("Missing position", ["position"]);

          await services.Queue.removeItem(id, position);
          break;
        case QueueAction.Reorder:
          if (typeof insertPosition !== "number")
            throw new UserInputError("Missing destination position", [
              "insertPosition",
            ]);
          if (typeof position !== "number")
            throw new UserInputError("Missing originated position", [
              "position",
            ]);

          await services.Queue.reorderItems(id, position, insertPosition);
          break;
        case QueueAction.Clear:
          await services.Queue.deleteById(id);
          break;
        default:
          throw new ForbiddenError("Invalid action");
      }

      return true;
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
