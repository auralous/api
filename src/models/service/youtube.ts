import { google } from "googleapis";
import fetch from "node-fetch";
import { AuthenticationError, ForbiddenError } from "apollo-server-errors";
import { TrackModel } from "../../models/track";
import { BaseModel, ModelInit } from "../../models/base";
import { isDefined } from "../../lib/utils";
import { MAX_TRACK_DURATION } from "../../lib/constant";
import {
  TrackDbObject,
  ArtistDbObject,
  PlaylistDbObject,
} from "../../types/db";
import { ExternalPlaylistResponse } from "../../types/common";

function parseDurationToMs(str: string) {
  let miliseconds = 0;
  const hours = str.match(/(\d+)(?=\s*H)/);
  const minutes = str.match(/(\d+)(?=\s*M)/);
  const seconds = str.match(/(\d+)(?=\s*S)/);
  if (hours) miliseconds += parseInt(hours[1], 10) * 60 * 60 * 1000;
  if (minutes) miliseconds += parseInt(minutes[1], 10) * 60 * 1000;
  if (seconds) miliseconds += parseInt(seconds[1], 10) * 1000;
  return miliseconds;
}

const INTERNAL_YTAPI = {
  context: {
    capabilities: {},
    client: {
      clientName: "WEB_REMIX",
      clientVersion: "0.1",
      experimentIds: [],
      experimentsToken: "",
      gl: "DE",
      hl: "en",
      locationInfo: {
        locationPermissionAuthorizationStatus:
          "LOCATION_PERMISSION_AUTHORIZATION_STATUS_UNSUPPORTED",
      },
      musicAppInfo: {
        musicActivityMasterSwitch: "MUSIC_ACTIVITY_MASTER_SWITCH_INDETERMINATE",
        musicLocationMasterSwitch: "MUSIC_LOCATION_MASTER_SWITCH_INDETERMINATE",
        pwaInstallabilityStatus: "PWA_INSTALLABILITY_STATUS_UNKNOWN",
      },
      utcOffsetMinutes: 60,
    },
    request: {
      internalExperimentFlags: [
        {
          key: "force_music_enable_outertube_tastebuilder_browse",
          value: "true",
        },
        {
          key: "force_music_enable_outertube_playlist_detail_browse",
          value: "true",
        },
        {
          key: "force_music_enable_outertube_search_suggestions",
          value: "true",
        },
      ],
      sessionIndex: {},
    },
    user: {
      enableSafetyMode: false,
    },
  },
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:72.0) Gecko/20100101 Firefox/72.0",
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.5",
    "Content-Type": "application/json",
    "X-Goog-AuthUser": "0",
    "x-origin": "https://music.youtube.com",
  },
  params: "?alt=json&key=AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30",
  baseUrl: "https://music.youtube.com/youtubei/v1",
};

