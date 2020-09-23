import { ServerResponse } from "http";
import { ExtendedIncomingMessage } from "../types/common";

export default function compat(
  req: ExtendedIncomingMessage,
  res: ServerResponse & { redirect: any },
  next: () => void
) {
  req.is = function is(type: string) {
    return !!req.headers["content-type"]?.includes(type);
  };

  // res.redirect
  res.redirect = (code: string | number, path?: string) => {
    let location = path;
    let status = code;
    if (typeof code === "string") {
      status = 302;
      location = code;
    }
    res.writeHead(status as number, { Location: location }).end();
  };
  next();
}
