import { AuthenticationError, UserInputError } from "apollo-server-errors";
import { withFilter } from "graphql-subscriptions";
import { CONFIG } from "../lib/constant";
import { uploadStreamToCloudinary } from "../lib/cloudinary";
import { defaultAvatar } from "../lib/defaultAvatar";
import { IResolvers } from "../types/resolvers.gen";

export const typeDefs = `
  extend type Query {
    room(id: ID!): Room
    roomState(id: ID!): RoomState
    rooms(creatorId: String): [Room!]
    exploreRooms(by: String!): [Room!]!
    searchRooms(query: String!, limit: Int): [Room!]!
  }

  enum RoomMembership {
    host
    collab
  }

  extend type Mutation {
    createRoom(title: String!, description: String): Room!
    updateRoom(id: ID!, title: String, description: String, image: Upload, anyoneCanAdd: Boolean, queueMax: Int): Room!
    updateRoomMembership(id: ID!, username: String, userId: String, role: RoomMembership): Boolean!
    deleteRoom(id: ID!): ID!
  }

  extend type Subscription {
    roomStateUpdated(id: ID!): RoomState
  }

  type Room {
    id: ID!
    title: String!
    description: String
    image: String!
    creator: User!
    createdAt: DateTime!
  }

  type RoomState {
    id: ID!
    userIds: [String!]!
    # Settings
    anyoneCanAdd: Boolean!
    collabs: [String!]!
    queueMax: Int!
  }
`;

export const resolvers: IResolvers = {
  Query: {
    room(parent, { id }, { services }) {
      return services.Room.findById(id);
    },
    rooms(parent, { creatorId }, { services }) {
      if (creatorId) return services.Room.findByCreatorId(creatorId);
      return null;
    },
    async exploreRooms(parent, { by }, { services, setCacheControl }) {
      switch (by) {
        case "random": {
          const rooms = await services.Room.findRandom(20);
          if (rooms) setCacheControl?.(CONFIG.randomRoomsMaxAge);
          return rooms;
        }
        default:
          throw new UserInputError("Invalid `by` parameter");
      }
    },
    searchRooms(parent, { query, limit }, { services }) {
      return services.Room.search(query, limit);
    },
    // @ts-ignore
    roomState(parent, { id }) {
      return { id };
    },
  },
  Mutation: {
    createRoom(parent, { title, description }, { services }) {
      return services.Room.create({ title, description });
    },
    async updateRoom(
      parent,
      { id, title, description, image: imageFile, anyoneCanAdd, queueMax },
      { user, services }
    ) {
      if (!user) throw new AuthenticationError("");

      const image = imageFile
        ? await uploadStreamToCloudinary((await imageFile).createReadStream(), {
            publicId: `users/${user._id}/rooms/${id}/image`,
          })
        : undefined;

      return services.Room.updateById(id, {
        title,
        description,
        image,
        anyoneCanAdd,
        queueMax,
      });
    },
    async updateRoomMembership(
      parent,
      { id, username, userId, role },
      { services }
    ) {
      if (username)
        await services.Room.updateMembershipById(id, username, role);
      else if (userId)
        await services.Room.updateMembershipById(id, userId, role, true);
      else throw new UserInputError("Provide either username or userId");
      return true;
    },
    async deleteRoom(parent, { id }, { services }) {
      await services.Room.deleteById(id);
      return id;
    },
  },
  Subscription: {
    roomStateUpdated: {
      subscribe: withFilter(
        (parent, args, { pubsub }) =>
          pubsub.asyncIterator("ROOM_STATE_UPDATED"),
        (payload, variables) => payload.roomStateUpdated.id === variables.id
      ),
    },
  },
  Room: {
    id: ({ _id }) => _id,
    async creator({ creatorId }, args, { services }) {
      const user = await services.User.findById(creatorId);
      if (!user) throw new Error("Creator not found.");
      return user;
    },
    image({ image, _id }) {
      return image || defaultAvatar("room", _id);
    },
  },
  RoomState: {
    userIds({ id }, args, { services }) {
      return services.Room.getCurrentUsers(id);
    },
    anyoneCanAdd({ id }, args, { services }) {
      return services.Room.findById(id).then((s) => s?.anyoneCanAdd || false);
    },
    collabs({ id }, args, { services }) {
      return services.Room.findById(id).then((s) => s?.collabs || []);
    },
    queueMax({ id }, args, { services }) {
      return services.Room.findById(id).then((s) => s?.queueMax || 0);
    },
  },
};
