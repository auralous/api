import fetch from "node-fetch";
import { isDefined } from "../../lib/utils";
import { PlatformName, AuthProviderName } from "../../types/index";

import type { UserService } from "../user";
import type { ServiceContext } from "../types";
import type {
  UserOauthProvider,
  TrackDbObject,
  ArtistDbObject,
} from "../../types/index";
/// <reference path="spotify-api" />

const BASE_URL = "https://api.spotify.com/v1";

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

function getATusingClientCredential(): string | Promise<string> {
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
  private auth: UserOauthProvider<AuthProviderName.Spotify> | null;
  constructor(context: ServiceContext, private userService: UserService) {
    this.auth = context.user?.oauth[AuthProviderName.Spotify] || null;
  }

  private async refreshAccessToken(): Promise<string | null> {
    if (!this.auth) return null;
    // token is not good, try refresh
    const refreshToken = this.auth?.refreshToken;
    // no refresh token, we're done for
    if (!refreshToken) return null;
    const refreshResponse = await fetch(
      "https://accounts.spotify.com/api/token",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          Authorization: AuthorizationHeader,
        },
        body: `grant_type=refresh_token&refresh_token=${refreshToken}`,
      }
    );
    if (refreshResponse.status !== 200)
      // Refresh token might have been expired
      return null;
    const json = await refreshResponse.json();
    // Update tokens
    await this.userService.updateMeOauth(AuthProviderName.Spotify, {
      id: this.auth.id,
      accessToken: json.access_token,
      expiredAt: new Date(Date.now() + json.expires_in * 1000),
    });
    return json.access_token;
  }

  async getAccessToken(): Promise<string | null> {
    if (!this.auth?.accessToken) return this.refreshAccessToken();
    if (this.auth.expiredAt) {
      if (this.auth.expiredAt > new Date()) return this.auth.accessToken;
      return this.refreshAccessToken();
    } else {
      // Use a private API to quick fetch token validity
      const tokenCheckRes = await fetch(
        // This seems like a private API but it allows quick fetch so we use it
        `${this.BASE_URL}/melody/v1/check_scope?scope=web-playback`,
        { headers: { Authorization: `Bearer ${this.auth.accessToken}` } }
      );
      if (tokenCheckRes.status === 200) return this.auth.accessToken;
      else return this.refreshAccessToken();
    }
  }

  // Lib
  async getTrack(externalId: string): Promise<TrackDbObject | null> {
    // We may offload some of the work using user's token
    const accessToken =
      (await this.getAccessToken()) || (await getATusingClientCredential());
    const json: SpotifyApi.TrackObjectFull | null = await fetch(
      `${BASE_URL}/tracks/${externalId}`,
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

  async getTracksByPlaylistId(playlistId: string): Promise<TrackDbObject[]> {
    const accessToken =
      (await this.getAccessToken()) || (await getATusingClientCredential());
    const tracks: TrackDbObject[] = [];
    let trackData: SpotifyApi.PlaylistTrackResponse | null = await fetch(
      `${BASE_URL}/playlists/${playlistId}/tracks`,
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

  async searchTracks(searchQuery: string): Promise<TrackDbObject[]> {
    // We may offload some of the work using user's token
    const accessToken =
      (await this.getAccessToken()) || (await getATusingClientCredential());
    const SEARCH_MAX_RESULTS = 30;
    const json: SpotifyApi.SearchResponse | null = await fetch(
      `${BASE_URL}/search?query=${encodeURIComponent(searchQuery)}` +
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

  async getArtist(externalId: string): Promise<ArtistDbObject | null> {
    // We may offload some of the work using user's token
    const accessToken =
      (await this.getAccessToken()) || (await getATusingClientCredential());
    const json: SpotifyApi.ArtistObjectFull | null = await fetch(
      `${BASE_URL}/artists/${externalId}`,
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
