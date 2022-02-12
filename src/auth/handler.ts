import nc from "next-connect";
import { invalidateToken } from "./auth.js";
import { handler as google } from "./google.js";
import { handler as spotify } from "./spotify.js";

const auth = nc();

/**
 * Auth subapps
 */
auth.use("/spotify", spotify);
auth.use("/google", google);

/**
 * Logout handler, send a POST request
 * to clear authentication cookie
 */
auth.post("/logout", async (req, res) => {
  if (req.headers.authorization)
    await invalidateToken(req.headers.authorization);
  res.writeHead(204).end();
});

export default auth;
