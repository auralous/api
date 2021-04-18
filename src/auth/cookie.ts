import { CookieSerializeOptions, serialize } from "cookie";
import type { ServerResponse } from "http";

export function setCookie(
  res: ServerResponse,
  name: string,
  value: string | null,
  serializeOption?: CookieSerializeOptions
) {
  if (!value) {
    res.setHeader(
      "set-cookie",
      serialize(name, "", {
        ...serializeOption,
        maxAge: 0,
      })
    );
  } else {
    res.setHeader("set-cookie", serialize(name, value, serializeOption));
  }
}
