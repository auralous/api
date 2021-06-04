import * as Sentry from "@sentry/node";
import { startServer } from "./server/server.js";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  beforeSend: (event, hint) => {
    console.error(hint?.originalException || hint?.syntheticException);
    return event;
  },
  debug: process.env.NODE_ENV !== "production",
});

await startServer();
