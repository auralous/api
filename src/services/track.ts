import DataLoader from "dataloader";
import fastJson from "fast-json-stringify";
import fetch from "node-fetch";
import { redis } from "../data/redis.js";
import { SpotifyAPI } from "../data/spotify.js";
import type {
  ArtistDbObject,
  TrackDbObject,
  UserDbObject,
} from "../data/types.js";
import { YoutubeAPI } from "../data/youtube.js";
import { AuthenticationError } from "../error/index.js";
import { PlatformName } from "../graphql/graphql.gen.js";
import { CONFIG, REDIS_KEY } from "../utils/constant.js";
import type { ServiceContext } from "./types.js";

type OdesliResponse =
  | {
      entityUniqueId: string;
      userCountry: string;
      pageUrl: string;
      linksByPlatform: {
        [platform in PlatformName]?: {
          entityUniqueId: string;
        };
      };
    }
  | { statusCode: 404 };

const stringifyTrack = fastJson({
  title: "Track",
  type: "object",
  properties: {
    id: { type: "string" },
    externalId: { type: "string" },
    platform: { type: "string" },
    duration: { type: "number" },
    title: { type: "string" },
    image: { type: "string" },
    artistIds: { type: "array", items: { type: "string" } },
    albumId: { type: "string" },
    url: { type: "string" },
  },
  required: [
    "id",
    "externalId",
    "platform",
    "duration",
    "title",
    "image",
    "artistIds",
    "albumId",
    "url",
  ],
});

const stringifyArtist = fastJson({
  title: "Artist",
  type: "object",
  properties: {
    id: { type: "string" },
    platform: { type: "string" },
    externalId: { type: "string" },
    name: { type: "string" },
    url: { type: "string" },
    image: { type: "string" },
  },
  required: ["id", "platform", "externalId", "name", "url", "image"],
});

export class TrackService {
  private loader: DataLoader<string, TrackDbObject | null>;
  private artistLoader: DataLoader<string, ArtistDbObject | null>;

  constructor(private context: ServiceContext) {
    this.loader = this.artistLoader = new DataLoader(
      (keys) => {
        // REDIS_CLUSTER: mget not work without hash tags
        return Promise.all(keys.map((key) => redis.get(key))).then((results) =>
          results.map((r) => (r ? JSON.parse(r) : null))
        );
      },
      { cache: false }
    );
  }

  get youtube() {
    return YoutubeAPI;
  }

  get spotify() {
    return SpotifyAPI;
  }

  private find(id: string) {
    return this.loader.load(REDIS_KEY.track(id));
  }

  async save(id: string, track: TrackDbObject) {
    // update cache
    this.loader.prime(REDIS_KEY.track(id), track);
    await redis.set(REDIS_KEY.track(id), stringifyTrack(track));
  }

  async findOrCreate(
    id: string,
    me?: UserDbObject | null
  ): Promise<TrackDbObject | null> {
    let track = await this.find(id);
    if (!track) {
      const [platform, externalId] = id.split(":");
      track = await this[platform as PlatformName]?.getTrack(
        externalId,
        (me?.oauth.provider === platform && me.oauth.accessToken) || undefined
      );
      if (!track) return null;
      await this.save(id, track);
    }
    return track || null;
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
    const res = await fetch(
      `https://api.song.link/v1-alpha.1/links?platform=${platformName}&type=song&id=${externalId}&key=${process.env.SONGLINK_KEY}`
    );
    const json: OdesliResponse = await res.json();

    if (!("linksByPlatform" in json)) return cache; // cache = {}

    for (const platform of Object.values(PlatformName)) {
      cache[platform] =
        json.linksByPlatform[platform]?.entityUniqueId.split("::")[1];
      if (cache[platform]) {
        redis.hset(cacheKey, platform, cache[platform] as string);
      }
    }
    redis.expire(cacheKey, CONFIG.crossTrackMaxAge);

    return cache;
  }

  search(
    platform: PlatformName,
    query: string,
    me?: UserDbObject | null
  ): Promise<TrackDbObject[]> {
    return this[platform].searchTracks(
      query,
      (me?.oauth.provider === platform && me.oauth.accessToken) || undefined
    );
  }

  // Artists
  private findArtist(id: string) {
    return this.artistLoader.load(REDIS_KEY.artist(id));
  }

  async saveArtist(id: string, artist: ArtistDbObject) {
    const keyId = REDIS_KEY.artist(id);
    // update cache
    this.artistLoader.prime(keyId, artist);
    // stringifyArtist also remove the extra fields
    await redis.set(keyId, stringifyArtist(artist));
  }

  async findOrCreateArtist(
    id: string,
    me?: UserDbObject | null
  ): Promise<ArtistDbObject | null> {
    let artist = await this.findArtist(id);
    if (!artist) {
      const [platform, externalId] = id.split(":");
      artist = await this[platform as PlatformName].getArtist(
        externalId,
        (me?.oauth.provider === platform && me.oauth.accessToken) || undefined
      );
      if (!artist) return null;
      await this.saveArtist(id, artist);
    }
    return artist;
  }

  // Playlist
  async findPlaylist(id: string, me?: UserDbObject | null) {
    const [platform, externalId] = id.split(":");
    return this[platform as PlatformName].getPlaylist(
      externalId,
      (me?.oauth.provider === platform && me.oauth.accessToken) || undefined
    );
  }

  async findPlaylistTracks(id: string, me?: UserDbObject | null) {
    const [platform, externalId] = id.split(":");
    return this[platform as PlatformName].getPlaylistTracks(
      externalId,
      (me?.oauth.provider === platform && me.oauth.accessToken) || undefined
    );
  }

  async findMyPlaylist(me?: UserDbObject | null) {
    if (!me) throw new AuthenticationError("");
    return this[me.oauth.provider].getMyPlaylists(me);
  }

  async insertPlaylistTracks(
    me: UserDbObject | null,
    id: string,
    tracksIds: string[]
  ) {
    if (!me) throw new AuthenticationError("");
    const [platform, externalId] = id.split(":");
    return this[platform as PlatformName].insertPlaylistTracks(
      me,
      externalId,
      tracksIds.map((trackId) => trackId.split(":")[1])
    );
  }

  async createPlaylist(
    me: UserDbObject | null,
    name: string,
    tracksIds: string[]
  ) {
    if (!me) throw new AuthenticationError("");

    const playlist = await this[me.oauth.provider].createPlaylist(me, name);

    await this.insertPlaylistTracks(me, playlist.id, tracksIds);

    return playlist;
  }

  async findFeaturedPlaylists(me?: UserDbObject | null) {
    return this[
      me?.oauth.provider || PlatformName.Youtube
    ].getFeaturedPlaylists(me?.oauth.accessToken || undefined);
  }
}
