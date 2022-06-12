import pino from "pino";
import { exit } from "process";
import un, { create, UndecimError } from "undecim";
import { URL, URLSearchParams } from "url";
import { SpotifyAuth, SpotifyTokenResponse } from "../auth/spotify.js";
import { InvalidArgError } from "../error/errors.js";
import { rethrowSpotifyError } from "../error/spotify.js";
import { augmentUndecimError } from "../error/utils.js";
import {
  PlatformName,
  Playlist,
  RecommendationSection,
} from "../graphql/graphql.gen.js";
import { pinoOpts } from "../logger/options.js";
import { isURL } from "../utils/url.js";
import { isDefined } from "../utils/utils.js";
import type { ArtistDbObject, TrackDbObject } from "./types.js";
import { getFromIdsPerEveryNum } from "./utils.js";

/// <reference path="spotify-api" />

const logger = pino({ ...pinoOpts, name: "data/spotify" });

/**
 * Implicit Auth is the token generated
 * using client id and client secret
 * that is only used if user access token
 * is unavailable
 */
class SpotifyClientCredentials {
  static accessToken: string;
  private static retryAttempt = 0;
  static async refresh() {
    try {
      logger.debug("SpotifyClientCredentials/refresh: doing");
      const data = await un
        .post(SpotifyAuth.tokenEndpoint, {
          data: new URLSearchParams({ grant_type: "client_credentials" }),
          headers: {
            Authorization: SpotifyAuth.ClientAuthorizationHeader,
          },
        })
        .json<SpotifyTokenResponse>();
      logger.debug(data, "SpotifyClientCredentials/refresh: done");
      SpotifyClientCredentials.accessToken = data.access_token;
      setTimeout(
        SpotifyClientCredentials.refresh,
        data.expires_in * 1000 - 60 * 1000
      );
    } catch (error) {
      const err =
        error instanceof UndecimError
          ? await augmentUndecimError(error)
          : (error as Error);
      SpotifyClientCredentials.retryAttempt += 1;
      if (SpotifyClientCredentials.retryAttempt > 6) {
        logger.error(
          err,
          `SpotifyClientCredentials/refresh: failed: too many attempts.`
        );
        return exit(1);
      }
      const retryIn = Math.pow(2, SpotifyClientCredentials.retryAttempt) * 100;
      logger.error(
        err,
        `SpotifyClientCredentials/refresh: failed -> retrying in ${retryIn}...`
      );
      // Retry
      setTimeout(SpotifyClientCredentials.refresh, retryIn);
    }
  }
}

await SpotifyClientCredentials.refresh();

function parseTrack(result: SpotifyApi.TrackObjectFull): TrackDbObject {
  return {
    id: `spotify:${result.id}`,
    platform: PlatformName.Spotify,
    externalId: result.id,
    duration: result.duration_ms,
    title: result.name,
    image: result.album?.images?.[0]?.url,
    artistIds:
      result.artists.map(({ id }: { id: string }) => `spotify:${id}`) || [],
    albumId: result.album.id,
    url: result.external_urls.spotify,
  };
}

function parseArtist(result: SpotifyApi.ArtistObjectFull): ArtistDbObject {
  return {
    id: `spotify:${result.id}`,
    platform: PlatformName.Spotify,
    externalId: result.id,
    name: result.name,
    image: result.images?.[0]?.url,
    url: result.external_urls.spotify,
  };
}

function parsePlaylist(
  result: SpotifyApi.PlaylistObjectFull | SpotifyApi.PlaylistObjectSimplified
): Playlist {
  return {
    id: `spotify:${result.id}`,
    externalId: result.id,
    image: result.images[0]?.url,
    name: result.name,
    platform: PlatformName.Spotify,
    url: result.external_urls.spotify,
    total: result?.tracks?.total || 0,
    creatorName: result.owner.display_name || result.owner.id,
    creatorImage: result.owner.images?.[0].url,
  };
}

export class SpotifyAPI {
  static client = create({ origin: "https://api.spotify.com" });

  /**
   * Get Spotify tracks
   * @param externalIds
   * @param userAccessToken optional user access token
   */
  static async getTracks(
    externalIds: string[],
    userAccessToken?: string
  ): Promise<(TrackDbObject | null)[]> {
    // We may offload some of the work using user's token
    const accessToken = userAccessToken || SpotifyClientCredentials.accessToken;
    return getFromIdsPerEveryNum<TrackDbObject | null>(
      externalIds,
      50,
      async (ids) => {
        const data = await SpotifyAPI.client
          .get(`/v1/tracks/?ids=${ids.join(",")}`, {
            headers: {
              Authorization: `Authorization: Bearer ${accessToken}`,
            },
          })
          .json<SpotifyApi.MultipleTracksResponse>()
          .catch(rethrowSpotifyError);
        return data.tracks.map((val) => (val ? parseTrack(val) : null));
      }
    );
  }

