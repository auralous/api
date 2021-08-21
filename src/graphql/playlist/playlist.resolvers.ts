import type { Resolvers } from "../graphql.gen.js";

const resolvers: Resolvers = {
  Query: {
    playlist(parent, { id }, { services, auth }) {
      return services.Track.findPlaylist(id, auth);
    },
    myPlaylists(parent, args, { services, auth }) {
      return services.Track.findMyPlaylist(auth);
    },
    playlistTracks(parent, { id }, { services, auth }) {
      return services.Track.findPlaylistTracks(id, auth);
    },
    playlistsFeatured(parent, { limit }, { services, auth }) {
      return services.Track.findFeaturedPlaylists(auth, limit || 10);
    },
    playlistsFriends() {
      return [];
    },
  },
  Mutation: {
    playlistCreate(parent, { name, trackIds }, { services, auth }) {
      return services.Track.createPlaylist(auth, name, trackIds);
    },
    playlistAddTracks(parent, { id, trackIds }, { services, auth }) {
      return services.Track.insertPlaylistTracks(auth, id, trackIds);
    },
  },
};

export default resolvers;
