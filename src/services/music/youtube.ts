import { google, Auth } from "googleapis";
import fetch from "node-fetch";
import { isDefined } from "../../lib/utils";
import { MAX_TRACK_DURATION } from "../../lib/constant";
import { PlatformName, UserDbObject } from "../../types/index";

import type { TrackService } from "../track";
import type { UserService } from "../user";
import type { ArtistDbObject, TrackDbObject } from "../../types/index";

function parseDurationToMs(str: string) {
  // https://developers.google.com/youtube/v3/docs/videos#contentDetails.duration
  const a = str.match(/\d+/g);
  if (!a) return 0;
  let duration = 0;
  if (a.length == 3) {
    duration += parseInt(a[0]) * 3600;
    duration += parseInt(a[1]) * 60;
    duration += parseInt(a[2]);
  } else if (a.length == 2) {
    duration += parseInt(a[0]) * 60;
    duration += parseInt(a[1]);
  } else if (a.length == 1) {
    duration += parseInt(a[0]);
  }
  return duration * 1000;
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

export class YoutubeService {
  private youtube = google.youtube({
    version: "v3",
    auth: process.env.GOOGLE_API_KEY,
  });
  constructor(private findOrCreate: TrackService["findOrCreate"]) {}

  /**
   * Get YouTube track
   * @param externalId
   */
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
      platform: PlatformName.Youtube,
      duration: msDuration,
      title: snippet.title as string,
      image: snippet.thumbnails?.high?.url as string,
      artistIds: [`youtube:${snippet.channelId as string}`],
      albumId: "",
      url: `https://youtu.be/${externalId}`,
    };
  }

  /**
   * Get YouTube track by uri
   * @param uri
   */
  getTrackIdFromUri(uri: string): string | null {
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = uri.match(regExp);
    return match?.[7]?.length === 11 ? match[7] : null;
  }

  /**
   * Get playlistId from uri
   * @param uri
   */
  getPlaylistIdFromUri(uri: string): string | null {
    if (!uri.includes("youtube")) return null;
    const regExp = /^.*((v\/)|(\/u\/\w\/)|(\/playlist\?)|(watch\?))?list?=?([^#&?]*).*/;
    const match = uri.match(regExp);
    return match?.[6] || null;
  }

  /**
   * Get YouTube tracks by playlist
   * @param id
   */
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
            this.findOrCreate(
              `youtube:${trackItemData.contentDetails?.videoId}`
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

  /**
   * Search YouTube track
   * @param searchQuery
   */
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

    const promises = videoIds.map((i) => this.findOrCreate(`youtube:${i}`));

    return Promise.all<TrackDbObject | null>(promises).then((tracks) =>
      // A track should only be less than 7 minutes... maybe. You know, 777
      tracks.filter(isDefined)
    );
  }

  /**
   * Get YouTube artist
   * @param externalId
   */
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
      platform: PlatformName.Youtube,
      externalId,
      name: snippet.title as string,
      image: snippet.thumbnails?.high?.url as string,
      url: `https://www.youtube.com/channel/${externalId}`,
    };
  }
}

export class YoutubeAuthService {
  private oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_KEY,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.API_URI}/auth/google/callback`
  );

  async getAccessToken(
    me: UserDbObject,
    userService: UserService
  ): Promise<string | null> {
    if (me.oauth.provider !== PlatformName.Youtube) return null;

    this.oauth2Client.setCredentials({
      access_token: me.oauth.accessToken,
      refresh_token: me.oauth.refreshToken,
    });

    const refreshHandler = (tokens: Auth.Credentials) => {
      userService.updateMeOauth(me, {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        ...(tokens.expiry_date && {
          expiredAt: new Date(tokens.expiry_date),
        }),
      });
    };

    // We register refresh token handler in case it happens
    this.oauth2Client.on("tokens", refreshHandler);
    return this.oauth2Client
      .getAccessToken()
      .then((resp) => resp.token || null)
      .catch(() => null)
      .finally(() => {
        // We no longer need this, remove to avoid memory leak
        this.oauth2Client.off("tokens", refreshHandler);
      });
  }
}
