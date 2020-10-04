import { NowPlayingModel } from "./nowPlaying";
import { PlaylistModel } from "./playlist";
import { QueueModel } from "./queue";
import { RoomModel } from "./room";
import { TrackModel } from "./track";
import { UserModel } from "./user";
import { ServiceModel } from "./service";
import { MyGQLContext } from "../types/common";

export type ModelContext = Omit<MyGQLContext, "services" | "setCacheControl">;

export interface ModelInit {
  context: ModelContext;
  services: BaseModel["services"];
  noCache: boolean;
}

export class BaseModel {
  public context: ModelContext;
  public services: {
    NowPlaying: NowPlayingModel;
    Playlist: PlaylistModel;
    Queue: QueueModel;
    Room: RoomModel;
    Track: TrackModel;
    User: UserModel;
    Service: ServiceModel;
  };
  constructor({ context, services }: ModelInit) {
    this.context = context;
    this.services = services;
  }
}
