import { PUBSUB_CHANNELS } from "../../lib/constant";

import type { Resolvers } from "../../types/index";

const resolvers: Resolvers = {
  Query: {
    async nowPlaying(parent, { id }, { services }) {
      const currentTrack = await services.NowPlaying.findById(id);
      return {
        id,
        currentTrack,
      };
    },
    async nowPlayingReactions(parent, { id }, { services }) {
      const currentTrack = await services.NowPlaying.findById(id);
      return services.NowPlaying._getReactionsCountAndMine(
        id,
        currentTrack?.id
      );
    },
  },
  Mutation: {
    async reactNowPlaying(parent, { id, reaction }, { services }) {
      await services.NowPlaying.reactNowPlaying(id, reaction);
      return true;
    },
    async skipNowPlaying(parent, { id }, { services }) {
      return services.NowPlaying.skipCurrentTrack(id);
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
          (payload) => payload.nowPlayingReactionsUpdated.id === id
        );
      },
    },
  },
};

export default resolvers;
