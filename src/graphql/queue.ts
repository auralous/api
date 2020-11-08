import {
  AuthenticationError,
  ForbiddenError,
  UserInputError,
} from "../error/index";
import { PUBSUB_CHANNELS } from "../lib/constant";
import { IResolvers } from "../types/resolvers.gen";

export const typeDefs = `
  enum QueueAction {
    remove
    reorder
    add
    clear
  }

  type QueueItem {
    id: ID!
    trackId: String!
    creatorId: String!
  }

  type Queue {
    id: ID!
    items: [QueueItem!]!
  }

  type Query {
    queue(id:ID!): Queue
  }

  type Mutation {
    updateQueue(id:ID!, action: QueueAction!, tracks: [ID!], position: Int, insertPosition: Int): Boolean!
  }

  type Subscription {
    queueUpdated(id: ID!): Queue!
  }
`;

export const resolvers: IResolvers = {
  Query: {
    async queue(parent, { id }, { services, user }) {
      const [, roomId] = id.split(":");
      if (!(await services.Room.isViewable(roomId, user?._id))) return null;
      return { id, items: [] };
    },
  },
  Mutation: {
    async updateQueue(
      parent,
      { id, action, tracks, position, insertPosition },
      { user, services }
    ) {
      if (!user) throw new AuthenticationError("");
      const room = await services.Room.findById(id.substring(5));
      if (!room) throw new ForbiddenError("Room does not exist");

      // Check permission
      const canEditOthers = user._id === room.creatorId;
      const canAdd =
        !!user &&
        Boolean(
          room.creatorId === user._id ||
            (room.isPublic && room.anyoneCanAdd) ||
            services.Room.isMember(room._id, user._id)
        );

      const queue = await services.Queue.findById(id);

      switch (action) {
        case "add": {
          if (!tracks) throw new UserInputError("Missing tracks", ["tracks"]);
          if (!canAdd)
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
          break;
        }
        case "remove":
          if (typeof position !== "number")
            throw new UserInputError("Missing position", ["position"]);

          if (!canEditOthers && queue[position].creatorId !== user._id)
            throw new ForbiddenError(`You cannot remove other people's tracks`);

          await services.Queue.removeItem(id, position);
          break;
        case "reorder":
          if (typeof insertPosition !== "number")
            throw new UserInputError("Missing destination position", [
              "insertPosition",
            ]);
          if (typeof position !== "number")
            throw new UserInputError("Missing originated position", [
              "position",
            ]);

          if (!canEditOthers)
            throw new ForbiddenError(
              `You cannot reorder other people's tracks`
            );

          await services.Queue.reorderItems(id, position, insertPosition);
          break;
        case "clear":
          if (!canEditOthers)
            throw new ForbiddenError(`You cannot remove other people's tracks`);

          await services.Queue.deleteById(id);
          break;
        default:
          throw new ForbiddenError("Invalid action");
      }

      // Async check if nowPlaying should be reResolved
      services.NowPlaying.requestResolve(room._id);

      return true;
    },
  },
  Subscription: {
    queueUpdated: {
      subscribe(parent, { id }, { pubsub }) {
        // TODO: Block guest from subscribe to private room
        return pubsub.on(
          PUBSUB_CHANNELS.queueUpdated,
          (payload) => payload.queueUpdated.id === id
        );
      },
    },
  },
  Queue: {
    async items({ id }, args, { services }) {
      // if (!(await services.Room.isViewable(id, user?._id)))
      //   return [];
      return services.Queue.findById(id);
    },
  },
};
