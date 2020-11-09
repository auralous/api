import { URL } from "url";
import { CONFIG } from "../../lib/constant";
import { isDefined } from "../../lib/utils";

import type { Resolvers } from "../../types/index";

const resolvers: Resolvers = {
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

export default resolvers;
