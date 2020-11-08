import { NowPlayingService } from "./nowPlaying";
import { QueueService } from "./queue";
import { RoomService } from "./room";
import { TrackService } from "./track";
import { ServiceContext } from "./types";
import { UserService } from "./user";

interface AllServices {
  NowPlaying: NowPlayingService;
  Queue: QueueService;
  Room: RoomService;
  Track: TrackService;
  User: UserService;
}

export default class Services {
  cached: Partial<AllServices> = {};

  constructor(private context: ServiceContext) {}

  get User() {
    if (this.cached.User) return this.cached.User;
    return (this.cached.User = new UserService(this.context, this));
  }

  get NowPlaying() {
    if (this.cached.NowPlaying) return this.cached.NowPlaying;
    return (this.cached.NowPlaying = new NowPlayingService(this.context, this));
  }

  get Queue() {
    if (this.cached.Queue) return this.cached.Queue;
    return (this.cached.Queue = new QueueService(this.context));
  }

  get Room() {
    if (this.cached.Room) return this.cached.Room;
    return (this.cached.Room = new RoomService(this.context, this));
  }

  get Track() {
    if (this.cached.Track) return this.cached.Track;
    return (this.cached.Track = new TrackService(this.context, this));
  }
}
