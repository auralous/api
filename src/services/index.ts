import { NowPlayingService } from "./nowPlaying";
import { QueueService } from "./queue";
import { RoomService } from "./room";
import { TrackService } from "./track";
import { ServiceContext } from "./types";
import { UserService } from "./user";

export default class Services {
  User = new UserService(this.context);
  Queue = new QueueService(this.context);
  Room = new RoomService(this.context, this.User);
  Track = new TrackService(this.context, this.User);
  NowPlaying = new NowPlayingService(this.context, this.Queue, this.Room);

  constructor(private context: ServiceContext) {}
}
