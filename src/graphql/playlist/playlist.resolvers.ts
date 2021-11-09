import { TrackService } from "../../services/track.js";
import { CONFIG } from "../../utils/constant.js";
import { PlatformName, Resolvers } from "../graphql.gen.js";

const resolvers: Resolvers = {
  Query: {
    playlist(parent, { id }, context) {
      return TrackService.findPlaylist(context, id);
    },
    myPlaylists(parent, args, context) {
      return TrackService.findMyPlaylist(context);
    },
    playlistTracks(parent, { id }, context) {
      return TrackService.findPlaylistTracks(context, id);
    },
    playlistsFriends() {
      return [];
    },
    playlistsSearch(parent, { query }, context) {
      const platform = context.auth?.provider || PlatformName.Youtube;
      context.setCacheControl?.(CONFIG.searchMaxAge);
      return TrackService.searchPlaylists(context, platform, query);
    },
  },
  Mutation: {
    playlistCreate(parent, { name, trackIds }, context) {
      return TrackService.createPlaylist(context, name, trackIds);
    },
    playlistAddTracks(parent, { id, trackIds }, context) {
      return TrackService.insertPlaylistTracks(context, id, trackIds);
    },
  },
};

export default resolvers;
