import { SpotifyAPI } from "../../data/spotify.js";
import { YoutubeAPI } from "../../data/youtube.js";
import { InvalidArgError } from "../../error/errors.js";
import { CONFIG } from "../../utils/constant.js";
import {
  PlatformName,
  RecommendationSection,
  Resolvers,
} from "../graphql.gen.js";

const resolvers: Resolvers = {
  Query: {
    async recommendationSection(parent, { id }, context) {
      let result: RecommendationSection | null = null;
      if (id.startsWith(PlatformName.Youtube)) {
        result = await YoutubeAPI.getRecommendationSection(
          await context.auth?.accessTokenPromise,
          id
        );
      } else if (id.startsWith(PlatformName.Spotify)) {
        result = await SpotifyAPI.getRecommendationSection(
          await context.auth?.accessTokenPromise,
          id
        );
      } else {
        throw new InvalidArgError("id", "Invalid recommendation id");
      }
      if (result) {
        context.setCacheControl?.(CONFIG.recommendationsMaxAge, "PUBLIC");
      }
      return result;
    },
    async recommendationSections(parent, args, context) {
      let result: RecommendationSection[] = [];
      if (context.auth?.provider === PlatformName.Spotify) {
        result = await SpotifyAPI.getRecommendationSections(
          await context.auth.accessTokenPromise
        );
      } else {
        result = await YoutubeAPI.getRecommendationSections(
          await context.auth?.accessTokenPromise
        );
      }
      if (result.length > 0) {
        //context.setCacheControl?.(CONFIG.recommendationsMaxAge, "PUBLIC");
      }
      return result;
    },
  },
  RecommendationSection: {
    async playlists(
      { id },
      { playlistLimit }: { playlistLimit?: number },
      context
    ) {
      try {
        if (id.startsWith(PlatformName.Youtube)) {
          return await YoutubeAPI.getRecommendationItems(
            await context.auth?.accessTokenPromise,
            id,
            playlistLimit || 10
          );
        } else if (id.startsWith(PlatformName.Spotify)) {
          return await SpotifyAPI.getRecommendationItems(
            await context.auth?.accessTokenPromise,
            id,
            playlistLimit || 10
          );
        }
      } catch (e) {
        return [];
      }
      throw new InvalidArgError("id", "Invalid recommendation id");
    },
  },
};

export default resolvers;
