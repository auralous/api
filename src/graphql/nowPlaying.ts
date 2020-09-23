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
    nowPlayingReaction(id: ID!): NowPlayingReaction
  }
  extend type Mutation {
    reactNowPlaying(id: ID!, reaction: NowPlayingReactionType!): Boolean
  }
  extend type Subscription {
    nowPlayingUpdated(id: ID!): NowPlaying
    nowPlayingReactionUpdated(id: ID!): NowPlayingReaction
  }
  type NowPlayingQueueItem {
    id: ID!
    trackId: ID!
    tracks: CrossTracksWrapper!
    playedAt: DateTime!
  }

  type NowPlaying {
    id: ID!
    currentTrack: NowPlayingQueueItem
  }
  type NowPlayingReaction {
    id: ID!
    reactions: NowPlayingReactionCount!
    mine: NowPlayingReactionType
  }
  type NowPlayingReactionCount {
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
      return {
        id,
        currentTrack: await services.NowPlaying.findById(id),
      };
    },
    nowPlayingReaction(parent, { id }) {
      return {
        id,
        // This will be resolved later
        reactions: {
          heart: 0,
          crying: 0,
          tear_joy: 0,
          fire: 0,
        },
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
    nowPlayingReactionUpdated: {
      subscribe: withFilter(
        (parent, args, { pubsub }) =>
          pubsub.asyncIterator("NOW_PLAYING_REACTION_UPDATED"),
        (payload, variables) =>
          payload.nowPlayingReactionUpdated.id === variables.id
      ),
    },
  },
  NowPlayingReaction: {
    reactions: async (parent, args, { services }) => {
      const reactions: Record<INowPlayingReactionType, number> = {
        heart: 0,
        tear_joy: 0,
        fire: 0,
        crying: 0,
      };
      const allReactions = await services.NowPlaying.getAllReactions(parent.id);
      if (allReactions) {
        allReactions.forEach((reaction) =>
          reaction ? reactions[reaction as INowPlayingReactionType]++ : null
        );
      }
      return reactions;
    },
    mine: (parent, args, { services }) => {
      return services.NowPlaying.getReactionByMe(parent.id);
    },
  },
  NowPlayingQueueItem: {
    async tracks({ trackId }) {
      return {
        originalId: trackId,
      };
    },
  },
};
