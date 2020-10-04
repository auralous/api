import fetch from "node-fetch";
import { AuthenticationError } from "apollo-server-errors";
import { ServiceInit } from "../base";
import {
  UserOauthProvider,
  TrackDbObject,
  ArtistDbObject,
  PlaylistDbObject,
} from "../../types/db";
import { ExternalPlaylistResponse } from "../../types/common";
import { AllServices } from "../types";
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
    platform: "spotify",
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

async function checkTokenAndRefresh(
  serv: SpotifyService,
  services: AllServices
) {
  if (!serv.auth) return;
  const response = await fetch(
    // This seems like a private API but it allows quick fetch so we use it
    `${serv.BASE_URL}/melody/v1/check_scope?scope=web-playback`,
    { headers: { Authorization: `Bearer ${serv.auth.accessToken}` } }
  );
  if (response.status === 200) return;
  // token is not good, try refresh
  const refreshToken = serv.auth?.refreshToken;
  // no refresh token, we're done for
  if (!refreshToken) return;
  const newResponse = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      Authorization: AuthorizationHeader,
    },
    body: `grant_type=refresh_token&refresh_token=${refreshToken}`,
  });
  if (newResponse.status !== 200) {
    // Refresh token might have been expired
    await services.User.updateMeOauth("spotify", {
      id: serv.auth.id,
      refreshToken: null,
      accessToken: null,
    });
    return;
  }
  const json = await newResponse.json();
  await services.User.updateMeOauth("spotify", {
    id: serv.auth.id,
    accessToken: json.access_token,
  });
  return;
}

export default class SpotifyService {
  auth: UserOauthProvider<"spotify"> | null = null;
  BASE_URL = "https://api.spotify.com/v1";
  services: AllServices;
  initPromise: Promise<void>;

  constructor(options: ServiceInit) {
    this.services = options.services;
    this.auth = options.context.user?.oauth["spotify"] || null;
    this.initPromise = checkTokenAndRefresh(this, options.services);
  }

  async getPlaylist(id: string): Promise<ExternalPlaylistResponse | null> {
    await this.initPromise;

    const accessToken =
      this.auth?.accessToken || (await getATusingClientCredential());

    const json: SpotifyApi.SinglePlaylistResponse | null = await fetch(
      `${this.BASE_URL}/playlists/${id}?fields=name,images(url),id,tracks(items(is_local,track(id)),next),owner(id)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    ).then((res) => (res.ok ? res.json() : null));

    // TODO: May want to handle error
    if (!json) return null;

    const playlist: ExternalPlaylistResponse = {
      title: json.name,
      platform: "spotify",
      image: json.images[0]?.url,
      externalId: json.id,
      tracks: json.tracks.items
        .filter((item) => !item.is_local)
        .map((item) => `spotify:${item.track.id}`),
      userId: json.owner.id,
    };

    if (json.tracks.next) {
      let next: string | null = json.tracks.next;
      while (next) {
        const nextJson: SpotifyApi.PlaylistTrackResponse | null = await fetch(
          next,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        )
          // TODO: May want to handle error
          .then((res) => (res.ok ? res.json() : null));
        if (nextJson) {
          playlist.tracks.push(
            ...nextJson.items
              .filter((item) => !item.is_local)
              .map((item) => `spotify:${item.track.id}`)
          );
        }
        next = nextJson?.next || null;
      }
    }

    return playlist;
  }

  async getPlaylistsByUserId(
    userId: string
  ): Promise<ExternalPlaylistResponse[]> {
    await this.initPromise;

    const accessToken =
      this.auth?.accessToken || (await getATusingClientCredential());

    let next: string | null = `${this.BASE_URL}/users/${userId}/playlists`;

    const playlistIds: string[] = [];

    while (next) {
      const json: SpotifyApi.ListOfUsersPlaylistsResponse | null = await fetch(
        next,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      )
        // TODO: May want to handle error
        .then((res) => (res.ok ? res.json() : null));
      if (json) playlistIds.push(...json.items.map((item) => item.id));
      next = json?.next || null;
    }

    const playlists: ExternalPlaylistResponse[] = [];

    for (const playlistId of playlistIds) {
      const playlist = await this.getPlaylist(playlistId);
      if (playlist) playlists.push(playlist);
    }

    return playlists;
  }

  async createPlaylist(
    title: string
  ): Promise<Pick<PlaylistDbObject, "externalId" | "image" | "userId">> {
    await this.initPromise;
    if (!this.auth?.accessToken)
      throw new AuthenticationError("Missing Spotify Access Token");

    const json: SpotifyApi.CreatePlaylistResponse | null = await fetch(
      `${this.BASE_URL}/users/${this.auth.id}/playlists`,
      {
        headers: {
          Authorization: `Bearer ${this.auth.accessToken}`,
          "Content-Type": "application/json",
        },
        method: "POST",
        body: JSON.stringify({
          name: title,
        }),
      }
    )
      // TODO: May want to handle error
      .then((res) => (res.ok ? res.json() : null));

    if (!json) throw new Error("Could not created Spotify playlist");

    return {
      externalId: json.id,
      image: json.images[0]?.url,
      userId: json.owner.id,
    };
  }

  async insertPlaylistTracks(externalId: string, externalTrackIds: string[]) {
    await this.initPromise;
    if (!this.auth?.accessToken)
      throw new AuthenticationError("Missing Spotify Access Token");
    await fetch(`${this.BASE_URL}/playlists/${externalId}/tracks`, {
      headers: {
        Authorization: `Bearer ${this.auth.accessToken}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      body: JSON.stringify({
        uris: externalTrackIds.map(
          (externalTrackId) => `spotify:track:${externalTrackId}`
        ),
      }),
    }).then((res) =>
      res.ok
        ? true
        : Promise.reject(new Error("Could not insert playlist tracks"))
    );
  }

  // Lib
  async getTrack(externalId: string): Promise<TrackDbObject | null> {
    await this.initPromise;
    // We may offload some of the work using user's token
    const accessToken =
      this.auth?.accessToken || (await getATusingClientCredential());
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

  async searchTracks(searchQuery: string): Promise<TrackDbObject[]> {
    await this.initPromise;
    // We may offload some of the work using user's token
    const accessToken =
      this.auth?.accessToken || (await getATusingClientCredential());
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
    )
      // TODO: May want to handle error
      .then((response) => (response.ok ? response.json() : null));
    return json?.tracks?.items.map(parseTrack) || [];
  }

  async getArtist(externalId: string): Promise<ArtistDbObject | null> {
    await this.initPromise;
    // We may offload some of the work using user's token
    const accessToken =
      this.auth?.accessToken || (await getATusingClientCredential());
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
      platform: "spotify",
      externalId,
      name: json.name,
      image: json.images?.[0]?.url || "",
      url: json.external_urls.spotify,
    };
  }
}
