import { BaseModel, ModelInit } from "../../models/base";
import YoutubeService from "./youtube";
import SpotifyService from "./spotify";

export class ServiceModel extends BaseModel {
  youtube: YoutubeService;
  spotify: SpotifyService;
  constructor(private init: ModelInit) {
    super(init);
    this.youtube = new YoutubeService(init);
    this.spotify = new SpotifyService(init);
  }

  reinitialize() {
    this.youtube = new YoutubeService(this.init);
    this.spotify = new SpotifyService(this.init);
  }
}
