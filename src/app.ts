import nc from "next-connect";
import passport from "passport";
import cors from "cors";
// @ts-ignore
import parser from "@polka/url";
// @ts-ignore
import { graphqlUploadExpress } from "graphql-upload";
import expressPlayground from "graphql-playground-middleware-express";
import { session } from "./middleware/session";
import appAuth from "./auth/route";
import compat from "./middleware/compat";
import { httpHandle } from "./gql";
import { ExtendedIncomingMessage } from "./types/common";

const app = nc<ExtendedIncomingMessage>();

app.use((req, res, next) => {
  const info = parser(req, true);
  req.query = info.query;
  req.path = info.pathname;
  next();
});
// cors
app.use(
  cors({
    origin: process.env.APP_URI,
    methods: ["GET", "POST", "DELETE"],
    credentials: true,
  })
);

// patch express helpers
app.use(compat);
app.use(session);

// passport
app.use(passport.initialize()).use(passport.session());

// auth subapp
app.use("/auth", appAuth);

app.post(
  "/graphql",
  graphqlUploadExpress({
    maxFiles: 2,
    maxFileSize: 20000000, // 20MB
  })
);

app.all(
  "/graphql",
  (req, res, next) => {
    if (req.method === "GET") res.setHeader("cache-control", "no-store");
    req.setCacheControl = (maxAge, scope = "PUBLIC") => {
      req.method === "GET" &&
        res.setHeader(
          "cache-control",
          `${scope.toLowerCase()}, max-age=${maxAge}`
        );
    };
    next();
  },
  httpHandle
);

if (process.env.NODE_ENV !== "production")
  app.get(
    "/playground",
    expressPlayground({
      endpoint: "/graphql",
      subscriptionEndpoint: "/websocket",
    })
  );

export default app;
