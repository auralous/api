import { ServerResponse } from "http";
import { setCookie } from "./cookie.js";

export function setTokenToCookie(
  authCookieName: string,
  res: ServerResponse,
  token: string | null
) {
  setCookie(res, authCookieName, token, {
    domain: new URL(process.env.APP_URI as string).hostname,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 365 * 24 * 60 * 60,
    path: "/",
    sameSite: "lax" as const,
  });
}
