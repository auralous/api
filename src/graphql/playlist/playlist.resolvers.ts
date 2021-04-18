import type { Resolvers } from "../../types/index";

const resolvers: Resolvers = {
  Query: {
    playlist(parent, { id }, { services, user }) {
      return services.Track.findPlaylist(id, user);
    },
    myPlaylists(parent, args, { services, user }) {
      return services.Track.findMyPlaylist(user);
    },
    playlistTracks(parent, { id }, { services, user }) {
      return services.Track.findPlaylistTracks(id, user);
    },
    playlistsFeatured(parent, args, { services, user }) {
      return services.Track.findFeaturedPlaylists(user);
    },
    playlistsFriends() {
      return [];
    },
  },
  Mutation: {
    playlistCreate(parent, { name, trackIds }, { services, user }) {
      return services.Track.createPlaylist(user, name, trackIds);
    },
    playlistAddTracks(parent, { id, trackIds }, { services, user }) {
      return services.Track.insertPlaylistTracks(user, id, trackIds);
    },
  },
};

export default resolvers;
