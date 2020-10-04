import fetch from "node-fetch";
import { AuthenticationError } from "apollo-server-errors";
import { ServiceInit } from "../base";
import {
  UserOauthProvider,
  TrackDbObject,
  ArtistDbObject,
} from "../../types/db";
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
