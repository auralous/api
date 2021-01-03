import { CONFIG } from "../../lib/constant";
import { isDefined } from "../../lib/utils";
import { PlatformName } from "../../types/index";

import type { Resolvers } from "../../types/index";

const resolvers: Resolvers = {
  Query: {
    async track(parent, { id }, { services, setCacheControl }) {
      const track = await services.Track.findOrCreate(id);
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
    createPlaylist(parent, { name, trackIds }, { services, user }) {
      return services.Track.createPlaylist(user, name, trackIds);
    },
    addPlaylistTracks(parent, { id, trackIds }, { services, user }) {
      return services.Track.insertPlaylistTracks(user, id, trackIds);
    },
  },
  Track: {
    artists({ artistIds }, args, { services, user }) {
      return Promise.all(
        artistIds.map((artistId) =>
          services.Track.findOrCreateArtist(artistId, user)
        )
      ).then((r) => r.filter(isDefined));
    },
  },
};

export default resolvers;
