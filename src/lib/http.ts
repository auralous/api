import type { IncomingMessage, ServerResponse } from "http";
import { parse as parseQS } from "querystring";
import type { ExtendedIncomingMessage } from "../types";

export function parseQuery<T extends Record<string, string>>(
  req: IncomingMessage
): T {
  if (!req.url) return {} as T;
  const idx = req.url.indexOf("?");
  return (idx !== -1 ? parseQS(req.url.substring(idx + 1)) : {}) as T;
}

export function rawBody(
  req: ExtendedIncomingMessage,
  res: ServerResponse,
  next: () => void
) {
  req.body = "";
  req.on("data", (chunk) => (req.body += chunk));
  req.on("end", next);
}
