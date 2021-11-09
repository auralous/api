import { TrackService } from "../../services/track.js";
import { CONFIG } from "../../utils/constant.js";
import { isDefined } from "../../utils/utils.js";
import { PlatformName, Resolvers } from "../graphql.gen.js";

const resolvers: Resolvers = {
  Query: {
    async track(parent, { id }, context) {
      const track = await TrackService.findTrack(context, id);
      if (track) context.setCacheControl?.(CONFIG.trackMaxAge);
      return track;
    },
    async tracks(parent, { ids }, context) {
      return TrackService.findTracks(context, ids);
    },
    playlist(parent, { id }, context) {
      return TrackService.findPlaylist(context, id);
    },
    myPlaylists(parent, args, context) {
      return TrackService.findMyPlaylist(context);
    },
    playlistTracks(parent, { id }, context) {
      return TrackService.findPlaylistTracks(context, id);
    },
    async crossTracks(parent, { id }, context) {
      context.setCacheControl?.(CONFIG.crossTrackMaxAge);
      return {
        id,
        ...(await TrackService.crossFindTracks(context, id)),
      };
    },
    async searchTrack(parent, { query }, context) {
      const platform = context.auth?.provider || PlatformName.Youtube;
      context.setCacheControl?.(CONFIG.searchMaxAge);
      return TrackService.searchTracks(context, platform, query);
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
  Track: {
    artists({ artistIds }, args, context) {
      return Promise.all(
        artistIds.map((artistId) => TrackService.findArtist(context, artistId))
      ).then((r) => r.filter(isDefined));
    },
  },
};

export default resolvers;
