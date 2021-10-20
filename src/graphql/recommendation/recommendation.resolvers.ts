import { SpotifyAPI } from "../../data/spotify.js";
import { YoutubeAPI } from "../../data/youtube.js";
import { InvalidArgError } from "../../error/errors.js";
import { PlatformName, Resolvers } from "../graphql.gen.js";

const resolvers: Resolvers = {
  Query: {
    async recommendationSection(parent, { id }, context) {
      if (id.startsWith(PlatformName.Youtube)) {
        return YoutubeAPI.getRecommendationSection(
          await context.auth?.accessTokenPromise,
          id
        );
      } else if (id.startsWith(PlatformName.Spotify)) {
        return SpotifyAPI.getRecommendationSection(
          await context.auth?.accessTokenPromise,
          id
        );
      }
      throw new InvalidArgError("id", "Invalid recommendation id");
    },
    async recommendationSections(parent, args, context) {
      if (!context.auth || context.auth.provider === PlatformName.Youtube) {
        return SpotifyAPI.getRecommendationSections(
          await context.auth?.accessTokenPromise
        );
      }
      return SpotifyAPI.getRecommendationSections(
        await context.auth.accessTokenPromise
      );
    },
    async recommendationContent(parent, { id, limit }, context) {
      if (id.startsWith(PlatformName.Youtube)) {
        return YoutubeAPI.getRecommendationItems(
          await context.auth?.accessTokenPromise,
          id,
          limit
        );
      } else if (id.startsWith(PlatformName.Spotify)) {
        return SpotifyAPI.getRecommendationItems(
          await context.auth?.accessTokenPromise,
          id,
          limit
        );
      }
      throw new InvalidArgError("id", "Invalid recommendation id");
    },
  },
};

export default resolvers;
