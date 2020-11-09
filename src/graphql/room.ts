import { AuthenticationError, UserInputError } from "../error/index";
import { CONFIG, PUBSUB_CHANNELS } from "../lib/constant";
import { uploadStreamToCloudinary } from "../lib/cloudinary";
import { defaultAvatar } from "../lib/defaultAvatar";
import { IRoomMembership } from "../types/index";

import type { IResolvers } from "../types/index";

export const typeDefs = `
  type Query {
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

  type Mutation {
    createRoom(title: String!, description: String, isPublic: Boolean! anyoneCanAdd: Boolean, password: String): Room!
    updateRoom(id: ID!, title: String, description: String, image: Upload, anyoneCanAdd: Boolean, password: String): Room!
    joinPrivateRoom(id: ID!, password: String!): Boolean!
    updateRoomMembership(id: ID!, username: String, userId: String, role: RoomMembership): Boolean!
    deleteRoom(id: ID!): ID!
  }

  type Subscription {
    roomStateUpdated(id: ID!): RoomState
  }

  type Room {
    id: ID!
    title: String!
    isPublic: Boolean!
    description: String
    image: String!
    creatorId: ID!
    createdAt: DateTime!
  }

  type RoomState {
    id: ID!
    userIds: [String!]!
    # Settings
    anyoneCanAdd: Boolean!
    collabs: [String!]!
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
          throw new UserInputError("Invalid `by` parameter", ["by"]);
      }
    },
    searchRooms(parent, { query, limit }, { services }) {
      return services.Room.search(query, limit);
    },
    roomState(parent, { id }, { services }) {
      return services.Room.getRoomState(id);
    },
  },
  Mutation: {
    createRoom(
      parent,
      { title, description, isPublic, anyoneCanAdd },
      { services }
    ) {
      return services.Room.create({
        title,
        description,
        isPublic,
        anyoneCanAdd,
      });
    },
    async updateRoom(
      parent,
      { id, title, description, image: imageFile, anyoneCanAdd, password },
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
        password,
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
      else
        throw new UserInputError("Must provide either username or userId", [
          "username",
          "userId",
        ]);
      return true;
    },
    async joinPrivateRoom(parent, { id, password }, { services, user }) {
      if (!user) throw new AuthenticationError("");
      const room = await services.Room.findById(id);
      if (room?.isPublic !== false) return false;
      if (room.password !== password) return false;
      await services.Room.updateMembershipById(
        id,
        user._id,
        IRoomMembership.Collab,
        true,
        true
      );
      return true;
    },
    async deleteRoom(parent, { id }, { services }) {
      await services.Room.deleteById(id);
      return id;
    },
  },
  Subscription: {
    roomStateUpdated: {
      subscribe(parent, { id }, { pubsub }) {
        return pubsub.on(
          PUBSUB_CHANNELS.roomStateUpdated,
          (payload) => payload.roomStateUpdated.id === id
        );
      },
    },
  },
  Room: {
    id: ({ _id }) => _id,
    image({ image, _id }) {
      return image || defaultAvatar("room", _id);
    },
  },
};
