import { google } from "googleapis";
import fetch from "node-fetch";
import { isDefined } from "../../lib/utils";
import { MAX_TRACK_DURATION } from "../../lib/constant";
import { ArtistDbObject, TrackDbObject } from "../../types/db";
import { ServiceContext } from "../types";
import { TrackService } from "../track";
import { UserService } from "../user";

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
  private oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_KEY,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.API_URI}/auth/google/callback`
  );
  private youtube = google.youtube({
    version: "v3",
    auth: this.oauth2Client,
  });
  constructor(
    context: ServiceContext,
    private userService: UserService,
    private trackService: TrackService
  ) {
    if (context.user) {
      const gp = context.user.oauth.youtube;
      if (gp?.accessToken && gp.refreshToken) {
        this.register(gp.id, gp.accessToken, gp.refreshToken);
      }
    }
    if (!this.oauth2Client.credentials.access_token) {
      // Fallback to using API Key
      this.oauth2Client.apiKey = process.env.GOOGLE_API_KEY;
    }
  }

  private register(id: string, accessToken: string, refreshToken: string) {
    this.oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    this.oauth2Client.on("tokens", async (tokens) => {
      this.userService.updateMeOauth("youtube", {
        id,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        ...(tokens.expiry_date && {
          expiredAt: new Date(tokens.expiry_date),
        }),
      });
    });
  }

  async getAccessToken(): Promise<string | null> {
    return this.oauth2Client
      .getAccessToken()
      .then((resp) => resp.token || null)
      .catch(() => null);
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

  getPlaylistIdFromUri(uri: string): string | null {
    if (!uri.includes("youtube")) return null;
    const regExp = /^.*((v\/)|(\/u\/\w\/)|(\/playlist\?)|(watch\?))?list?=?([^#&?]*).*/;
    const match = uri.match(regExp);
    return match?.[6] || null;
  }

  async getTracksByPlaylistId(id: string): Promise<TrackDbObject[]> {
    const tracks: TrackDbObject[] = [];
    let trackData = await this.youtube.playlistItems.list({
      part: ["contentDetails"],
      fields: "nextPageToken,items/contentDetails/videoId",
      playlistId: id,
    });
    // eslint-disable-next-line
    while (true) {
      const trackItems = (
        await Promise.all(
          (trackData.data.items || []).map((trackItemData) =>
            this.trackService.findOrCreate(
              `youtube:${trackItemData.contentDetails!.videoId}`
            )
          )
        )
      ).filter(isDefined);
      tracks.push(...trackItems);
      if (trackData.data.nextPageToken)
        trackData = await this.youtube.playlistItems.list({
          part: ["contentDetails"],
          fields: "nextPageToken,items/contentDetails/videoId",
          playlistId: id,
          pageToken: trackData.data.nextPageToken,
        });
      else break;
    }
    return tracks;
  }

  async searchTracks(searchQuery: string): Promise<TrackDbObject[]> {
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

    const promises = videoIds.map((i) =>
      this.trackService.findOrCreate(`youtube:${i}`)
    );

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
