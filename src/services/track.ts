import DataLoader from "dataloader";
import { AuthState } from "../auth/types.js";
import { OdesliAPI } from "../data/odesli.js";
import { redis } from "../data/redis.js";
import { SpotifyAPI } from "../data/spotify.js";
import type { ArtistDbObject, TrackDbObject } from "../data/types.js";
import { YoutubeAPI } from "../data/youtube.js";
import { AuthenticationError } from "../error/index.js";
import { PlatformName } from "../graphql/graphql.gen.js";
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

export class TrackService {
  private trackLoader: DataLoader<string, TrackDbObject | null>;
  private artistLoader: DataLoader<string, ArtistDbObject | null>;

  createEntryLoader<T extends TrackDbObject | ArtistDbObject>(
    getFnName: "getTracks" | "getArtists"
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
          promises.push(
            this[platformName][getFnName](
              Array.from(idsBatches[platformName])
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

  constructor(private context: ServiceContext) {
    this.trackLoader = new DataLoader(
      this.createEntryLoader<TrackDbObject>("getTracks").bind(this),
      { cache: false }
    );
    this.artistLoader = new DataLoader(
      this.createEntryLoader<ArtistDbObject>("getArtists").bind(this),
      { cache: false }
    );
  }

  get [PlatformName.Youtube]() {
    return YoutubeAPI;
  }

  get [PlatformName.Spotify]() {
    return SpotifyAPI;
  }

  async findTrack(id: string): Promise<TrackDbObject | null> {
    return this.trackLoader.load(id);
  }

  async findTracks(ids: string[]) {
    return (await this.trackLoader.loadMany(ids)).map((item) =>
      item instanceof Error ? null : item
    );
  }

  async crossFindTracks(
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

  async search(
    platform: PlatformName,
    query: string,
    authState?: AuthState | null
  ): Promise<TrackDbObject[]> {
    return this[platform].searchTracks(
      query,
      (authState?.provider === platform &&
        (await authState?.accessTokenPromise)) ||
        undefined
    );
  }

  // Artists
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  findArtist(id: string) {
    return this.artistLoader.load(id);
  }

  // Playlist
  async findPlaylist(id: string, authState?: AuthState | null) {
    const [platform, externalId] = id.split(":");
    return this[platform as PlatformName].getPlaylist(
      externalId,
      (authState?.provider === platform &&
        (await authState?.accessTokenPromise)) ||
        undefined
    );
  }

  async findPlaylistTracks(id: string, authState?: AuthState | null) {
    const [platform, externalId] = id.split(":");
    return this[platform as PlatformName].getPlaylistTracks(
      externalId,
      (authState?.provider === platform &&
        (await authState?.accessTokenPromise)) ||
        undefined
    );
  }

  async findMyPlaylist(me?: AuthState | null) {
    if (!me) throw new AuthenticationError("");
    return this[me.provider].getMyPlaylists(
      (await me?.accessTokenPromise) || ""
    );
  }

  async insertPlaylistTracks(
    me: AuthState | null,
    id: string,
    tracksIds: string[]
  ) {
    if (!me) throw new AuthenticationError("");
    const [platform, externalId] = id.split(":");
    return this[platform as PlatformName].insertPlaylistTracks(
      (await me?.accessTokenPromise) || "",
      externalId,
      tracksIds.map((trackId) => trackId.split(":")[1])
    );
  }

  async createPlaylist(
    me: AuthState | null,
    name: string,
    tracksIds: string[]
  ) {
    if (!me) throw new AuthenticationError("");

    const playlist = await this[me.provider].createPlaylist(
      (await me?.accessTokenPromise) || "",
      name
    );

    await this.insertPlaylistTracks(me, playlist.id, tracksIds);

    return playlist;
  }

  async findFeaturedPlaylists(me?: AuthState | null) {
    return this[me?.provider || PlatformName.Youtube].getFeaturedPlaylists(
      (await me?.accessTokenPromise) || ""
    );
  }
}
