import * as Sentry from "@sentry/node";
import { startServer } from "./server/server.js";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
});

await startServer();