export default class YoutubeService {
  oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_KEY,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.API_URI}/auth/google/callback`
  );
  youtube = google.youtube({
    version: "v3",
    auth: this.oauth2Client,
  });
  services: BaseModel["services"];
  private authId?: string;
  constructor(options: ModelInit) {
    this.services = options.services;
    if (options.context.user) {
      const googleProvider = options.context.user.oauth.youtube;
      if (googleProvider) {
        this.oauth2Client.setCredentials({
          access_token: googleProvider.accessToken,
          refresh_token: googleProvider.refreshToken,
        });
        this.authId = googleProvider.id;
        // Handling refresh tokens
        this.oauth2Client.on("tokens", async (tokens) => {
          options.services.User.updateMeOauth("youtube", {
            id: googleProvider.id,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
          });
        });
      }
    }
    if (!this.oauth2Client.credentials.access_token) {
      // Fallback to using API Key
      this.oauth2Client.apiKey = process.env.GOOGLE_API_KEY;
    }
  }

  async getPlaylist(id: string): Promise<ExternalPlaylistResponse | null> {
    if (!this.authId) return null;

    const result = await this.youtube.playlists.list({
      part: ["snippet", "id"],
      id: [id],
      fields: "items(id,snippet(title,thumbnails.high.url))",
    });

    const playlistResponse = result.data?.items?.[0];

    if (!playlistResponse) return null;

    const playlist: ExternalPlaylistResponse = {
      title: playlistResponse.snippet?.title as string,
      image: playlistResponse.snippet?.thumbnails?.high?.url,
      platform: "youtube",
      externalId: playlistResponse.id as string,
      tracks: [],
      userId: this.authId, // FIXME: This should be channelId
    };

    let nextPageToken: string | null = "";

    while (typeof nextPageToken === "string") {
      const result = await this.youtube.playlistItems.list({
        playlistId: id,
        part: ["contentDetails"],
        pageToken: nextPageToken,
        fields: "nextPageToken,items/contentDetails/videoId",
      });

      if (result.data.items) {
        playlist.tracks.push(
          ...result.data.items.map(
            (item) => `youtube:${item.contentDetails?.videoId}`
          )
        );
      }

      nextPageToken = result.data.nextPageToken as string | null;
    }

    return playlist;
  }

  // TODO: We do not support get playlists for user id yet
  async getPlaylistsByUserId(): Promise<ExternalPlaylistResponse[]> {
    const playlistIds: string[] = [];

    let nextPageToken: string | null = "";

    while (typeof nextPageToken === "string") {
      const result = await this.youtube.playlists
        .list({
          part: ["id"],
          pageToken: nextPageToken,
          fields: "nextPageToken,items(id)",
          mine: true,
        })
        // TODO: Handle error
        .catch(() => null);

      if (result?.data.items)
        playlistIds.push(...result.data.items.map((item) => item.id as string));

      nextPageToken = (result?.data.nextPageToken || null) as string | null;
    }

    const playlists: ExternalPlaylistResponse[] = [];

    for (const playlistId of playlistIds) {
      const playlist = await this.getPlaylist(playlistId);
      if (playlist) playlists.push(playlist);
    }

    return playlists;
  }

  async createPlaylist(
    name: string
  ): Promise<Pick<PlaylistDbObject, "externalId" | "image" | "userId">> {
    if (!this.oauth2Client.credentials.access_token || !this.authId)
      throw new AuthenticationError("Missing YouTube Access Token");

    const response = await this.youtube.playlists
      .insert({
        part: ["snippet"],
        requestBody: { snippet: { title: name } },
      })
      .catch(() => {
        // FIXME: Inapproriate error
        throw new ForbiddenError("Could not created YouTube Playlist.");
      });

    return {
      externalId: response.data.id as string,
      image: response.data.snippet?.thumbnails?.high?.url,
      userId: this.authId,
    };
  }

  async insertPlaylistTracks(externalId: string, externalTrackIds: string[]) {
    if (!this.oauth2Client.credentials.access_token || !this.authId)
      throw new AuthenticationError("Missing YouTube Access Token");
    // TODO: YouTube API does not have batch insert
    for (const externalTrackId of externalTrackIds) {
      await this.youtube.playlistItems.insert({
        part: ["snippet"],
        requestBody: {
          snippet: {
            playlistId: externalId,
            resourceId: {
              kind: "youtube#video",
              videoId: externalTrackId,
            },
          },
        },
      });
    }
  }

  // Lib
  async getTrack(externalId: string): Promise<TrackDbObject | null> {
    const { data: json } = await this.youtube.videos.list({
      part: ["contentDetails", "snippet", "status"],
      fields:
        "items(snippet(title,thumbnails/high,channelId),contentDetails/duration,status/embeddable)",
      id: [externalId],
    });
    if (!json?.items?.[0]) return null;
    const { contentDetails, snippet, status } = json.items[0];
    if (!snippet || !status || !contentDetails) return null;
    if (!status.embeddable) return null;
    const msDuration = parseDurationToMs(
      (contentDetails.duration as string).substr(2)
    );
    // Video is too long to be considered a track
    if (msDuration > MAX_TRACK_DURATION) return null;
    return {
      id: `youtube:${externalId}`,
      externalId,
      platform: "youtube",
      duration: msDuration,
      title: snippet.title as string,
      image: snippet.thumbnails?.high?.url as string,
      artistIds: [`youtube:${snippet.channelId as string}`],
      albumId: "",
      url: `https://youtu.be/${externalId}`,
    };
  }

  getTrackIdFromUri(uri: string): string | null {
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = uri.match(regExp);
    return match?.[7]?.length === 11 ? match[7] : null;
  }

  async searchTracks(
    searchQuery: string,
    { Track }: { Track: TrackModel }
  ): Promise<TrackDbObject[]> {
    // Using unofficial YTMusic API
    const filterParams = {
      song: "RAAGAAgACgA",
      video: "BABGAAgACgA",
    };
    const searchEndpoint = "/search";
    const body = {
      params: "Eg-KAQwIA" + filterParams.video + "MABqChAEEAMQCRAFEAo%3D",
      query: searchQuery,
      context: INTERNAL_YTAPI.context,
    };

    const json = await fetch(
      `${INTERNAL_YTAPI.baseUrl}${searchEndpoint}${INTERNAL_YTAPI.params}`,
      {
        headers: INTERNAL_YTAPI.headers,
        method: "POST",
        body: JSON.stringify(body),
      }
    ).then((res) =>
      res.ok
        ? res.json()
        : Promise.reject(
            new Error("An error has occurred in searching YouTube tracks")
          )
    );

    if (!json) return [];

    const list: any[] | undefined =
      json.contents.sectionListRenderer.contents[0].musicShelfRenderer
        ?.contents;

    // No track found
    if (!list) return [];

    const videoIds: string[] = list.map(
      ({ musicResponsiveListItemRenderer }) =>
        musicResponsiveListItemRenderer.doubleTapCommand.watchEndpoint.videoId
    );

    const promises = videoIds.map((i) => Track.findOrCreate(`youtube:${i}`));

    return Promise.all<TrackDbObject | null>(promises).then((tracks) =>
      // A track should only be less than 7 minutes... maybe. You know, 777
      tracks.filter(isDefined)
    );
  }

  async getArtist(externalId: string): Promise<ArtistDbObject | null> {
    const { data: json } = await this.youtube.channels.list({
      id: [externalId],
      part: ["snippet"],
      fields: "items(snippet(title,thumbnails/high))",
    });
    if (!json?.items?.[0]) return null;
    const { snippet } = json.items[0];
    if (!snippet) return null;
    return {
      id: `youtube:${externalId}`,
      platform: "youtube",
      externalId,
      name: snippet.title as string,
      image: snippet.thumbnails?.high?.url as string,
      url: `https://www.youtube.com/channel/${externalId}`,
    };
  }
}
