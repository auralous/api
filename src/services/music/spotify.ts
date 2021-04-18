import fetch from "node-fetch";
import { isDefined } from "../../lib/utils";
import type {
  ArtistDbObject,
  Playlist,
  TrackDbObject,
} from "../../types/index";
import { PlatformName, UserDbObject } from "../../types/index";
import type { UserService } from "../user";

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
      Authorization: SpotifyAuthService.ClientAuthorizationHeader,
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

export class SpotifyService {
  private BASE_URL = "https://api.spotify.com/v1";

  static async checkToken(accessToken?: string): Promise<boolean> {
    if (!accessToken) return false;
    // Use a private API (but it's quick) to fetch token validity
    return fetch(
      `https://api.spotify.com/v1/melody/v1/check_scope?scope=web-playback`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    ).then(
      (res) => res.status === 200,
      () => false
    );
  }

  static async userTokenOrOurs(userAccessToken?: string) {
    return (
      ((await SpotifyService.checkToken(userAccessToken)) && userAccessToken) ||
      (await getTokenViaClientCredential())
    );
  }

  /**
   * Get Spotify track
   * @param externalId
   * @param userAccessToken optional user access token
   */
  async getTrack(
    externalId: string,
    userAccessToken?: string
  ): Promise<TrackDbObject | null> {
    // We may offload some of the work using user's token
    const accessToken = await SpotifyService.userTokenOrOurs(userAccessToken);

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
  async getPlaylist(
    externalId: string,
    userAccessToken?: string
  ): Promise<Playlist | null> {
    const accessToken = await SpotifyService.userTokenOrOurs(userAccessToken);

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
  async getMyPlaylists(me: UserDbObject): Promise<Playlist[]> {
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
  async insertPlaylistTracks(
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
  async createPlaylist(me: UserDbObject, name: string): Promise<Playlist> {
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
  async getPlaylistTracks(
    externalId: string,
    userAccessToken?: string
  ): Promise<TrackDbObject[]> {
    const accessToken = await SpotifyService.userTokenOrOurs(userAccessToken);

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
  async searchTracks(
    searchQuery: string,
    userAccessToken?: string
  ): Promise<TrackDbObject[]> {
    const accessToken = await SpotifyService.userTokenOrOurs(userAccessToken);

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
  async getArtist(
    externalId: string,
    userAccessToken?: string
  ): Promise<ArtistDbObject | null> {
    const accessToken = await SpotifyService.userTokenOrOurs(userAccessToken);

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
  async getFeaturedPlaylists(userAccessToken?: string): Promise<Playlist[]> {
    const data: SpotifyApi.ListOfFeaturedPlaylistsResponse | null = await fetch(
      `${this.BASE_URL}/browse/featured-playlists`,
      {
        headers: {
          Authorization: `Bearer ${await SpotifyService.userTokenOrOurs(
            userAccessToken
          )}`,
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

export class SpotifyAuthService {
  static ClientAuthorizationHeader =
    "Basic " +
    Buffer.from(
      `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
    ).toString("base64");

  static apiAuthCallback = `${process.env.API_URI}/auth/spotify/callback`;

  static getTokens(
    authCode: string
  ): Promise<{
    access_token: string;
    expires_in: number;
    refresh_token: string;
  }> {
    return fetch(`https://accounts.spotify.com/api/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: SpotifyAuthService.ClientAuthorizationHeader,
      },
      body: `grant_type=authorization_code&code=${authCode}&redirect_uri=${encodeURIComponent(
        SpotifyAuthService.apiAuthCallback
      )}`,
    }).then((res) => res.json());
  }

  static getUser(
    accessToken: string
  ): Promise<SpotifyApi.CurrentUsersProfileResponse> {
    return fetch(`https://api.spotify.com/v1/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((res) => res.json())
      .then((json) =>
        json.error ? Promise.reject(new Error(json.error.message)) : json
      );
  }

  async getAccessToken(
    me: UserDbObject,
    userService: UserService
  ): Promise<string | null> {
    if (me.oauth.provider !== PlatformName.Spotify) return null;
    if (await SpotifyService.checkToken(me.oauth.accessToken || undefined))
      return me.oauth.accessToken as string;
    return this.refreshAccessToken(me, userService);
  }

  private async refreshAccessToken(
    me: UserDbObject,
    userService: UserService
  ): Promise<string | null> {
    const refreshResponse = await fetch(
      "https://accounts.spotify.com/api/token",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          Authorization: SpotifyAuthService.ClientAuthorizationHeader,
        },
        body: `grant_type=refresh_token&refresh_token=${me.oauth.refreshToken}`,
      }
    );
    if (refreshResponse.status !== 200)
      // Refresh token might have been expired
      return null;
    const json = await refreshResponse.json();
    // Update tokens
    await userService.updateMeOauth(me, {
      refreshToken: json.refresh_token,
      accessToken: json.access_token,
      expiredAt: new Date(Date.now() + json.expires_in * 1000),
    });
    return json.access_token;
  }
}
