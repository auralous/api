import DataLoader from "dataloader";
import fastJson from "fast-json-stringify";
import fetch from "node-fetch";
import { URL } from "url";
import { BaseService, ServiceInit } from "./base";
import { CONFIG, REDIS_KEY } from "../lib/constant";
import { OdesliResponse, PlatformName } from "../types/common";
import { TrackDbObject, ArtistDbObject } from "../types/db";

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

export class TrackService extends BaseService {
  private loader: DataLoader<string, TrackDbObject | null>;
  private artistLoader: DataLoader<string, ArtistDbObject | null>;
  constructor(options: ServiceInit) {
    super(options);
    this.loader = this.artistLoader = new DataLoader(
      (keys) => {
        // REDIS_CLUSTER: mget not work without hash tags
        return Promise.all(
          keys.map((key) => this.context.redis.get(key))
        ).then((results) => results.map((r) => (r ? JSON.parse(r) : null)));
      },
      { cache: options.cache }
    );
  }

  private find(id: string) {
    return this.loader.load(REDIS_KEY.track(id));
  }

  async findByUri(uri: URL): Promise<TrackDbObject | TrackDbObject[] | null> {
    let externalId: null | string = null;
    for (const platform of ["youtube", "spotify"] as const) {
      const platformService = this.services.Music[platform];
      if ((externalId = platformService.getPlaylistIdFromUri(uri.href)))
        return platformService.getTracksByPlaylistId(externalId);
      else if ((externalId = platformService.getTrackIdFromUri(uri.href)))
        return this.findOrCreate(`${platform}:${externalId}`);
    }
    return null;
  }

  async save(id: string, track: TrackDbObject) {
    // update cache
    this.loader.prime(REDIS_KEY.track(id), track);
    await this.context.redis.set(REDIS_KEY.track(id), stringifyTrack(track));
  }

  async findOrCreate(id: string): Promise<TrackDbObject | null> {
    let track = await this.find(id);
    if (!track) {
      const [platform, externalId] = id.split(":");
      if (platform === "youtube") {
        track = await this.services.Music.youtube.getTrack(externalId);
      } else if (platform === "spotify") {
        track = await this.services.Music.spotify.getTrack(externalId);
      }
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

    const cache = (await this.context.redis.hgetall(cacheKey)) as Record<
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

    cache.youtube = json.linksByPlatform.youtube?.entityUniqueId.split("::")[1];
    cache.spotify = json.linksByPlatform.spotify?.entityUniqueId.split("::")[1];

    // Save to cache with expiry
    cache.youtube &&
      this.context.redis.hset(cacheKey, "youtube", cache.youtube);
    cache.spotify &&
      this.context.redis.hset(cacheKey, "spotify", cache.spotify);
    this.context.redis.expire(cacheKey, CONFIG.crossTrackMaxAge);

    return cache;
  }

  search(platform: PlatformName, query: string): Promise<TrackDbObject[]> {
    return this.services.Music[platform].searchTracks(query);
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
    await this.context.redis.set(keyId, stringifyArtist(artist));
  }

  async findOrCreateArtist(id: string): Promise<ArtistDbObject | null> {
    let artist = await this.findArtist(id);
    if (!artist) {
      const [platform, externalId] = id.split(":");
      if (platform === "youtube")
        artist = await this.services.Music.youtube.getArtist(externalId);
      else if (platform === "spotify")
        artist = await this.services.Music.spotify.getArtist(externalId);
      if (artist) await this.saveArtist(id, artist);
    }
    return artist;
  }
}
