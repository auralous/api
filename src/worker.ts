import startQueueSkipper from "./worker/queue_skipper.js";
import startSessionEnder from "./worker/session_ender.js";
import startYoutubeData from "./worker/youtube_data.js";

await Promise.all([
  startSessionEnder(),
  startQueueSkipper(),
  startYoutubeData(),
]);
