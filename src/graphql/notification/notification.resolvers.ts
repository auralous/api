import type { NotificationDbObject, Resolvers } from "../../types";

const resolvers: Resolvers = {
  Notification: {
    __resolveType(obj) {
      if (obj.type === "follow") return "NotificationFollow";
      else if (obj.type === "invite") return "NotificationInvite";
      return null;
    },
  },
  NotificationFollow: {
    id: (obj) => String(((obj as unknown) as NotificationDbObject)._id),
  },
  NotificationInvite: {
    id: (obj) => String(((obj as unknown) as NotificationDbObject)._id),
  },
  Query: {
    notifications(parent, { next, limit }, { services, user }) {
      if (!user) return [];
      return services.Notification.findMine(user, limit, next);
    },
  },
};

export default resolvers;
