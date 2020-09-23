import pino from "pino";

const level = process.env.LOG_LEVEL;

export const npLogger = pino({
  name: "NowPlayingWorker",
  ...(process.env.NODE_ENV !== "production" && {
    prettyPrint: { colorize: true },
    prettifier: require("pino-pretty"),
  }),
  ...(level && { level }),
});
