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
      const [, roomId] = id.split(":");
      const room = await services.Room.findById(roomId);
      if (!room || !services.Room.getPermission(room, user?._id).viewable)
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
      const room = await services.Room.findById(id.substring(5));
      if (!room) throw new ForbiddenError("Room does not exist");

      // Check permission
      const roomPermission = services.Room.getPermission(room, user._id);

      const queue = await services.Queue.findById(id);

      switch (action) {
        case QueueAction.Add: {
          if (!tracks) throw new UserInputError("Missing tracks", ["tracks"]);
          if (!roomPermission.queueCanAdd)
            throw new ForbiddenError(
              "You are not allowed to add to this queue"
            );

          await services.Queue.pushItems(
            id,
            ...tracks.map((trackId) => ({
              trackId,
              creatorId: user?._id,
            }))
          );

          // It is possible that adding a new item will restart nowPlaying
          NowPlayingWorker.requestResolve(pubsub, room._id);
          break;
        }
        case QueueAction.Remove:
          if (typeof position !== "number")
            throw new UserInputError("Missing position", ["position"]);

          if (
            !roomPermission.queueCanManage &&
            queue[position].creatorId !== user._id
          )
            throw new ForbiddenError(`You cannot remove other people's tracks`);

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

          if (!roomPermission.queueCanManage)
            throw new ForbiddenError(
              `You cannot reorder other people's tracks`
            );

          await services.Queue.reorderItems(id, position, insertPosition);
          break;
        case QueueAction.Clear:
          if (!roomPermission.queueCanManage)
            throw new ForbiddenError(`You cannot remove other people's tracks`);

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
