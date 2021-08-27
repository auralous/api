import { isAsyncIterator, parseGraphQLBody } from "@benzene/http";
import cors from "cors";
import nc from "next-connect";
import { getAuthFromRequest } from "../auth/auth.js";
import auth from "../auth/handler.js";
import { redis } from "../data/redis.js";
import {
  graphqlHTTP,
  stringify as graphqlStringify,
} from "../graphql/handler.js";
import {
  errorWithTranslation,
  makeSetCacheControl,
  ncOptions,
  queryParser,
  rawBody,
} from "./utils.js";

const isDev = process.env.NODE_ENV !== "production";

const app = nc(ncOptions);

/**
 * Health Endpoint to check MongoDB and Redis statuses
 */
app.get("/health", (req, res) => {
  const mongoOk = true;
  const redisStatus = redis.status;
  res.setHeader("content-type", "application/json");
  res.statusCode = mongoOk && redisStatus === "ready" ? 200 : 500;
  res.end(
    JSON.stringify({
      mongo: mongoOk,
      redis: redisStatus,
    })
  );
});

if (isDev) {
  // For dev env, we setup cors configuration.
  // However, in production, reverse proxy has already handled it
  app.use(
    cors({
      origin: process.env.APP_URI,
      methods: ["GET", "POST"],
      credentials: true,
    })
  );
}

/**
 * Middleware
 */
app.use(rawBody, queryParser);

/**
 * GraphQL Handler for HTTP requests
 */
app.all("/graphql", (req, res) => {
  return graphqlHTTP(
    {
      headers: req.headers as Record<string, string>,
      method: req.method as string,
      body: parseGraphQLBody(req.body, req.headers["content-type"]),
      query: req.query,
    },
    {
      auth: getAuthFromRequest(req),
      setCacheControl:
        req.method === "GET" ? makeSetCacheControl(res) : undefined,
    }
  ).then((result) => {
    if (!isAsyncIterator(result.payload)) {
      if (result.payload.errors) {
        result.payload.errors = result.payload.errors.map(
          errorWithTranslation(req.headers["accept-language"])
        );
      }
    }
    res
      .writeHead(result.status, result.headers)
      .end(graphqlStringify(result.payload));
  });
});

app.use("/auth", auth);

export default app;
