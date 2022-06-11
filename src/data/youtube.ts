/* eslint-disable @typescript-eslint/no-unused-vars */
import { google, youtube_v3 } from "googleapis";
import un from "undecim";
import type {
  Playlist,
  RecommendationSection,
} from "../graphql/graphql.gen.js";
import { PlatformName } from "../graphql/graphql.gen.js";
import { ENV } from "../utils/constant.js";
import { isURL } from "../utils/http.js";
import { isDefined } from "../utils/utils.js";
import { db } from "./mongo.js";
import type {
  ArtistDbObject,
  RecommendationDbObject,
  TrackDbObject,
} from "./types.js";
import { getFromIdsPerEveryNum } from "./utils.js";

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

export const INTERNAL_YTAPI = {
  filterParams: {
    video: "EgWKAQIQAWoMEAMQBBAJEA4QBRAK",
    communityPlaylist: "EgeKAQQoA" + "EA" + "BQgIIAWoMEA4QChADEAQQCRAF",
  },
  context: {
    client: {
      clientName: "WEB_REMIX",
      clientVersion: "1.20220216.00.00",
      platform: "DESKTOP",
      musicAppInfo: {
        pwaInstallabilityStatus: "PWA_INSTALLABILITY_STATUS_UNKNOWN",
        webDisplayMode: "WEB_DISPLAY_MODE_BROWSER",
        musicActivityMasterSwitch: "MUSIC_ACTIVITY_MASTER_SWITCH_INDETERMINATE",
        musicLocationMasterSwitch: "MUSIC_LOCATION_MASTER_SWITCH_INDETERMINATE",
      },
      visitorData: "CgtPN3JValJiaVNYMCi17cSQBg%3D%3D",
    },
    request: {
      consistencyTokenJars: [],
      internalExperimentFlags: [],
      useSsl: true,
    },
  },
  headers: {
    "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1",
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
    image:
      (
        result.snippet?.thumbnails?.standard ||
        result.snippet?.thumbnails?.high ||
        result.snippet?.thumbnails?.maxres
      )?.url || undefined,
    name: result.snippet?.title as string,
    url: `https://www.youtube.com/playlist?list=${result.id}`,
    total: result.contentDetails?.itemCount || 0,
    creatorName: result.snippet?.channelTitle || "???",
  };
}

function parseTrack(result: youtube_v3.Schema$Video): TrackDbObject {
  const msDuration = parseDurationToMs(
    (result.contentDetails!.duration as string).substr(2)
  );
  return {
    id: `youtube:${result.id}`,
    externalId: result.id as string,
    platform: PlatformName.Youtube,
    duration: msDuration,
    title: result.snippet!.title as string,
    image: result.snippet!.thumbnails
      ? `https://i.ytimg.com/vi/${result.id}/maxresdefault.jpg`
      : undefined,
    artistIds: [`youtube:${result.snippet!.channelId as string}`],
    albumId: "",
    url: `https://youtu.be/${result.id as string}`,
  };
}

function parseArtist(result: youtube_v3.Schema$Channel): ArtistDbObject {
  return {
    id: `youtube:${result.id}`,
    platform: PlatformName.Youtube,
    externalId: result.id as string,
    name: result.snippet!.title as string,
    image: result.snippet!.thumbnails?.high?.url as string,
    url: `https://www.youtube.com/channel/${result.id}`,
  };
}

export class YoutubeAPI {
  static youtube = google.youtube({
    version: "v3",
    auth: ENV.GOOGLE_API_KEY,
  });

