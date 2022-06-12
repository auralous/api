import type { IncomingMessage } from "http";
import { parse as parseQS } from "querystring";
import { URL } from "url";

export function parseQuery<T extends Record<string, string>>(
  req: IncomingMessage
): T {
  if (!req.url) return {} as T;
  const idx = req.url.indexOf("?");
  return (idx !== -1 ? parseQS(req.url.substring(idx + 1)) : {}) as T;
}

export function isURL(str: string): boolean {
  try {
    new URL(str);
    return true;
  } catch (e) {
    return false;
  }
}
