import { CONFIG } from "../../utils/constant.js";
import { isDefined } from "../../utils/utils.js";
import { PlatformName, Resolvers } from "../graphql.gen.js";

const resolvers: Resolvers = {
  Query: {
    async track(parent, { id }, { services, setCacheControl }) {
      const track = await services.Track.findTrack(id);
      if (track) setCacheControl?.(CONFIG.trackMaxAge);
      return track;
    },
    async tracks(parent, { ids }, { services }) {
      return services.Track.findTracks(ids);
    },
    playlist(parent, { id }, { services, auth }) {
      return services.Track.findPlaylist(id, auth);
    },
    myPlaylists(parent, args, { services, auth }) {
      return services.Track.findMyPlaylist(auth);
    },
    playlistTracks(parent, { id }, { services, auth }) {
      return services.Track.findPlaylistTracks(id, auth);
    },
    async crossTracks(parent, { id }, { services, setCacheControl }) {
      setCacheControl?.(CONFIG.crossTrackMaxAge);
      return {
        id,
        ...(await services.Track.crossFindTracks(id)),
      };
    },
    async searchTrack(parent, { query }, { services, setCacheControl, auth }) {
      const platform = auth?.provider || PlatformName.Youtube;
      setCacheControl?.(CONFIG.searchMaxAge);
      return services.Track.search(platform, query, auth);
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
  Track: {
    artists({ artistIds }, args, { services }) {
      return Promise.all(
        artistIds.map((artistId) => services.Track.findArtist(artistId))
      ).then((r) => r.filter(isDefined));
    },
  },
};

export default resolvers;
