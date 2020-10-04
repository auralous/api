import {
  AuthenticationError,
  ForbiddenError,
  UserInputError,
} from "apollo-server-errors";
import { withFilter } from "graphql-subscriptions";
import { REDIS_KEY } from "../lib/constant";
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

const QUEUE_UPDATED = "QUEUE_UPDATED";

export const resolvers: IResolvers = {
  Query: {
    async queue(parent, { id }) {
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
                room.anyoneCanAdd ||
                room.collabs?.includes(user._id)
            );

          const queue = await services.Queue.findById(queueId);

          switch (action) {
            case "add": {
              if (!tracks) throw new UserInputError("missing tracks");
              if (!canAdd)
                throw new ForbiddenError(
                  "You are not allowed to add to this queue"
                );

              if (room.queueMax) {
                // Check queue length
                let inQueueCount = 0;
                for (const item of queue) {
                  item.creatorId === user._id && inQueueCount++;
                }
                if (inQueueCount + tracks.length > room.queueMax)
                  throw new ForbiddenError(
                    `You added # of songs that is over the queue limit (${room.queueMax})`
                  );
              }

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
      subscribe: withFilter(
        (parent, args, { pubsub }) => pubsub.asyncIterator(QUEUE_UPDATED),
        (payload, variables) => payload.queueUpdated.id === variables.id
      ),
    },
  },
  Queue: {
    items({ id }, args, { services }) {
      return services.Queue.findById(id);
    },
  },
};
