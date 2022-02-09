import startQueueSkipper from "./worker/queue_skipper.js";
import startSessionEnder from "./worker/session_ender.js";

await startQueueSkipper();
await startSessionEnder();
