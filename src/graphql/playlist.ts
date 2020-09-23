import { defaultAvatar } from "../lib/defaultAvatar";
import { IResolvers } from "../types/resolvers.gen";

export const typeDefs = `
  extend type Query {
    myPlaylists: [Playlist!]
  }

  extend type Mutation {
    createPlaylist(title: String!, platform: PlatformName!, tracks: [String!]): Playlist!
    insertPlaylistTracks(id: ID!, tracks: [String!]!): Playlist!
  }

  type Playlist {
    id: ID!
    title: String!
    image: String!
    tracks: [String!]!
    platform: PlatformName!
    externalId: String!
  }
`;

export const resolvers: IResolvers = {
  Query: {
    myPlaylists(parent, variables, { services }) {
      return services.Playlist.findByMine();
    },
  },
  Mutation: {
    async createPlaylist(parent, { title, platform, tracks }, { services }) {
      return services.Playlist.create({ title, platform, tracks });
    },
    async insertPlaylistTracks(parent, { id, tracks }, { services }) {
      return services.Playlist.insertTracks(id, tracks);
    },
  },
  Playlist: {
    id: ({ _id }) => _id,
    image({ image, _id }) {
      return image || defaultAvatar("playlist", _id);
    },
  },
};
