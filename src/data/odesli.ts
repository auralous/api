import un from "undecim";
import { PlatformName } from "../graphql/graphql.gen.js";

type OdesliResponse =
  | {
      entityUniqueId: string;
      userCountry: string;
      pageUrl: string;
      linksByPlatform: {
        [platform in PlatformName]?: {
          entityUniqueId: string;
        };
      };
    }
  | { statusCode: 404 };

export class OdesliAPI {
  static client = un.create({ prefixURL: "https://api.song.link" });
  static getLinks(platformName: PlatformName, externalId: string) {
    return OdesliAPI.client
      .get(
        `/v1-alpha.1/links?platform=${platformName}&type=song` +
          `&id=${externalId}` +
          `&key=${process.env.SONGLINK_KEY}`
      )
      .json<OdesliResponse>();
  }
}
