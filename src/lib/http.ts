import type { IncomingMessage } from "http";
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
  done: (body: string) => void
) {
  if (req.method !== "POST") return done("");
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => done(body));
}
