import { BaseService, ServiceInit } from "../base";
import YoutubeService from "./youtube";
import SpotifyService from "./spotify";

export class MusicService extends BaseService {
  youtube: YoutubeService;
  spotify: SpotifyService;
  constructor(private init: ServiceInit) {
    super(init);
    this.youtube = new YoutubeService(init);
    this.spotify = new SpotifyService(init);
  }
}
