import nc from "next-connect";
import { ncOptions } from "../server/utils.js";
import { setTokenToCookie } from "./auth.js";
import { handler as google } from "./google.js";
import { handler as spotify } from "./spotify.js";

const auth = nc(ncOptions);

/**
 * Auth subapps
 */
auth.use("/spotify", spotify);
auth.use("/google", google);

/**
 * Logout handler, send a POST request
 * to clear authentication cookie
 */
auth.post("/logout", (req, res) => {
  setTokenToCookie(res, null);
  res.writeHead(204).end();
});

export default auth;
