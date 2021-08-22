import mongodb from "mongodb";
import { AuthenticationError } from "../../error/index.js";
import { PUBSUB_CHANNELS } from "../../utils/constant.js";
import type { Resolvers } from "../graphql.gen.js";

const resolvers: Resolvers = {
  Notification: {
    __resolveType(obj) {
      if (obj.type === "follow") return "NotificationFollow";
      else if (obj.type === "new-session") return "NotificationNewSession";
      return null;
    },
  },
  NotificationFollow: {
    id: (obj) =>
      String(
        (
          obj as unknown as {
            _id: mongodb.ObjectID;
          }
        )._id
      ),
    follower({ followedBy }, args, { services }) {
      return services.User.findById(followedBy);
    },
  },
  NotificationNewSession: {
    id: (obj) =>
      String(
        (
          obj as unknown as {
            _id: mongodb.ObjectID;
          }
        )._id
      ),
    session({ sessionId }, args, { services }) {
      return services.Session.findById(sessionId);
    },
  },
  Query: {
    notifications(parent, { next, limit }, { services, auth }) {
      if (!auth) return [];
      return services.Notification.findMine(auth, limit, next);
    },
  },
  Mutation: {
    notificationsMarkRead(parent, { ids }, { services, auth }) {
      return services.Notification.markRead(auth, ids);
    },
  },
  Subscription: {
    notificationAdded: {
      async subscribe(parent, args, { auth, pubsub }) {
        if (!auth) throw new AuthenticationError("");

        return pubsub.on(
          PUBSUB_CHANNELS.notificationAdded,
          (payload) => payload.notificationAdded.userId === auth.userId
        );
      },
    },
  },
};

export default resolvers;
