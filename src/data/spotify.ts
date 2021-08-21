import un from "undecim";
import { URLSearchParams } from "url";
import { SpotifyAuth, SpotifyTokenResponse } from "../auth/spotify.js";
import { PlatformName, Playlist } from "../graphql/graphql.gen.js";
import { isDefined } from "../utils/utils.js";
import type { ArtistDbObject, TrackDbObject } from "./types.js";
import { getFromIdsPerEveryNum } from "./utils.js";

/// <reference path="spotify-api" />

// For implicit aut
let clientAccessToken: string | null = null;

/**
 * Implicit Auth is the token generated
 * using client id and client secret
 * that is only used if user access token
 * is unavailable
 */
const updateImplicitAccessToken = async () => {
  const data = await un
    .post(SpotifyAuth.tokenEndpoint, {
      data: new URLSearchParams({ grant_type: "client_credentials" }),
      headers: {
        Authorization: SpotifyAuth.ClientAuthorizationHeader,
      },
    })
    .json<SpotifyTokenResponse>();
  if (data.access_token) {
    clientAccessToken = data.access_token;
    setTimeout(updateImplicitAccessToken, data.expires_in * 1000 - 60 * 1000);
  } else {
    // Retry
    clientAccessToken = null;
    updateImplicitAccessToken();
  }
};

await updateImplicitAccessToken();

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
  static client = un.create({ prefixURL: "https://api.spotify.com" });

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
    const accessToken = userAccessToken || clientAccessToken;
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
          .json<SpotifyApi.MultipleTracksResponse>();
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
    const accessToken = userAccessToken || clientAccessToken;
    const data = await SpotifyAPI.client
      .get(
        `/v1/playlists/${externalId}?fields=id,external_urls,images,name,tracks(total),owner`,
        {
          headers: {
            Authorization: `Authorization: Bearer ${accessToken}`,
          },
        }
      )
      .json<SpotifyApi.PlaylistObjectFull>();

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
        .json<SpotifyApi.ListOfCurrentUsersPlaylistsResponse>();
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
      .then(
        () => true,
        () =>
          Promise.reject(new Error("Could not add Spotify tracks to playlist"))
      );
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

    if (!spotifyUserResponse?.id) throw new Error("Cannot get Spotify user");

    return SpotifyAPI.client
      .post(`/v1/users/${spotifyUserResponse.id}/playlists`, {
        data: { name },
        headers: {
          Authorization: `Authorization: Bearer ${accessToken}`,
        },
      })
      .json<SpotifyApi.CreatePlaylistResponse>()
      .then(parsePlaylist, () =>
        Promise.reject("Could not create Spotify playlist")
      );
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
    const accessToken = userAccessToken || clientAccessToken;

    const tracks: TrackDbObject[] = [];

    let trackData: SpotifyApi.PlaylistTrackResponse | undefined;

    do {
      trackData = await SpotifyAPI.client
        .get(trackData?.next || `/v1/playlists/${externalId}/tracks`, {
          headers: {
            Authorization: `Authorization: Bearer ${accessToken}`,
          },
        })
        .json<SpotifyApi.PlaylistTrackResponse>();

      if (trackData?.items)
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
    const accessToken = userAccessToken || clientAccessToken;

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
      .json<SpotifyApi.TrackSearchResponse>();

    return data.tracks.items.map(parseTrack);
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
    const accessToken = userAccessToken || clientAccessToken;
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
          .json<SpotifyApi.MultipleArtistsResponse>();
        return data.artists.map((val) => (val ? parseArtist(val) : null));
      }
    );
  }

  /**
   * Get Featured Playlists using Spotify API
   */
  static async getFeaturedPlaylists(
    limit: number,
    userAccessToken?: string
  ): Promise<Playlist[]> {
    const data = await SpotifyAPI.client
      .get(`/v1/browse/featured-playlists?limit=${limit}`, {
        headers: {
          Authorization: `Bearer ${userAccessToken || clientAccessToken}`,
        },
      })
      .json<SpotifyApi.ListOfFeaturedPlaylistsResponse>();

    return data.playlists.items.map(parsePlaylist);
  }
}
