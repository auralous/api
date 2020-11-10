import { NowPlayingService } from "./nowPlaying";
import { QueueService } from "./queue";
import { RoomService } from "./room";
import { TrackService } from "./track";
import { UserService } from "./user";

import type { ServiceContext } from "./types";

export default class Services {
  // These three or deps-free and safe to use
  User = new UserService(this.context);
  Queue = new QueueService(this.context);
  Track = new TrackService(this.context);
  // These three depends on others and can be unsafe
  Room = new RoomService(this.context, this.User);
  NowPlaying = new NowPlayingService(this.context, this.Queue, this.Room);

  constructor(private context: ServiceContext) {}
}
