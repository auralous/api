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
    playlist(parent, { id }, { services, user }) {
      return services.Track.findPlaylist(id, user);
    },
    myPlaylists(parent, args, { services, user }) {
      return services.Track.findMyPlaylist(user);
    },
    playlistTracks(parent, { id }, { services, user }) {
      return services.Track.findPlaylistTracks(id, user);
    },
    async crossTracks(parent, { id }, { services, setCacheControl }) {
      setCacheControl?.(CONFIG.crossTrackMaxAge);
      return {
        id,
        ...(await services.Track.crossFindTracks(id)),
      };
    },
    async searchTrack(parent, { query }, { services, setCacheControl, user }) {
      const platform = user?.oauth.provider || PlatformName.Youtube;
      setCacheControl?.(CONFIG.searchMaxAge);
      return services.Track.search(platform, query, user);
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
  Track: {
    artists({ artistIds }, args, { services, user }) {
      return Promise.all(
        artistIds.map((artistId) => services.Track.findArtist(artistId, user))
      ).then((r) => r.filter(isDefined));
    },
  },
};

export default resolvers;
