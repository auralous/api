import type { IncomingMessage } from "http";
import { parse as parseQS } from "querystring";

export function parseQuery<T extends Record<string, string>>(
  req: IncomingMessage
): T {
  if (!req.url) return {} as T;
  const idx = req.url.indexOf("?");
  return (idx !== -1 ? parseQS(req.url.substring(idx + 1)) : {}) as T;
}
