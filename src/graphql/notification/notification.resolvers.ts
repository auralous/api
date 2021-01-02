import type { NotificationDbObject, Resolvers } from "../../types";

const resolvers: Resolvers = {
  Notification: {
    __resolveType(obj) {
      if (obj.type === "follow") return "NotificationFollow";
      else if (obj.type === "invite") return "NotificationInvite";
      else if (obj.type === "new-story") return "NotificationNewStory";
      return null;
    },
  },
  NotificationFollow: {
    id: (obj) => String(((obj as unknown) as NotificationDbObject)._id),
  },
  NotificationInvite: {
    id: (obj) => String(((obj as unknown) as NotificationDbObject)._id),
  },
  NotificationNewStory: {
    id: (obj) => String(((obj as unknown) as NotificationDbObject)._id),
  },
  Query: {
    notifications(parent, { next, limit }, { services, user }) {
      if (!user) return [];
      return services.Notification.findMine(user, limit, next);
    },
  },
  Mutation: {
    readNotifications(parent, { ids }, { services, user }) {
      return services.Notification.markRead(user, ids);
    },
  },
};

export default resolvers;
