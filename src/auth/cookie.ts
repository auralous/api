import { CookieSerializeOptions, parse, serialize } from "cookie";
import type { ServerResponse } from "http";
import { URL } from "url";
import type { ExtendedIncomingMessage } from "../types";

const cookieName = "sid";

export function getTokenFromCookie(req: ExtendedIncomingMessage) {
  return parse(req.headers.cookie || "")[cookieName];
}

const serializeOption: CookieSerializeOptions = {
  domain: new URL(process.env.APP_URI as string).hostname,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  maxAge: 365 * 24 * 60 * 60,
  path: "/",
  sameSite: "lax" as const,
};

export function setTokenToCookie(res: ServerResponse, token: string | null) {
  if (!token) {
    res.setHeader(
      "set-cookie",
      serialize(cookieName, "", {
        ...serializeOption,
        maxAge: 0,
      })
    );
  } else {
    res.setHeader("set-cookie", serialize(cookieName, token, serializeOption));
  }
}
