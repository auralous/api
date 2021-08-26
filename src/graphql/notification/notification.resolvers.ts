import mongodb from "mongodb";
import { AuthenticationError } from "../../error/index.js";
import { NotificationService } from "../../services/notification.js";
import { SessionService } from "../../services/session.js";
import { UserService } from "../../services/user.js";
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
            _id: mongodb.ObjectId;
          }
        )._id
      ),
    follower({ followedBy }, args, context) {
      return UserService.findById(context, followedBy);
    },
  },
  NotificationNewSession: {
    id: (obj) =>
      String(
        (
          obj as unknown as {
            _id: mongodb.ObjectId;
          }
        )._id
      ),
    session({ sessionId }, args, context) {
      return SessionService.findById(context, sessionId);
    },
  },
  Query: {
    notifications(parent, { next, limit }, context) {
      if (!context.auth) return [];
      return NotificationService.findMine(context, limit, next);
    },
  },
  Mutation: {
    notificationsMarkRead(parent, { ids }, context) {
      return NotificationService.markRead(context, ids);
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
