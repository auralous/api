import { Db } from "mongodb";
import Redis from "ioredis";
import { PubSub } from "../lib/pubsub";
import { UserDbObject } from "../types/db";
import { BaseModel, ModelContext } from "./base";
import { NowPlayingModel } from "./nowPlaying";
import { PlaylistModel } from "./playlist";
import { QueueModel } from "./queue";
import { RoomModel } from "./room";
import { ServiceModel } from "./service";
import { TrackModel } from "./track";
import { UserModel } from "./user";

export function buildServices(
  {
    db,
    redis,
    pubsub,
    user,
  }: {
    db: Db;
    redis: Redis.Cluster;
    user: UserDbObject | null;
    pubsub: PubSub;
  },
  opts?: { cache?: boolean }
): BaseModel["services"] {
  const noCache = !(opts?.cache || false);
  const serviceContext: ModelContext = {
    user,
    redis,
    db,
    pubsub,
  };
  const services: BaseModel["services"] = {} as any;
  services.User = new UserModel({
    context: serviceContext,
    noCache,
    services,
  });
  services.Playlist = new PlaylistModel({
    context: serviceContext,
    noCache,
    services,
  });
  services.Queue = new QueueModel({
    context: serviceContext,
    noCache,
    services,
  });
  services.Room = new RoomModel({
    context: serviceContext,
    noCache,
    services,
  });
  services.Track = new TrackModel({
    context: serviceContext,
    noCache: false,
    services,
  }); // nothing can go wrong with TrackModel
  services.NowPlaying = new NowPlayingModel({
    context: serviceContext,
    noCache: false,
    services,
  });
  services.Service = new ServiceModel({
    context: serviceContext,
    noCache: false,
    services,
  });
  return services;
}
