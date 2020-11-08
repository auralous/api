import { PUBSUB_CHANNELS } from "../lib/constant";
import { IResolvers, INowPlayingReactionType } from "../types/resolvers.gen";

export const typeDefs = `
  enum NowPlayingReactionType {
    heart
    joy
    fire
    cry
  }
  type Query {
    nowPlaying(id: ID!): NowPlaying
    nowPlayingReactions(id: ID!): NowPlayingReaction
  }
  type Mutation {
    reactNowPlaying(id: ID!, reaction: NowPlayingReactionType!): Boolean
    skipNowPlaying(id: ID!): Boolean
  }
  type Subscription {
    nowPlayingUpdated(id: ID!): NowPlaying
    nowPlayingReactionsUpdated(id: ID!): NowPlayingReaction
  }
  type NowPlayingQueueItem {
    id: ID!
    trackId: ID!
    playedAt: DateTime!
    endedAt: DateTime!
    creatorId: ID!
  }
  type NowPlaying {
    id: ID!
    currentTrack: NowPlayingQueueItem
  }
  type NowPlayingReaction {
    id: ID!
    mine: NowPlayingReactionType
    heart: Int!
    cry: Int!
    joy: Int!
    fire: Int!
  }
`;

export const resolvers: IResolvers = {
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
      return currentTrack
        ? await services.NowPlaying._getReactionsCountAndMine(
            id,
            currentTrack.id
          )
        : {
            id,
            mine: null,
            [INowPlayingReactionType.Heart]: 0,
            [INowPlayingReactionType.Cry]: 0,
            [INowPlayingReactionType.Joy]: 0,
            [INowPlayingReactionType.Fire]: 0,
          };
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
