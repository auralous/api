import { Client } from "undici";
import { PlatformName } from "../graphql/graphql.gen.js";
import { wrapAxios } from "../utils/undici.js";

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
  static client = wrapAxios(new Client("https://api.song.link"));
  static getLinks(platformName: PlatformName, externalId: string) {
    return OdesliAPI.client
      .get<OdesliResponse>(
        `/v1-alpha.1/links?platform=${platformName}&type=song` +
          `&id=${externalId}` +
          `&key=${process.env.SONGLINK_KEY}`
      )
      .then((res) => res.data);
  }
}
