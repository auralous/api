import DataLoader from "dataloader";
import { AuthState } from "../auth/types.js";
import { OdesliAPI } from "../data/odesli.js";
import { redis } from "../data/redis.js";
import { SpotifyAPI } from "../data/spotify.js";
import type { ArtistDbObject, TrackDbObject } from "../data/types.js";
import { YoutubeAPI } from "../data/youtube.js";
import { UnauthorizedError } from "../error/errors.js";
import { PlatformName, Playlist } from "../graphql/graphql.gen.js";
import { CONFIG, REDIS_KEY } from "../utils/constant.js";
import type { ServiceContext } from "./types.js";

// const stringifyTrack = fastJson({
//   title: "Track",
//   type: "object",
//   properties: {
//     id: { type: "string" },
//     externalId: { type: "string" },
//     platform: { type: "string" },
//     duration: { type: "number" },
//     title: { type: "string" },
//     image: { type: "string" },
//     artistIds: { type: "array", items: { type: "string" } },
//     albumId: { type: "string" },
//     url: { type: "string" },
//   },
//   required: [
//     "id",
//     "externalId",
//     "platform",
//     "duration",
//     "title",
//     "artistIds",
//     "albumId",
//     "url",
//   ],
// });

// const stringifyArtist = fastJson({
//   title: "Artist",
//   type: "object",
//   properties: {
//     id: { type: "string" },
//     platform: { type: "string" },
//     externalId: { type: "string" },
//     name: { type: "string" },
//     url: { type: "string" },
//     image: { type: "string" },
//   },
//   required: ["id", "platform", "externalId", "name", "url"],
// });

function createLoaderFn<T extends TrackDbObject | ArtistDbObject>(
  getFnName: "getTracks" | "getArtists",
  auth: AuthState | null
) {
  /**
   * For the loader, we group all YouTube / Spotify / Apple Music
   * into seperate sets. Then call getTracks() for each set using
   * their respective APIs
   */
  return async (entryIds: readonly string[]) => {
    const resultMap: Record<string, T | null> = {};
    const idsBatches = {
      [PlatformName.Youtube]: new Set<string>(),
      [PlatformName.Spotify]: new Set<string>(),
    };
    entryIds.forEach((entryId) => {
      const [platform, externalId] = entryId.split(":") as [
        PlatformName,
        string
      ];
      idsBatches[platform]?.add(externalId);
    });

    const promises: Promise<(T | null)[]>[] = [];

    for (const platformName of Object.keys(idsBatches) as PlatformName[]) {
      if (idsBatches[platformName].size > 0) {
        let accessToken: string | undefined;
        if (platformName === auth?.provider)
          accessToken = (await auth.accessTokenPromise) || undefined;
        promises.push(
          TrackService[platformName][getFnName](
            Array.from(idsBatches[platformName]),
            accessToken
          ) as Promise<(T | null)[]>
        );
      }
    }

    await Promise.all(promises)
      .then((promiseResults) => promiseResults.flat(1))
      .then((results) =>
        results.forEach((result) => result && (resultMap[result.id] = result))
      );

    return entryIds.map((entryId) => resultMap[entryId] || null);
  };
}

export class TrackService {
  static createLoader(auth: AuthState | null) {
    return {
      track: new DataLoader<string, TrackDbObject | null>(
        createLoaderFn<TrackDbObject>("getTracks", auth)
      ),
      artist: new DataLoader<string, ArtistDbObject | null>(
        createLoaderFn<ArtistDbObject>("getArtists", auth)
      ),
    };
  }

  static get [PlatformName.Youtube]() {
    return YoutubeAPI;
  }

  static get [PlatformName.Spotify]() {
    return SpotifyAPI;
  }

  static async findTrack(
    context: ServiceContext,
    id: string
  ): Promise<TrackDbObject | null> {
    return context.loaders.track.track.load(id);
  }

  static async findTracks(context: ServiceContext, ids: string[]) {
    return (await context.loaders.track.track.loadMany(ids)).map((item) =>
      item instanceof Error ? null : item
    );
  }

  static async crossFindTracks(
    context: ServiceContext,
    id: string
  ): Promise<Record<PlatformName, string | undefined>> {
    const [platformName, externalId] = id.split(":");

    const cacheKey = REDIS_KEY.crossTracks(id);

    const cache = (await redis.hgetall(cacheKey)) as Record<
      PlatformName,
      string | undefined
    >;

    if (Object.keys(cache).length > 0) return cache;

    // Not found in cache, try to fetch
    const data = await OdesliAPI.getLinks(
      platformName as PlatformName,
      externalId
    );

    if (!("linksByPlatform" in data)) return cache; // cache = {}

    for (const platform of Object.values(PlatformName)) {
      cache[platform] =
        data.linksByPlatform[platform]?.entityUniqueId.split("::")[1];
      if (cache[platform]) {
        redis.hset(cacheKey, platform, cache[platform] as string);
      }
    }
    redis.expire(cacheKey, CONFIG.crossTrackMaxAge);

    return cache;
  }

  static async searchTracks(
    context: ServiceContext,
    platform: PlatformName,
    query: string
  ): Promise<TrackDbObject[]> {
    return TrackService[platform].searchTracks(
      query,
      (context.auth?.provider === platform &&
        (await context.auth?.accessTokenPromise)) ||
        undefined
    );
  }

  // Artists
  static findArtist(context: ServiceContext, id: string) {
    return context.loaders.track.artist.load(id);
  }

  // Playlist
  static async searchPlaylists(
    context: ServiceContext,
    platform: PlatformName,
    query: string
  ): Promise<Playlist[]> {
    return TrackService[platform].searchPlaylists(
      query,
      (context.auth?.provider === platform &&
        (await context.auth?.accessTokenPromise)) ||
        undefined
    );
  }

  static async findPlaylist(context: ServiceContext, id: string) {
    const [platform, externalId] = id.split(":");
    return TrackService[platform as PlatformName].getPlaylist(
      externalId,
      (context.auth?.provider === platform &&
        (await context.auth?.accessTokenPromise)) ||
        undefined
    );
  }

  static async findPlaylistTracks(context: ServiceContext, id: string) {
    const [platform, externalId] = id.split(":");
    return TrackService[platform as PlatformName].getPlaylistTracks(
      externalId,
      (context.auth?.provider === platform &&
        (await context.auth?.accessTokenPromise)) ||
        undefined
    );
  }

  static async findMyPlaylist(context: ServiceContext) {
    if (!context.auth) throw new UnauthorizedError();
    return TrackService[context.auth.provider].getMyPlaylists(
      (await context.auth?.accessTokenPromise) || ""
    );
  }

  static async insertPlaylistTracks(
    context: ServiceContext,
    id: string,
    tracksIds: string[]
  ) {
    if (!context.auth) throw new UnauthorizedError();
    const [platform, externalId] = id.split(":");
    return TrackService[platform as PlatformName].insertPlaylistTracks(
      (await context.auth.accessTokenPromise) || "",
      externalId,
      tracksIds.map((trackId) => trackId.split(":")[1])
    );
  }

  static async createPlaylist(
    context: ServiceContext,
    name: string,
    tracksIds: string[]
  ) {
    if (!context.auth) throw new UnauthorizedError();

    const playlist = await this[context.auth.provider].createPlaylist(
      (await context.auth?.accessTokenPromise) || "",
      name
    );

    await TrackService.insertPlaylistTracks(context, playlist.id, tracksIds);

    return playlist;
  }
}
