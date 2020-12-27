import DataLoader from "dataloader";
import fastJson from "fast-json-stringify";
import fetch from "node-fetch";
import { URL } from "url";
import { SpotifyService, YoutubeService } from "./music";
import { CONFIG, REDIS_KEY } from "../lib/constant";
import { PlatformName, UserDbObject } from "../types/index";

import type { ServiceContext } from "./types";
import type {
  TrackDbObject,
  ArtistDbObject,
  OdesliResponse,
} from "../types/index";

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

  private _youtube?: YoutubeService;
  private _spotify?: SpotifyService;

  constructor(private context: ServiceContext) {
    this.loader = this.artistLoader = new DataLoader(
      (keys) => {
        // REDIS_CLUSTER: mget not work without hash tags
        return Promise.all(
          keys.map((key) => this.context.redis.get(key))
        ).then((results) => results.map((r) => (r ? JSON.parse(r) : null)));
      },
      { cache: false }
    );
  }

  get youtube() {
    if (this._youtube) return this._youtube;
    // We should avoid passing this i possible
    return (this._youtube = new YoutubeService((id) => this.findOrCreate(id)));
  }

  get spotify() {
    if (this._spotify) return this._spotify;
    return (this._spotify = new SpotifyService());
  }

  private find(id: string) {
    return this.loader.load(REDIS_KEY.track(id));
  }

  async findByUri(
    uri: URL,
    me?: UserDbObject | null
  ): Promise<TrackDbObject | TrackDbObject[] | null> {
    let externalId: null | string = null;
    for (const platform of Object.values(PlatformName)) {
      const platformService = this[platform];
      if ((externalId = platformService.getPlaylistIdFromUri(uri.href)))
        return platformService.getTracksByPlaylistId(
          externalId,
          (me?.oauth.provider === platform && me.oauth.accessToken) || undefined
        );
      else if ((externalId = platformService.getTrackIdFromUri(uri.href)))
        return this.findOrCreate(`${platform}:${externalId}`, me);
    }
    return null;
  }

  async save(id: string, track: TrackDbObject) {
    // update cache
    this.loader.prime(REDIS_KEY.track(id), track);
    await this.context.redis.set(REDIS_KEY.track(id), stringifyTrack(track));
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

    for (const platform of Object.values(PlatformName)) {
      cache[platform] = json.linksByPlatform[platform]?.entityUniqueId.split(
        "::"
      )[1];
      if (cache[platform]) {
        this.context.redis.hset(cacheKey, platform, cache[platform] as string);
      }
    }
    this.context.redis.expire(cacheKey, CONFIG.crossTrackMaxAge);

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
    await this.context.redis.set(keyId, stringifyArtist(artist));
  }

  async findOrCreateArtist(
    id: string,
    me?: UserDbObject | null
  ): Promise<ArtistDbObject | null> {
    let artist = await this.findArtist(id);
    if (!artist) {
      const [platform, externalId] = id.split(":");
      artist = await this[platform as PlatformName]?.getArtist(
        externalId,
        (me?.oauth.provider === platform && me.oauth.accessToken) || undefined
      );
      if (!artist) return null;
      await this.saveArtist(id, artist);
    }
    return artist;
  }
}
