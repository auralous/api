import {
  AuthenticationError,
  ForbiddenError,
  UserInputError,
} from "apollo-server-errors";
import { PUBSUB_CHANNELS, REDIS_KEY } from "../lib/constant";
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

  extend type Query {
    queue(id:ID!): Queue
  }

  extend type Mutation {
    updateQueue(id:ID!, action: QueueAction!, tracks: [ID!], position: Int, insertPosition: Int): Boolean!
  }

  extend type Subscription {
    queueUpdated(id: ID!): Queue!
  }
`;

export const resolvers: IResolvers = {
  Query: {
    async queue(parent, { id }, { services, user }) {
      const [resourceType, resourceId] = id.split(":");
      switch (resourceType) {
        case "room": {
          if (!(await services.Room.isViewable(resourceId, user?._id)))
            return null;
          return { id, items: [] };
        }
      }
      return null;
    },
  },
  Mutation: {
    async updateQueue(
      parent,
      { id, action, tracks, position, insertPosition },
      { user, services }
    ) {
      if (!user) throw new AuthenticationError("");
      const [resourceType, resourceId] = id.split(":");
      switch (resourceType) {
        case "room": {
          const room = await services.Room.findById(resourceId);
          if (!room) throw new ForbiddenError("Room does not exist");

          // Check permission
          const queueId = `room:${resourceId}`;

          const canEditOthers = user._id === room.creatorId;
          const canAdd =
            !!user &&
            Boolean(
              room.creatorId === user._id ||
                (room.isPublic && room.anyoneCanAdd) ||
                services.Room.isMember(room._id, user._id)
            );

          const queue = await services.Queue.findById(queueId);

          switch (action) {
            case "add": {
              if (!tracks) throw new UserInputError("missing tracks");
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
                throw new UserInputError("missing position");

              if (!canEditOthers && queue[position].creatorId !== user._id)
                throw new ForbiddenError(
                  `You cannot remove other people's tracks`
                );

              await services.Queue.removeItem(id, position);
              break;
            case "reorder":
              if (typeof insertPosition !== "number")
                throw new UserInputError("missing destination position");
              if (
                typeof position !== "number" ||
                typeof insertPosition !== "number"
              )
                throw new UserInputError("missing originate position");

              if (!canEditOthers)
                throw new ForbiddenError(
                  `You cannot reorder other people's tracks`
                );

              await services.Queue.reorderItems(id, position, insertPosition);
              break;
            case "clear":
              if (!canEditOthers)
                throw new ForbiddenError(
                  `You cannot remove other people's tracks`
                );

              await services.Queue.deleteById(id);
              break;
            default:
              throw new ForbiddenError("Invalid action");
          }

          // Async check if nowPlaying should be reResolved
          services.NowPlaying.requestResolve(REDIS_KEY.room(room._id));

          return true;
        }
        default:
          throw new UserInputError("Invalid queue id");
      }
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
      const [resourceType] = id.split(":");
      switch (resourceType) {
        case "room": {
          // if (!(await services.Room.isViewable(resourceId, user?._id)))
          //   return [];
          return services.Queue.findById(id);
        }
      }
      return [];
    },
  },
};
