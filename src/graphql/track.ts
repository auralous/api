import { CONFIG } from "../lib/constant";
import { isDefined } from "../lib/utils";
import { URL } from "url";
import { IResolvers } from "../types/resolvers.gen";

export const typeDefs = `
  enum PlatformName {
    youtube
    spotify
  }

  type Query {
    track(id: ID!): Track
    crossTracks(id: ID!): CrossTracks
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

  type CrossTracks {
    id: ID!
    youtube: ID
    spotify: ID
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
    async track(parent, { id }, { services, setCacheControl }) {
      const track = await services.Track.findOrCreate(id);
      if (track) setCacheControl?.(CONFIG.trackMaxAge);
      return track;
    },
    async crossTracks(parent, { id }, { services, setCacheControl }) {
      setCacheControl?.(CONFIG.crossTrackMaxAge);
      return {
        id,
        ...(await services.Track.crossFindTracks(id)),
      };
    },
    async searchTrack(
      parent,
      { platform, query },
      { services, setCacheControl }
    ) {
      try {
        const trackOrTracks = await services.Track.findByUri(new URL(query));
        if (!trackOrTracks) return [];
        if (Array.isArray(trackOrTracks)) {
          setCacheControl?.(CONFIG.searchPlaylistMaxAge);
          return trackOrTracks;
        }
        setCacheControl?.(CONFIG.trackMaxAge);
        return [trackOrTracks];
      } catch (e) {
        // It is not a URL
        setCacheControl?.(CONFIG.searchMaxAge);
        return services.Track.search(platform, query);
      }
    },
  },
  Track: {
    artists({ artistIds }, args, { services }) {
      return Promise.all(
        artistIds.map((artistId) => services.Track.findOrCreateArtist(artistId))
      ).then((r) => r.filter(isDefined));
    },
  },
};
