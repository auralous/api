import fetch from "node-fetch";
import { SpotifyAuth } from "../auth/spotify";
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
  return fetch(`https://accounts.spotify.com/api/token`, {
    method: "POST",
    headers: {
      Authorization: SpotifyAuth.ClientAuthorizationHeader,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  })
    .then((response) => (response.ok ? response.json() : null))
    .then((json) => {
      if (!json?.access_token)
        throw new Error("Cannot get Spotify Token via Implicit");
      cache.accessToken = json.access_token;
      cache.expireAt = new Date(
        Date.now() + parseInt(json.expires_in, 10) * 1000
      );
      return json.access_token as string;
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
  static BASE_URL = "https://api.spotify.com/v1";

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

    const json: SpotifyApi.TrackObjectFull | null = await fetch(
      `${this.BASE_URL}/tracks/${externalId}`,
      {
        headers: {
          Authorization: `Authorization: Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    )
      // TODO: May want to handle error
      .then((response) => (response.ok ? response.json() : null));
    if (!json) return null;
    return parseTrack(json);
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

    const json: SpotifyApi.PlaylistObjectFull | null = await fetch(
      `${this.BASE_URL}/playlists/${externalId}?fields=id,external_urls,images,name`,
      {
        headers: {
          Authorization: `Authorization: Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    ).then((response) => (response.ok ? response.json() : null));

    if (!json) return null;

    return parsePlaylist(json);
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
      data = await fetch(data?.next || `${this.BASE_URL}/me/playlists`, {
        headers: {
          Authorization: `Authorization: Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }).then((response) => (response.ok ? response.json() : undefined));
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

    return fetch(`${this.BASE_URL}/playlists/${externalId}/tracks`, {
      method: "POST",
      headers: {
        Authorization: `Authorization: Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        uris: externalTrackIds.map(
          (externalTrackId) => `spotify:track:${externalTrackId}`
        ),
      }),
    }).then((res) => res.ok);
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

    const data: SpotifyApi.CreatePlaylistResponse = await fetch(
      `${this.BASE_URL}/users/${me.oauth.id}/playlists`,
      {
        method: "POST",
        headers: {
          Authorization: `Authorization: Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name }),
      }
    ).then((res) => (res.ok ? res.json() : null));

    if (!data) throw new Error("Could not create Spotify playlist");

    return parsePlaylist(data);
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
      trackData = await fetch(
        trackData?.next || `${this.BASE_URL}/playlists/${externalId}/tracks`,
        {
          headers: {
            Authorization: `Authorization: Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }
      ).then((response) => (response.ok ? response.json() : undefined));

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
    const json: SpotifyApi.SearchResponse | null = await fetch(
      `${this.BASE_URL}/search?query=${encodeURIComponent(searchQuery)}` +
        `&type=track&offset=0&limit=${SEARCH_MAX_RESULTS}`,
      {
        headers: {
          Authorization: `Authorization: Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    ).then((response) => (response.ok ? response.json() : null));
    return json?.tracks?.items.map(parseTrack) || [];
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

    const json: SpotifyApi.ArtistObjectFull | null = await fetch(
      `${this.BASE_URL}/artists/${externalId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    )
      // TODO: May want to handle error
      .then((response) => (response.ok ? response.json() : null));
    if (!json) return null;
    return {
      id: `spotify:${externalId}`,
      platform: PlatformName.Spotify,
      externalId,
      name: json.name,
      image: json.images?.[0]?.url || "",
      url: json.external_urls.spotify,
    };
  }

  /**
   * Get Featured Playlists using Spotify API
   */
  static async getFeaturedPlaylists(
    userAccessToken?: string
  ): Promise<Playlist[]> {
    const data: SpotifyApi.ListOfFeaturedPlaylistsResponse | null = await fetch(
      `${this.BASE_URL}/browse/featured-playlists`,
      {
        headers: {
          Authorization: `Bearer ${await userTokenOrOurs(userAccessToken)}`,
          "Content-Type": "application/json",
        },
      }
    ).then((response) => (response.ok ? response.json() : null));
    return (
      data?.playlists.items.map((playlist) => ({
        id: `spotify:${playlist.id}`,
        externalId: playlist.id,
        image: playlist.images[0]?.url,
        name: playlist.name,
        platform: PlatformName.Spotify,
        url: playlist.external_urls.spotify,
      })) || []
    );
  }
}