  /**
   * Get YouTube track
   * @param externalIds
   */
  static async getTracks(
    externalIds: string[]
  ): Promise<(TrackDbObject | null)[]> {
    return getFromIdsPerEveryNum(externalIds, 50, async (ids) => {
      const { data: json } = await YoutubeAPI.youtube.videos.list({
        part: ["contentDetails", "snippet", "status"],
        fields:
          "items(id,snippet(title,thumbnails,channelId),contentDetails/duration,status/embeddable)",
        id: ids,
        maxResults: 50,
      });
      return json.items!.map((val) => {
        if (!val?.status?.embeddable) return null;
        // limit a track to 7 min
        if (
          parseDurationToMs(
            (val.contentDetails!.duration as string).substr(2)
          ) >
          7 * 60 * 1000
        )
          return null;
        return parseTrack(val);
      });
    });
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
      part: ["snippet", "contentDetails"],
      fields:
        "items(id,snippet(thumbnails,title,channelTitle),contentDetails(itemCount))",
      id: [externalId],
      access_token: userAccessToken,
      maxResults: 50,
    });

    if (!json.items?.[0]) return null;

    return parsePlaylist(json.items[0]);
  }

  /**
   * Get YouTube playlist
   * @param externalId
   * @param userAccessToken
   */
  static async getPlaylists(
    externalIds: string[],
    userAccessToken?: string
  ): Promise<(Playlist | null)[]> {
    const { data: json } = await YoutubeAPI.youtube.playlists.list({
      part: ["snippet", "contentDetails"],
      fields:
        "items(id,snippet(thumbnails,title,channelTitle),contentDetails(itemCount))",
      id: externalIds,
      access_token: userAccessToken,
      maxResults: 50,
    });

    return json.items?.map(parsePlaylist) || [];
  }

  /**
   * Get current user's YouTube playlists
   * @param accessToken
   */
  static async getMyPlaylists(accessToken: string): Promise<Playlist[]> {
    const playlists: Playlist[] = [];

    let data: youtube_v3.Schema$PlaylistListResponse | undefined;

    do {
      data = (
        await YoutubeAPI.youtube.playlists.list({
          part: ["id", "snippet"],
          mine: true,
          fields:
            "nextPageToken,items(id,snippet(title,thumbnails,channelTitle))",
          access_token: accessToken,
          pageToken: data?.nextPageToken || undefined,
          maxResults: 50,
        })
      ).data;
      if (data.items) playlists.push(...data.items.map(parsePlaylist));
    } while (data.nextPageToken);

    return playlists;
  }

  /**
   * Insert tracks to YouTube playlist
   * @param accessToken
   * @param externalId
   * @param externalTrackIds
   */
  static async insertPlaylistTracks(
    accessToken: string,
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
        access_token: accessToken,
      });
    return true;
  }

  /**
   * Create a YouTube playlist
   * @param accessToken
   * @param name
   * @param externalTrackIds
   */
  static async createPlaylist(
    accessToken: string,
    name: string
  ): Promise<Playlist> {
    const { data } = await YoutubeAPI.youtube.playlists.insert({
      part: ["snippet"],
      requestBody: { snippet: { title: name } },
      access_token: accessToken,
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

    const invalidNextPageToken = new Set<string>(); // sometimes YouTube API is stupid and return looping pageToken (A -> B -> A -> B)

    do {
      const pageToken = trackData?.nextPageToken;

      if (pageToken) {
        if (invalidNextPageToken.has(pageToken)) break;
        // otherwise infinite loop!!
        else invalidNextPageToken.add(pageToken);
      }

      trackData = (
        await YoutubeAPI.youtube.playlistItems.list({
          part: ["contentDetails"],
          fields: "nextPageToken,items/contentDetails/videoId",
          playlistId: externalId,
          access_token: userAccessToken,
          pageToken: pageToken || undefined,
          maxResults: 50,
        })
      ).data;

      // TODO: We prefer not to do this
      tracks.push(
        ...(
          await YoutubeAPI.getTracks(
            trackData.items!.map(
              (item) => item.contentDetails!.videoId as string
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
    // Check if it is URL
    if (isURL(searchQuery)) {
      const regExp =
        /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
      const match = searchQuery.match(regExp);
      if (match && match[2].length == 11) {
        return YoutubeAPI.getTracks([match[2]]).then((tracks) =>
          tracks.filter(isDefined)
        );
      } else {
        return [];
      }
    }
    // Using unofficial YTMusic API
    const data = await un
      .post(`${INTERNAL_YTAPI.baseUrl}/search${INTERNAL_YTAPI.params}`, {
        data: {
          params: INTERNAL_YTAPI.filterParams.video,
          query: searchQuery,
          context: INTERNAL_YTAPI.context,
        },
        headers: INTERNAL_YTAPI.headers,
      })
      .json<any>();

    if (!data) return [];

    let list: any[] =
      data.contents.tabbedSearchResultsRenderer.tabs[0].tabRenderer.content
        .sectionListRenderer.contents;
    list = list[list.length - 1].musicShelfRenderer.contents;

    // No track found
    if (!list) return [];

    const ids: string[] = list.map(
      ({ musicResponsiveListItemRenderer }) =>
        musicResponsiveListItemRenderer.navigationEndpoint.watchEndpoint.videoId
    );

    // We prefer not to do this
    return YoutubeAPI.getTracks(ids).then((tracks) => tracks.filter(isDefined));
  }

  static async searchPlaylists(searchQuery: string) {
    // Check if it is URL
    if (isURL(searchQuery)) {
      const regExp = /^.*(youtu.be\/|list=)([^#&?]*).*/;
      const match = searchQuery.match(regExp);
      if (match && match[2]) {
        return YoutubeAPI.getPlaylists([match[2]]).then((playlists) =>
          playlists.filter(isDefined)
        );
      } else {
        return [];
      }
    }

    // Using unofficial YTMusic API
    const data = await un
      .post(`${INTERNAL_YTAPI.baseUrl}/search${INTERNAL_YTAPI.params}`, {
        data: {
          params: INTERNAL_YTAPI.filterParams.communityPlaylist,
          query: searchQuery,
          context: INTERNAL_YTAPI.context,
        },
        headers: INTERNAL_YTAPI.headers,
      })
      .json<any>();

    if (!data) return [];

    let list: any[] =
      data.contents.tabbedSearchResultsRenderer.tabs[0].tabRenderer.content
        .sectionListRenderer.contents;
    list = list[list.length - 1].musicShelfRenderer.contents;

    // No playlist found
    if (!list) return [];

    const ids: string[] = list.map(({ musicResponsiveListItemRenderer }) => {
      return musicResponsiveListItemRenderer.overlay
        .musicItemThumbnailOverlayRenderer.content.musicPlayButtonRenderer
        .playNavigationEndpoint.watchPlaylistEndpoint.playlistId;
    });

    // We prefer not to do this
    return YoutubeAPI.getPlaylists(ids).then((playlists) =>
      playlists.filter(isDefined)
    );
  }

  /**
   * Get YouTube artist
   * @param externalIds
   */
  static async getArtists(
    externalIds: string[]
  ): Promise<(ArtistDbObject | null)[]> {
    return getFromIdsPerEveryNum<ArtistDbObject | null>(
      externalIds,
      50,
      async (ids) => {
        const { data: json } = await YoutubeAPI.youtube.channels.list({
          id: ids,
          part: ["snippet"],
          fields: "items(id,snippet(title,thumbnails))",
          maxResults: 50,
        });
        return json.items!.map((val) => (val ? parseArtist(val) : null));
      }
    );
  }

  /**
   * Get recommendations
   */
  static async getRecommendationSections(
    accessToken?: string | null
  ): Promise<RecommendationSection[]> {
    return db
      .collection<RecommendationDbObject>("recommendations")
      .find({ platform: PlatformName.Youtube })
      .toArray();
  }

  static async getRecommendationSection(
    accessToken: string | null | undefined,
    id: string
  ): Promise<RecommendationSection | null> {
    return db
      .collection<RecommendationDbObject>("recommendations")
      .findOne({ platform: PlatformName.Youtube, id });
  }

  static async getRecommendationItems(
    accessToken: string | null | undefined,
    id: string,
    limit: number
  ): Promise<Playlist[]> {
    const recomm = await db
      .collection<RecommendationDbObject>("recommendations")
      .findOne({ platform: PlatformName.Youtube, id });
    if (!recomm) return [];
    recomm.playlistIds = recomm.playlistIds.slice(0, limit);
    return (await YoutubeAPI.getPlaylists(recomm.playlistIds)).filter(
      isDefined
    );
  }
}
