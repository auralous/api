import { nanoid } from "nanoid/non-secure";
import { AuthenticationError } from "../error/index";
import { IResolvers } from "../types/resolvers.gen";
import { PUBSUB_CHANNELS } from "../lib/constant";

export const typeDefs = `
  extend type Mutation {
    addMessage(roomId: ID!, message: String!): Boolean!
  }

  extend type Subscription {
    messageAdded(roomId: ID!): Message!
  }

  type Message {
    id: ID!
    createdAt: DateTime!
    message: String!
    from: MessageParticipant!
  }

  type MessageParticipant {
    type: String!
    id: ID!
    name: String!
    photo: String!
    uri: String!
  }
`;

export const resolvers: IResolvers = {
  Subscription: {
    messageAdded: {
      subscribe(parent, { roomId }, { pubsub }) {
        return pubsub.on(
          PUBSUB_CHANNELS.messageAdded,
          (payload) => payload.messageAdded.roomId === roomId
        );
      },
    },
  },
  Message: {
    async from(parent, args, { services }) {
      const from = {
        name: "Unknown",
        id: parent.from.id,
        type: parent.from.type,
        photo: `https://avatar.tobi.sh/${parent.from.id}`,
        uri: process.env.APP_URI as string,
      };
      if (from.type === "user") {
        const user = await services.User.findById(from.id);
        // FIXME; user?.username is not consistent
        from.name = user?.username || from.name;
        from.photo = user?.profilePicture || from.photo;
        if (user) from.uri = `${process.env.APP_URI}/@${user.username}`;
      }
      return from;
    },
  },
  Mutation: {
    async addMessage(parents, { roomId, message }, { user, pubsub }) {
      if (!user) throw new AuthenticationError("");

      const messageAdded = {
        id: nanoid(12),
        roomId,
        createdAt: new Date(),
        message,
        from: {
          type: "user",
          id: user._id,
        },
      };
      pubsub.publish(PUBSUB_CHANNELS.messageAdded, {
        messageAdded,
      });
      return true;
    },
  },
};
