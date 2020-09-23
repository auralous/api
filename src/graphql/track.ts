import { CONFIG } from "../lib/constant";
import { isDefined } from "../lib/utils";
import { TrackDbObject } from "../types/db";
import { IResolvers } from "../types/resolvers.gen";

export const typeDefs = `
  enum PlatformName {
    youtube
    spotify
  }

  extend type Query {
    track(id: ID, uri: String): Track
    searchTrack(platform: PlatformName!, query: String!): [Track!]!
  }

  type Track {
    id: ID!
    platform: PlatformName!
    externalId: ID!
    artists: [Artist!]!
    duration: Int!
    title: String!
    image: String!
    url: String!
  }

  type CrossTracksWrapper {
    originalId: ID!
    youtube: Track
    spotify: Track
  }

  type Artist {
    id: ID!
    platform: PlatformName!
    externalId: ID!
    name: String!
    image: String!
    url: String!
  }
`;

export const resolvers: IResolvers = {
  Query: {
    async track(parent, { uri, id }, { services, setCacheControl }) {
      let track: TrackDbObject | null = null;
      if (uri) track = await services.Track.findByUri(uri);
      else if (id) track = await services.Track.findOrCreate(id);
      if (track) setCacheControl?.(CONFIG.trackMaxAge);
      return track;
    },
    async searchTrack(
      parent,
      { platform, query },
      { services, setCacheControl }
    ) {
      const results = await services.Track.search({ platform, query });
      setCacheControl?.(CONFIG.searchMaxAge);
      return results;
    },
  },
  Track: {
    artists({ artistIds }, args, { services }) {
      return Promise.all(
        artistIds.map((artistId) => services.Track.findOrCreateArtist(artistId))
      ).then((r) => r.filter(isDefined));
    },
  },
  CrossTracksWrapper: {
    youtube({ originalId }, arsg, { services }) {
      return services.Track.findTrackFromAnotherPlatform(originalId, "youtube");
    },
    spotify({ originalId }, arsg, { services }) {
      return services.Track.findTrackFromAnotherPlatform(originalId, "spotify");
    },
  },
};
