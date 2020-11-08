import nc from "next-connect";
import passport from "passport";
import cors from "cors";
// @ts-ignore
import { graphqlUploadExpress } from "graphql-upload";
import { parse as parseQS } from "querystring";
import { session } from "./middleware/session";
import appAuth from "./auth/route";
import healthApp from "./health/route";
import { httpHandle } from "./gql";
import { ExtendedIncomingMessage } from "./types/common";

const app = nc<ExtendedIncomingMessage>();

app.use("/health", healthApp);

// compat parse url, passport not work properly without this
app.use((req, res, next) => {
  const idx = req.url.indexOf("?");
  req.query =
    idx !== -1
      ? (parseQS(req.url.substring(idx + 1)) as Record<string, string>)
      : null;
  req.path = idx !== -1 ? req.url.substring(0, idx) : req.url;
  next();
});

// cors for dev
if (process.env.NODE_ENV !== "production")
  app.use(
    cors({
      origin: process.env.APP_URI,
      methods: ["GET", "POST", "DELETE"],
      credentials: true,
    })
  );

app.use(session);

// passport
app.use(passport.initialize()).use(passport.session());

// auth subapp
app.use("/auth", appAuth);

app.post(
  "/graphql",
  (req, res, next) => {
    req.is = (type) => Boolean(req.headers["content-type"]?.includes(type));
    next();
  },
  graphqlUploadExpress({
    maxFiles: 2,
    maxFileSize: 20000000, // 20MB
  })
);

app.get("/graphql", (req, res, next) => {
  // setCacheControl API
  // default to no-store
  res.setHeader("cache-control", "no-store");
  req.setCacheControl = (maxAge, scope = "PUBLIC") => {
    res.setHeader("cache-control", `${scope.toLowerCase()}, max-age=${maxAge}`);
  };
  next();
});

app.all("/graphql", httpHandle);

export default app;
