import { withFilter } from "graphql-subscriptions";
import { IResolvers, INowPlayingReactionType } from "../types/resolvers.gen";

export const typeDefs = `
  enum NowPlayingReactionType {
    heart
    tear_joy
    fire
    crying
  }
  extend type Query {
    nowPlaying(id: ID!): NowPlaying
    nowPlayingReactions(id: ID!): NowPlayingReaction
  }
  extend type Mutation {
    reactNowPlaying(id: ID!, reaction: NowPlayingReactionType!): Boolean
  }
  extend type Subscription {
    nowPlayingUpdated(id: ID!): NowPlaying
    nowPlayingReactionsUpdated(id: ID!): NowPlayingReaction
  }
  type NowPlayingQueueItem {
    id: ID!
    trackId: ID!
    playedAt: DateTime!
    endedAt: DateTime!
  }
  type NowPlaying {
    id: ID!
    currentTrack: NowPlayingQueueItem
  }
  type NowPlayingReaction {
    id: ID!
    mine: [NowPlayingReactionType!]!
    heart: Int!
    crying: Int!
    tear_joy: Int!
    fire: Int!
  }
`;

export const resolvers: IResolvers = {
  Query: {
    // @ts-ignore
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
            mine: [],
            [INowPlayingReactionType.Heart]: 0,
            [INowPlayingReactionType.Crying]: 0,
            [INowPlayingReactionType.TearJoy]: 0,
            [INowPlayingReactionType.Fire]: 0,
          };
    },
  },
  Mutation: {
    async reactNowPlaying(parent, { id, reaction }, { services }) {
      await services.NowPlaying.reactNowPlaying(id, reaction);
      return true;
    },
  },
  Subscription: {
    nowPlayingUpdated: {
      subscribe: withFilter(
        (parent, args, { pubsub }) =>
          pubsub.asyncIterator("NOW_PLAYING_UPDATED"),
        (payload, variables) => payload.nowPlayingUpdated.id === variables.id
      ),
    },
    nowPlayingReactionsUpdated: {
      subscribe: withFilter(
        (parent, args, { pubsub }) =>
          pubsub.asyncIterator("NOW_PLAYING_REACTIONS_UPDATED"),
        (payload, variables) =>
          payload.nowPlayingReactionsUpdated.id === variables.id
      ),
    },
  },
};
