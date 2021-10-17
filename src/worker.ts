import * as Sentry from "@sentry/node";
import { NowPlayingWorker } from "./services/nowPlayingWorker";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
});

await NowPlayingWorker.startWorker();
