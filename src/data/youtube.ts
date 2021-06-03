import { google, youtube_v3 } from "googleapis";
import un from "undecim";
import type { Playlist } from "../graphql/graphql.gen.js";
import { PlatformName } from "../graphql/graphql.gen.js";
import { MAX_TRACK_DURATION } from "../utils/constant.js";
import { isDefined } from "../utils/utils.js";
import type { ArtistDbObject, TrackDbObject, UserDbObject } from "./types.js";

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

function parsePlaylist(result: youtube_v3.Schema$Playlist): Playlist {
  return {
    id: `youtube:${result.id}`,
    platform: PlatformName.Youtube,
    externalId: result.id as string,
    image: result.snippet?.thumbnails?.high?.url as string,
    name: result.snippet?.title as string,
    url: `https://www.youtube.com/playlist?list=${result.id}`,
  };
}

export class YoutubeAPI {
  static youtube = google.youtube({
    version: "v3",
    auth: process.env.GOOGLE_API_KEY,
  });

  /**
   * Get YouTube track
   * @param externalId
   */
  static async getTrack(externalId: string): Promise<TrackDbObject | null> {
    const { data: json } = await YoutubeAPI.youtube.videos.list({
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
   * Get YouTube playlist
   * @param externalId
   * @param userAccessToken
   */
  static async getPlaylist(
    externalId: string,
    userAccessToken?: string
  ): Promise<Playlist | null> {
    const { data: json } = await YoutubeAPI.youtube.playlists.list({
      part: ["snippet"],
      fields: "items(snippet(thumbnails,title))",
      id: [externalId],
      access_token: userAccessToken,
    });

    if (!json.items?.[0]) return null;

    return parsePlaylist(json.items[0]);
  }

  /**
   * Get current user's YouTube playlists
   * @param me
   */
  static async getMyPlaylists(me: UserDbObject): Promise<Playlist[]> {
    const playlists: Playlist[] = [];

    let data: youtube_v3.Schema$PlaylistListResponse | undefined;

    do {
      data = (
        await YoutubeAPI.youtube.playlists.list({
          part: ["id", "snippet"],
          mine: true,
          fields: "nextPageToken,items(id,snippet(title,thumbnails.high.url))",
          access_token: me.oauth.accessToken || "",
          pageToken: data?.nextPageToken || undefined,
        })
      ).data;
      if (data.items) playlists.push(...data.items.map(parsePlaylist));
    } while (data.nextPageToken);

    return playlists;
  }

  /**
   * Insert tracks to YouTube playlist
   * @param me
   * @param externalId
   * @param externalTrackIds
   */
  static async insertPlaylistTracks(
    me: UserDbObject,
    externalId: string,
    externalTrackIds: string[]
  ): Promise<boolean> {
    for (const externalTrackId of externalTrackIds)
      await YoutubeAPI.youtube.playlistItems.insert({
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
        access_token: me.oauth.accessToken || undefined,
      });
    return true;
  }

  /**
   * Create a YouTube playlist
   * @param me
   * @param name
   * @param externalTrackIds
   */
  static async createPlaylist(
    me: UserDbObject,
    name: string
  ): Promise<Playlist> {
    const { data } = await YoutubeAPI.youtube.playlists.insert({
      part: ["snippet"],
      requestBody: { snippet: { title: name } },
      access_token: me.oauth.accessToken || undefined,
    });
    return parsePlaylist(data);
  }

  /**
   * Get YouTube tracks by playlist
   * @param playlistId
   */
  static async getPlaylistTracks(
    externalId: string,
    userAccessToken?: string
  ): Promise<TrackDbObject[]> {
    const tracks: TrackDbObject[] = [];

    let trackData: youtube_v3.Schema$PlaylistItemListResponse | undefined;

    do {
      trackData = (
        await YoutubeAPI.youtube.playlistItems.list({
          part: ["contentDetails"],
          fields: "nextPageToken,items/contentDetails/videoId",
          playlistId: externalId,
          access_token: userAccessToken,
          pageToken: trackData?.nextPageToken || undefined,
        })
      ).data;

      // TODO: We prefer not to do this
      tracks.push(
        ...(
          await Promise.all(
            (trackData.items || []).map((trackItemData) =>
              YoutubeAPI.getTrack(
                trackItemData.contentDetails?.videoId as string
              )
            )
          )
        ).filter(isDefined)
      );
    } while (trackData?.nextPageToken);

    return tracks;
  }

  /**
   * Search YouTube track
   * @param searchQuery
   */
  static async searchTracks(searchQuery: string): Promise<TrackDbObject[]> {
    // Using unofficial YTMusic API
    const filterParams = {
      song: "RAAGAAgACgA",
      video: "BABGAAgACgA",
    };
    const searchEndpoint = "/search";

    const data = await un
      .post(
        `${INTERNAL_YTAPI.baseUrl}${searchEndpoint}${INTERNAL_YTAPI.params}`,
        {
          data: {
            params: "Eg-KAQwIA" + filterParams.video + "MABqChAEEAMQCRAFEAo%3D",
            query: searchQuery,
            context: INTERNAL_YTAPI.context,
          },
          headers: INTERNAL_YTAPI.headers,
        }
      )
      .json<any>();

    if (!data) return [];

    const list: any[] | undefined =
      data.contents.sectionListRenderer.contents[0].musicShelfRenderer
        ?.contents;

    // No track found
    if (!list) return [];

    const videoIds: string[] = list.map(
      ({ musicResponsiveListItemRenderer }) =>
        musicResponsiveListItemRenderer.doubleTapCommand.watchEndpoint.videoId
    );

    const promises = videoIds.map((i) => YoutubeAPI.getTrack(i));

    return Promise.all<TrackDbObject | null>(promises).then((tracks) =>
      // A track should only be less than 7 minutes... maybe. You know, 777
      tracks.filter(isDefined)
    );
  }

  /**
   * Get YouTube artist
   * @param externalId
   */
  static async getArtist(externalId: string): Promise<ArtistDbObject | null> {
    const { data: json } = await YoutubeAPI.youtube.channels.list({
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

  /**
   * Get Featured Playlists by scrapping YouTube API
   */
  static async getFeaturedPlaylists(): Promise<Playlist[]> {
    return [];
  }
}
