import { NowPlayingService } from "./nowPlaying";
import { QueueService } from "./queue";
import { RoomService } from "./room";
import { MusicService } from "./music";
import { TrackService } from "./track";
import { UserService } from "./user";

export interface AllServices {
  NowPlaying: NowPlayingService;
  Queue: QueueService;
  Room: RoomService;
  Track: TrackService;
  User: UserService;
  Music: MusicService;
}
