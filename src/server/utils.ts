import type { GraphQLFormattedError } from "graphql";
import type { IncomingMessage, ServerResponse } from "http";
import type { Options } from "next-connect";
import { parse as parseQS } from "querystring";
import { logError } from "../error/utils.js";
import { t } from "../i18n/i18n.js";
import type { SetCacheControl } from "./types.js";

/**
 * Middlware to read the raw body and assign to req.body
 */
export function rawBody(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void
) {
  if (req.method !== "POST") return next();
  req.body = "";
  req.on("data", (chunk) => (req.body += chunk));
  req.on("end", next);
}

/**
 * Middleware to parse cookie and query string
 */
export function queryParser(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void
) {
  if (req.url) {
    const idx = req.url.indexOf("?");
    req.query = (
      !!idx && idx !== -1 ? parseQS(req.url.substring(idx + 1)) : {}
    ) as Record<string, string>;
  } else {
    req.query = {};
  }
  next();
}

export function makeSetCacheControl(res: ServerResponse): SetCacheControl {
  return function setCacheControl(maxAge, scope = "PUBLIC") {
    res.setHeader("cache-control", `${scope.toLowerCase()}, max-age=${maxAge}`);
  };
}

export const ncOptions: Options<IncomingMessage, ServerResponse> = {
  onError(err, req, res) {
    logError(err);
    return (
      (res.statusCode = err.status || 500) &&
      res.end(err.message || "Something went wrong")
    );
  },
};

export function errorWithTranslation(lng: string | undefined) {
  return (error: GraphQLFormattedError): GraphQLFormattedError => {
    const extensions = error.extensions as any;
    if (!extensions?.i18n) return error;
    return {
      ...error,
      message: t(extensions.i18n.key, {
        ...extensions.options,
        lng,
      }),
    };
  };
}
