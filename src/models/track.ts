import DataLoader from "dataloader";
import fastJson from "fast-json-stringify";
import fetch from "node-fetch";
import { URL } from "url";
import { BaseModel, ModelInit } from "./base";
import { REDIS_KEY } from "../lib/constant";
import { PlatformName } from "../types/common";
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

export class TrackModel extends BaseModel {
  private loader: DataLoader<string, TrackDbObject | null>;
  private artistLoader: DataLoader<string, ArtistDbObject | null>;
  constructor(options: ModelInit) {
    super(options);
    this.loader = this.artistLoader = new DataLoader(
      (keys) => {
        // REDIS_CLUSTER: mget not work without hash tags
        return Promise.all(
          keys.map((key) => this.context.redis.get(key))
        ).then((results) => results.map((r) => (r ? JSON.parse(r) : null)));
      },
      { cache: !options.noCache }
    );
  }

  private find(id: string) {
    return this.loader.load(REDIS_KEY.track(id));
  }

  async findByUri(inputUri: string) {
    let uri: URL;
    try {
      uri = new URL(inputUri);
    } catch (e) {
      return null;
    }

    let externalId: null | string = null;
    let platform: undefined | PlatformName;

    for (platform of ["youtube", "spotify"] as const) {
      if (
        (externalId = this.services.Service[platform].getTrackIdFromUri(
          uri.href
        ))
      )
        break;
    }
    if (!externalId || !platform) return null;
    return this.findOrCreate(`${platform}:${externalId}`);
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
        track = await this.services.Service.youtube.getTrack(externalId);
      } else if (platform === "spotify") {
        track = await this.services.Service.spotify.getTrack(externalId);
      }
      if (!track) return null;
      await this.save(id, track);
    }
    return track || null;
  }

  async findTrackFromAnotherPlatform(
    id: string,
    platform: PlatformName
  ): Promise<TrackDbObject | null> {
    const cacheKey = `cache:crossPlay:${id}:${platform}`;
    // Check the cache
    const cacheResult = await this.context.redis.get(cacheKey);

    // Found in cache
    if (cacheResult) return this.findOrCreate(cacheResult);

    const [originalPlatform, externalId] = id.split(":");

    // Same platform, the track we are looking for is itself
    if (originalPlatform === platform) return this.findOrCreate(id);

    const res = await fetch(
      `https://api.song.link/v1-alpha.1/links?platform=${originalPlatform}&type=song&id=${externalId}&key=${process.env.SONGLINK_KEY}`
    );

    const json = await res.json();

    const entityUniqueId = json.linksByPlatform?.[platform]?.entityUniqueId as
      | string
      | undefined;

    const trackId = entityUniqueId ? entityUniqueId.split("::")[1] : null;

    if (trackId) {
      const track = await this.findOrCreate(`${platform}:${trackId}`);
      this.context.redis.setex(
        cacheKey,
        24 * 60 * 60,
        `${platform}:${trackId}`
      );
      return track;
    }
    return null;
  }

  async search({
    platform,
    query,
  }: {
    platform: PlatformName;
    query: string;
  }): Promise<TrackDbObject[]> {
    if (platform === "youtube")
      return this.services.Service.youtube.searchTracks(query, {
        Track: this.services.Track,
      });
    else if (platform === "spotify")
      return this.services.Service.spotify.searchTracks(query);
    else return [];
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
        artist = await this.services.Service.youtube.getArtist(externalId);
      else if (platform === "spotify")
        artist = await this.services.Service.spotify.getArtist(externalId);
      if (artist) await this.saveArtist(id, artist);
    }
    return artist;
  }
}