  /**
   * Get Spotify playlist
   * @param externalId
   * @param userAccessToken
   */
  static async getPlaylist(
    externalId: string,
    userAccessToken?: string
  ): Promise<Playlist | null> {
    const accessToken = userAccessToken || SpotifyClientCredentials.accessToken;
    const data = await SpotifyAPI.client
      .get(
        `/v1/playlists/${externalId}?fields=id,external_urls,images,name,tracks(total),owner`,
        {
          headers: {
            Authorization: `Authorization: Bearer ${accessToken}`,
          },
        }
      )
      .json<SpotifyApi.PlaylistObjectFull>()
      .catch(rethrowSpotifyError);

    return parsePlaylist(data);
  }

  /**
   * Get current user's Spotify playlists
   * @param accessToken
   */
  static async getMyPlaylists(accessToken: string): Promise<Playlist[]> {
    let data: SpotifyApi.ListOfCurrentUsersPlaylistsResponse | undefined;

    const playlists: Playlist[] = [];

    do {
      data = await SpotifyAPI.client
        .get(data?.next || `/v1/me/playlists`, {
          headers: {
            Authorization: `Authorization: Bearer ${accessToken}`,
          },
        })
        .json<SpotifyApi.ListOfCurrentUsersPlaylistsResponse>()
        .catch(rethrowSpotifyError);
      if (!data) break;
      playlists.push(...data.items.map(parsePlaylist));
    } while (data?.next);

    return playlists;
  }

  /**
   * Insert tracks to Spotify playlist
   * @param accessToken
   * @param externalId
   * @param externalTrackIds
   */
  static async insertPlaylistTracks(
    accessToken: string,
    externalId: string,
    externalTrackIds: string[]
  ): Promise<boolean> {
    return SpotifyAPI.client
      .post(`/v1/playlists/${externalId}/tracks`, {
        data: {
          uris: externalTrackIds.map(
            (externalTrackId) => `spotify:track:${externalTrackId}`
          ),
        },
        headers: {
          Authorization: `Authorization: Bearer ${accessToken}`,
        },
      })
      .then(() => true, rethrowSpotifyError);
  }

  /**
   * Create Spotify playlist
   * @param accessToken
   * @param name
   * @param externalTrackIds
   */
  static async createPlaylist(
    accessToken: string,
    name: string
  ): Promise<Playlist> {
    const spotifyUserResponse = await SpotifyAuth.getUser(accessToken);

    return SpotifyAPI.client
      .post(`/v1/users/${spotifyUserResponse.id}/playlists`, {
        data: { name },
        headers: {
          Authorization: `Authorization: Bearer ${accessToken}`,
        },
      })
      .json<SpotifyApi.CreatePlaylistResponse>()
      .then(parsePlaylist, rethrowSpotifyError);
  }

  /**
   * get Sporify tracks by playlist id
   * @param playlistId
   * @param userAccessToken optional user access token
   */
  static async getPlaylistTracks(
    externalId: string,
    userAccessToken?: string
  ): Promise<TrackDbObject[]> {
    const accessToken = userAccessToken || SpotifyClientCredentials.accessToken;

    const tracks: TrackDbObject[] = [];

    let trackData: SpotifyApi.PlaylistTrackResponse | undefined;

    do {
      trackData = await SpotifyAPI.client
        .get(trackData?.next || `/v1/playlists/${externalId}/tracks`, {
          headers: {
            Authorization: `Authorization: Bearer ${accessToken}`,
          },
        })
        .json<SpotifyApi.PlaylistTrackResponse>()
        .catch(rethrowSpotifyError);

      if (trackData?.items) {
        tracks.push(
          ...trackData.items
            .map((trackItem) => {
              // Sometimes track is null
              return trackItem.track && !trackItem.is_local
                ? parseTrack(trackItem.track)
                : null;
            })
            .filter(isDefined)
        );
      }
    } while (trackData?.next);

    return tracks;
  }

  /**
   * search Spotify tracks
   * @param searchQuery
   * @param userAccessToken optional user access token
   */
  static async searchTracks(
    searchQuery: string,
    userAccessToken?: string
  ): Promise<TrackDbObject[]> {
    const accessToken = userAccessToken || SpotifyClientCredentials.accessToken;

    // Check if it is URL
    // Check if it is URL
    if (isURL(searchQuery)) {
      const url = new URL(searchQuery);
      url.pathname.startsWith("/track");
      const id = url.pathname.substring(7);
      return SpotifyAPI.getTracks([id]).then((tracks) =>
        tracks.filter(isDefined)
      );
    }

    const SEARCH_MAX_RESULTS = 30;

    const data = await SpotifyAPI.client
      .get(
        `/v1/search?query=${encodeURIComponent(searchQuery)}` +
          `&type=track&offset=0&limit=${SEARCH_MAX_RESULTS}`,
        {
          headers: {
            Authorization: `Authorization: Bearer ${accessToken}`,
          },
        }
      )
      .json<SpotifyApi.TrackSearchResponse>()
      .catch(rethrowSpotifyError);

    return data.tracks.items.map(parseTrack);
  }

