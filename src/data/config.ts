import { db } from "./mongo.js";
import { FeedConfigDbObject } from "./types.js";

export class DataConfigs {
  private collection = db.collection("configs");
  getFeedConfigs() {
    return this.collection.findOne<FeedConfigDbObject>({ _id: "feed" });
  }
}
