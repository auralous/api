import { UserModel } from "../models/user";
import { PlaylistModel } from "../models/playlist";
import { QueueModel } from "../models/queue";
import { RoomModel } from "../models/room";
import { TrackModel } from "../models/track";
import { NowPlayingModel } from "../models/nowPlaying";
import { ServiceModel } from "../models/service";
import { BaseModel, ModelContext } from "../models/base";
import { UserDbObject } from "../types/db";
import { redis } from "../db/redis";
import { db } from "../db/mongo";
import { pubsub } from "../lib/pubsub";
import { MyGQLContext } from "../types/common";

export function buildContext({
  user,
  cache,
}: {
  user: UserDbObject | null;
  cache: boolean;
}): MyGQLContext {
  const serviceContext: ModelContext = {
    user,
    redis,
    db,
    pubsub,
  };
  const noCache = !cache;
  const services: BaseModel["services"] = {} as any;
  services.User = new UserModel({ context: serviceContext, noCache, services });
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
  services.Room = new RoomModel({ context: serviceContext, noCache, services });
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
  return {
    user,
    redis,
    db,
    pubsub,
    services,
  };
}
