import { Db } from "mongodb";
import Redis from "ioredis";
import { PubSub } from "../lib/pubsub";
import { UserDbObject } from "../types/db";
import { ServiceContext } from "./base";
import { NowPlayingService } from "./nowPlaying";
import { PlaylistService } from "./playlist";
import { QueueService } from "./queue";
import { RoomService } from "./room";
import { ServiceService } from "./service";
import { TrackService } from "./track";
import { UserService } from "./user";
import { AllServices } from "./types";

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
): AllServices {
  const noCache = !(opts?.cache || false);
  const serviceContext: ServiceContext = {
    user,
    redis,
    db,
    pubsub,
  };
  const services: AllServices = {} as any;
  services.User = new UserService({
    context: serviceContext,
    noCache,
    services,
  });
  services.Playlist = new PlaylistService({
    context: serviceContext,
    noCache,
    services,
  });
  services.Queue = new QueueService({
    context: serviceContext,
    noCache,
    services,
  });
  services.Room = new RoomService({
    context: serviceContext,
    noCache,
    services,
  });
  services.Track = new TrackService({
    context: serviceContext,
    noCache: false,
    services,
  }); // nothing can go wrong with TrackService
  services.NowPlaying = new NowPlayingService({
    context: serviceContext,
    noCache: false,
    services,
  });
  services.Service = new ServiceService({
    context: serviceContext,
    noCache: false,
    services,
  });
  return services;
}
