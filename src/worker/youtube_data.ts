import pino from "pino";
import un from "undecim";
import { db } from "../data/mongo.js";
import { RecommendationDbObject } from "../data/types.js";
import { INTERNAL_YTAPI } from "../data/youtube.js";
import { PlatformName } from "../graphql/graphql.gen.js";
import { pinoOpts } from "../logger/options.js";

const logger = pino({
  ...pinoOpts,
  name: "worker/youtube_data",
});

const initialContinuation = `4qmFsgKBAhIMRkVtdXNpY19ob21lGvABQ0FONnJ3RkhUWEV6ZVhOcGVXcFFXVU5OWjBKaFltZHdjME5vYkRWa1JqbDNXVmRrYkZnelRuVlpXRUo2WVVjNU1GZ3pTbXhhTW14MlltMUdjMFZvT1VKTlIxcFBaVlY0ZUZnd01VdGhNVlpTVTJ4U1ZWZERNVVZXU0VrMVUwVkdhVTlZVGpaUFJrcHFSMmswUVVGSFZuVkJRVVpXVlhkQlFsWldUVUZCVVVKSFVsY3hNV015YkdwWU1taDJZbGRWUVVGUlFVSlJkMEZCUVZGQlFrRkJRVUpCVVZGQ2IyMTFWUzF3ZWtoMlVXdERRMEZC`;

const onSuccessRetryIn = 1 * 24 * 60 * 60 * 1000; // 1 day
const onFailureRetryIn = 1 * 60 * 60 * 1000; // 1 hour

async function getBrowses() {
  logger.info(`getBrowses: started`);
  try {
    const items: RecommendationDbObject[] = [];
    let continuation = initialContinuation;
    while (continuation) {
      const data = await un
        .post(
          `https://music.youtube.com/youtubei/v1/browse` +
            INTERNAL_YTAPI.params +
            `&continuation=${continuation}&type=next`,
          {
            data: { context: INTERNAL_YTAPI.context },
            headers: INTERNAL_YTAPI.headers,
          }
        )
        .json();
      for (const content of data.continuationContents.sectionListContinuation
        ?.contents as any[]) {
        const playlistIds = content.musicCarouselShelfRenderer.contents
          .filter(
            (innerContent: any) =>
              innerContent.musicTwoRowItemRenderer.navigationEndpoint
                .browseEndpoint?.browseEndpointContextSupportedConfigs
                .browseEndpointContextMusicConfig.pageType ===
              "MUSIC_PAGE_TYPE_PLAYLIST"
          )
          .map((innerContent: any) =>
            innerContent.musicTwoRowItemRenderer.navigationEndpoint.browseEndpoint.browseId.substring(
              2 // for some reason the actual id starts at 3rd character
            )
          );
        if (playlistIds.length > 0) {
          items.push({
            id: `youtube_music_browse_${items.length}`,
            title:
              content.musicCarouselShelfRenderer.header
                .musicCarouselShelfBasicHeaderRenderer.title.runs[0].text,
            playlistIds,
            platform: PlatformName.Youtube,
          });
        }
      }
      continuation =
        data.continuationContents.sectionListContinuation?.continuations?.[0]
          ?.nextContinuationData?.continuation;
    }

    logger.info(`getBrowses: found ${items.length} browse sections`);

    for (const item of items) {
      await db
        .collection("recommendations")
        .updateOne({ id: item.id }, { $set: item }, { upsert: true });
    }

    logger.info(`getBrowses: saved to database`);
    setTimeout(getBrowses, onSuccessRetryIn);
  } catch (e) {
    logger.info(e, `getBrowses: failed`);
    setTimeout(getBrowses, onFailureRetryIn);
  }
}

export default async function start() {
  await getBrowses();
}
