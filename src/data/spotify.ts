import un from "undecim";
import { SpotifyAuth, SpotifyTokenResponse } from "../auth/spotify.js";
import { PlatformName, Playlist } from "../graphql/graphql.gen.js";
import { isDefined } from "../utils/utils.js";
import type { ArtistDbObject, TrackDbObject, UserDbObject } from "./types.js";

/// <reference path="spotify-api" />

// For implicit auth
const cache: {
  accessToken?: string;
  expireAt?: Date;
} = {};

function getTokenViaClientCredential(): string | Promise<string> {
  if (cache?.accessToken && cache?.expireAt && cache?.expireAt > new Date()) {
    return cache.accessToken;
  }
  return un
    .post(SpotifyAuth.tokenEndpoint, {
      body: "grant_type=client_credentials",
      headers: {
        Authorization: SpotifyAuth.ClientAuthorizationHeader,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    })
    .json<SpotifyTokenResponse>()
    .then((data) => {
      if (!("access_token" in data))
        throw new Error("Cannot get Spotify Token via Implicit");
      cache.accessToken = data.access_token;
      cache.expireAt = new Date(Date.now() + data.expires_in * 1000);
      return data.access_token;
    });
}

function parseTrack(result: SpotifyApi.TrackObjectFull): TrackDbObject {
  return {
    id: `spotify:${result.id}`,
    platform: PlatformName.Spotify,
    externalId: result.id,
    duration: result.duration_ms,
    title: result.name,
    image: result.album?.images?.[0]?.url || "",
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
    image: result.images?.[0]?.url || "",
    url: result.external_urls.spotify,
  };
}

function parsePlaylist(
  result: SpotifyApi.PlaylistObjectFull | SpotifyApi.PlaylistObjectSimplified
): Playlist {
  return {
    id: `spotify:${result.id}`,
    externalId: result.id,
    image: result.images[0]?.url || "",
    name: result.name,
    platform: PlatformName.Spotify,
    url: result.external_urls.spotify,
  };
}

/**
 * Either use the provided access token are one from implicit client auth
 */
async function userTokenOrOurs(userAccessToken?: string) {
  return (
    ((await SpotifyAuth.checkToken(userAccessToken)) && userAccessToken) ||
    (await getTokenViaClientCredential())
  );
}

export class SpotifyAPI {
  static client = un.create({ prefixURL: "https://api.spotify.com" });

  /**
   * Get Spotify track
   * @param externalId
   * @param userAccessToken optional user access token
   */
  static async getTrack(
    externalId: string,
    userAccessToken?: string
  ): Promise<TrackDbObject | null> {
    // We may offload some of the work using user's token
    const accessToken = await userTokenOrOurs(userAccessToken);
    const data = await SpotifyAPI.client
      .get(`/v1/tracks/${externalId}`, {
        headers: {
          Authorization: `Authorization: Bearer ${accessToken}`,
        },
      })
      .json<SpotifyApi.TrackObjectFull>();
    return parseTrack(data);
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
    const accessToken = await userTokenOrOurs(userAccessToken);
    const data = await SpotifyAPI.client
      .get(`/v1/playlists/${externalId}?fields=id,external_urls,images,name`, {
        headers: {
          Authorization: `Authorization: Bearer ${accessToken}`,
        },
      })
      .json<SpotifyApi.PlaylistObjectFull>();

    return parsePlaylist(data);
  }

  /**
   * Get current user's Spotify playlists
   * @param me
   */
  static async getMyPlaylists(me: UserDbObject): Promise<Playlist[]> {
    const accessToken = me.oauth.accessToken;

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
   * @param me
   * @param externalId
   * @param externalTrackIds
   */
  static async insertPlaylistTracks(
    me: UserDbObject,
    externalId: string,
    externalTrackIds: string[]
  ): Promise<boolean> {
    const accessToken = me.oauth.accessToken;

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
   * @param me
   * @param name
   * @param externalTrackIds
   */
  static async createPlaylist(
    me: UserDbObject,
    name: string
  ): Promise<Playlist> {
    const accessToken = me.oauth.accessToken;

    return SpotifyAPI.client
      .post(`/v1/users/${me.oauth.id}/playlists`, {
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
    const accessToken = await userTokenOrOurs(userAccessToken);

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
            .map((trackItem) =>
              !trackItem.is_local ? parseTrack(trackItem.track) : null
            )
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
    const accessToken = await userTokenOrOurs(userAccessToken);

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
   * Get Spotify artist
   * @param externalId
   * @param userAccessToken optional user access token
   */
  static async getArtist(
    externalId: string,
    userAccessToken?: string
  ): Promise<ArtistDbObject | null> {
    const accessToken = await userTokenOrOurs(userAccessToken);

    const data = await this.client
      .get(`/v1/artists/${externalId}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
      .json<SpotifyApi.ArtistObjectFull | null>()
      .catch(() => null);

    if (!data) return null;
    return parseArtist(data);
  }

  /**
   * Get Featured Playlists using Spotify API
   */
  static async getFeaturedPlaylists(
    userAccessToken?: string
  ): Promise<Playlist[]> {
    const data = await SpotifyAPI.client
      .get(`/v1/browse/featured-playlists`, {
        headers: {
          Authorization: `Bearer ${await userTokenOrOurs(userAccessToken)}`,
        },
      })
      .json<SpotifyApi.ListOfFeaturedPlaylistsResponse>();

    return data.playlists.items.map(parsePlaylist);
  }
}
