import { PUBSUB_CHANNELS } from "../../utils/constant.js";
import type { Resolvers } from "../graphql.gen.js";

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
    async nowPlayingReact(parent, { id, reaction }, { services, auth }) {
      await services.NowPlaying.reactNowPlaying(
        auth,
        await services.Session.findById(id),
        reaction
      );
      return true;
    },
    async nowPlayingSkip(parent, { id }, { services, auth }) {
      return services.NowPlaying.skipCurrentTrack(
        auth,
        await services.Session.findById(id)
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
