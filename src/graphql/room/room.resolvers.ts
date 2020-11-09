import { AuthenticationError, UserInputError } from "../../error/index";
import { CONFIG, PUBSUB_CHANNELS } from "../../lib/constant";
import { uploadStreamToCloudinary } from "../../lib/cloudinary";
import { defaultAvatar } from "../../lib/defaultAvatar";
import { RoomMembership } from "../../types/index";

import type { Resolvers } from "../../types/index";

const resolvers: Resolvers = {
  Query: {
    room(parent, { id }, { services }) {
      return services.Room.findById(id);
    },
    rooms(parent, { creatorId }, { services }) {
      if (creatorId) return services.Room.findByCreatorId(creatorId);
      return null;
    },
    async exploreRooms(parent, { by }, { services, setCacheControl }) {
      if (by === "random") {
        const rooms = await services.Room.findRandom(20);
        if (rooms) setCacheControl?.(CONFIG.randomRoomsMaxAge);
        return rooms;
      }
      throw new UserInputError("Invalid `by` parameter", ["by"]);
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
        RoomMembership.Collab,
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

export default resolvers;
