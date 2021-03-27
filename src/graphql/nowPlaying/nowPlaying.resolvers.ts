import { PUBSUB_CHANNELS } from "../../lib/constant";
import type { Resolvers } from "../../types/index";

const resolvers: Resolvers = {
  Query: {
    async nowPlaying(parent, { id }, { services }) {
      const currentTrack = await services.NowPlaying.findById(id);
      return { id, currentTrack };
    },
    async nowPlayingReactions(parent, { id }, { services }) {
      return services.NowPlaying.getAllReactions(id);
    },
  },
  Mutation: {
    async reactNowPlaying(parent, { id, reaction }, { services, user }) {
      await services.NowPlaying.reactNowPlaying(
        user,
        await services.Story.findById(id),
        reaction
      );
      return true;
    },
    async skipNowPlaying(parent, { id }, { services, user }) {
      return services.NowPlaying.skipCurrentTrack(
        user,
        await services.Story.findById(id)
      );
    },
  },
  Subscription: {
    nowPlayingUpdated: {
      subscribe(parent, { id }, { pubsub }) {
        return pubsub.on(
          PUBSUB_CHANNELS.nowPlayingUpdated,
          (payload) => payload.nowPlayingUpdated.id === id
        );
      },
    },
    nowPlayingReactionsUpdated: {
      subscribe(parent, { id }, { pubsub }) {
        return pubsub.on(
          PUBSUB_CHANNELS.nowPlayingReactionsUpdated,
          (payload) => payload.id === id
        );
      },
    },
  },
};

export default resolvers;
