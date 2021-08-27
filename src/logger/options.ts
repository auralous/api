import type { P } from "pino";
import { IS_DEV } from "../utils/constant.js";

export const pinoOpts: P.LoggerOptions = {
  prettyPrint: IS_DEV,
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
};
