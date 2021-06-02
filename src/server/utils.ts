import { parse as parseCookie } from "cookie";
import type { IncomingMessage, ServerResponse } from "http";
import { parse as parseQS } from "querystring";
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
export function cookieAndQuery(
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

  req.cookies = parseCookie(req.headers.cookie || "");
  next();
}

export function makeSetCacheControl(res: ServerResponse): SetCacheControl {
  return function setCacheControl(maxAge, scope = "PUBLIC") {
    res.setHeader("cache-control", `${scope.toLowerCase()}, max-age=${maxAge}`);
  };
}
