import type { P } from "pino";
import { IS_DEV } from "../utils/constant.js";

export const pinoOpts: P.LoggerOptions = {
  level: IS_DEV ? "trace" : "info",
  redact: !IS_DEV
    ? {
        paths: [
          "[*].options.headers.authorization",
          "[*].options.headers.Authorization",
          "[*].access_token",
        ],
      }
    : undefined,
  transport: IS_DEV
    ? {
        target: "pino-pretty",
        options: {
          levelFirst: true,
          translateTime: true,
          ignore: "pid,hostname",
        },
      }
    : undefined,
};
