import fetch from "node-fetch";
import { isDefined } from "../../lib/utils";
import { PlatformName, UserDbObject } from "../../types/index";

import type { UserService } from "../user";
import type { TrackDbObject, ArtistDbObject } from "../../types/index";
/// <reference path="spotify-api" />

// For implicit auth
const cache: {
  accessToken?: string;
  expireAt?: Date;
} = {};

const AuthorizationHeader =
  "Basic " +
  Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString("base64");

function getTokenViaClientCredential(): string | Promise<string> {
  if (cache?.accessToken && cache?.expireAt && cache?.expireAt > new Date()) {
    return cache.accessToken;
  }
  return fetch(`https://accounts.spotify.com/api/token`, {
    method: "POST",
    headers: {
      Authorization: AuthorizationHeader,
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

  getTrackIdFromUri(uri: string): string | null {
    const regExp = /^https:\/\/open.spotify.com\/track\/([a-zA-Z0-9]+)/;
    const match = uri.match(regExp);
    if (!match) return null;
    return match?.[1] || null;
  }

  getPlaylistIdFromUri(uri: string): string | null {
    const regExp = /^https:\/\/open.spotify.com\/playlist\/([a-zA-Z0-9]+)/;
    const match = uri.match(regExp);
    if (!match) return null;
    return match?.[1] || null;
  }

  /**
   * get Sporify tracks by playlist id
   * @param playlistId
   * @param userAccessToken optional user access token
   */
  async getTracksByPlaylistId(
    playlistId: string,
    userAccessToken?: string
  ): Promise<TrackDbObject[]> {
    const accessToken = await SpotifyService.userTokenOrOurs(userAccessToken);

    const tracks: TrackDbObject[] = [];
    let trackData: SpotifyApi.PlaylistTrackResponse | null = await fetch(
      `${this.BASE_URL}/playlists/${playlistId}/tracks`,
      {
        headers: {
          Authorization: `Authorization: Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    ).then((response) => (response.ok ? response.json() : null));
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (!trackData) break;
      tracks.push(
        ...trackData.items
          .map((trackItem) =>
            !trackItem.is_local ? parseTrack(trackItem.track) : null
          )
          .filter(isDefined)
      );
      if (trackData.next)
        trackData = await fetch(trackData.next, {
          headers: {
            Authorization: `Authorization: Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }).then((response) => (response.ok ? response.json() : null));
      else break;
    }
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
          Authorization: `Authorization: Bearer ${accessToken}`,
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
}

export class SpotifyAuthService {
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
          Authorization: AuthorizationHeader,
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
