import { db } from "./mongo.js";
import { FeedConfig } from "./types.js";

export class DataConfigs {
  private collection = db.collection("configs");
  getFeedConfigs() {
    return this.collection.findOne<FeedConfig>({ _id: "feed" });
  }
}