  static async searchPlaylists(
    searchQuery: string,
    userAccessToken?: string
  ): Promise<Playlist[]> {
    const accessToken = userAccessToken || SpotifyClientCredentials.accessToken;

    // Check if it is URL
    if (isURL(searchQuery)) {
      const url = new URL(searchQuery);
      url.pathname.startsWith("/playlist");
      const id = url.pathname.substring(10);
      return SpotifyAPI.getPlaylist(id).then((playlist) =>
        playlist ? [playlist] : []
      );
    }

    const SEARCH_MAX_RESULTS = 30;

    const data = await SpotifyAPI.client
      .get(
        `/v1/search?query=${encodeURIComponent(searchQuery)}` +
          `&type=playlist&offset=0&limit=${SEARCH_MAX_RESULTS}`,
        {
          headers: {
            Authorization: `Authorization: Bearer ${accessToken}`,
          },
        }
      )
      .json<SpotifyApi.PlaylistSearchResponse>()
      .catch(rethrowSpotifyError);

    return data.playlists.items.map(parsePlaylist);
  }

  /**
   * Get Spotify artists
   * @param externalIds
   * @param userAccessToken optional user access token
   */
  static async getArtists(
    externalIds: string[],
    userAccessToken?: string
  ): Promise<(ArtistDbObject | null)[]> {
    const accessToken = userAccessToken || SpotifyClientCredentials.accessToken;
    return getFromIdsPerEveryNum<ArtistDbObject | null>(
      externalIds,
      50,
      async (ids) => {
        const data = await this.client
          .get(`/v1/artists?ids=${ids.join(",")}`, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          })
          .json<SpotifyApi.MultipleArtistsResponse>()
          .catch(rethrowSpotifyError);
        return data.artists.map((val) => (val ? parseArtist(val) : null));
      }
    );
  }

  /**
   * Get recommendations
   */
  static async getRecommendationSections(
    accessToken?: string | null
  ): Promise<RecommendationSection[]> {
    if (!accessToken) accessToken = SpotifyClientCredentials.accessToken;

    const [dataFeatured, dataCategories] = await Promise.all([
      SpotifyAPI.client
        .get(`/v1/browse/featured-playlists?limit=10`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        })
        .json<SpotifyApi.ListOfFeaturedPlaylistsResponse>()
        .catch(rethrowSpotifyError),
      SpotifyAPI.client
        .get(`/v1/browse/categories`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        })
        .json<SpotifyApi.MultipleCategoriesResponse>()
        .catch(rethrowSpotifyError),
    ]);

    return [
      {
        id: `spotify_featured-playlists`,
        title: dataFeatured.message || "Featured playlists",
        playlists: [],
      },
      ...dataCategories.categories.items.map((category) => ({
        id: `spotify_category_${category.id}`,
        title: category.name,
        playlists: [],
      })),
    ];
  }

  static async getRecommendationSection(
    accessToken: string | null | undefined,
    id: string
  ): Promise<RecommendationSection | null> {
    if (!accessToken) accessToken = SpotifyClientCredentials.accessToken;

    if (id === "spotify_featured-playlists") {
      const data = await SpotifyAPI.client
        .get(`/v1/browse/featured-playlists?limit=1`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        })
        .json<SpotifyApi.ListOfFeaturedPlaylistsResponse>()
        .catch(rethrowSpotifyError);
      return {
        id,
        title: data.message || "Featured playlists",
        playlists: [],
      };
    } else if (id.startsWith("spotify_category_")) {
      const categoryId = id.substring(17);
      const data = await SpotifyAPI.client
        .get(`/v1/browse/categories/${categoryId}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        })
        .json<SpotifyApi.SingleCategoryResponse>()
        .catch(rethrowSpotifyError);
      return {
        id,
        title: data.name,
        playlists: [],
      };
    }
    throw new InvalidArgError("id", "Invalid recommendation id");
  }

  static async getRecommendationItems(
    accessToken: string | null | undefined,
    id: string,
    limit: number
  ): Promise<Playlist[]> {
    limit = Math.min(limit, 50);
    if (!accessToken) accessToken = SpotifyClientCredentials.accessToken;
    if (id === "spotify_featured-playlists") {
      const data = await SpotifyAPI.client
        .get(`/v1/browse/featured-playlists?limit=${limit}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        })
        .json<SpotifyApi.ListOfFeaturedPlaylistsResponse>()
        .catch(rethrowSpotifyError);
      return data.playlists.items.map(parsePlaylist);
    } else if (id.startsWith("spotify_category_")) {
      const categoryId = id.substring(17);
      const data = await SpotifyAPI.client
        .get(`/v1/browse/categories/${categoryId}/playlists?limit=${limit}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        })
        .json<SpotifyApi.CategoryPlaylistsResponse>()
        .catch(rethrowSpotifyError);
      return data.playlists.items.map(parsePlaylist);
    }
    throw new InvalidArgError("id", "Invalid recommendation id");
  }
}
