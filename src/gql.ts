import { Benzene, makeHandler } from "@benzene/http";
import { makeHandler as makeWSHandler } from "@benzene/ws";
import * as Sentry from "@sentry/node";
import fastJson from "fast-json-stringify";
import { formatError } from "graphql";
import type IORedis from "ioredis";
import type { Db } from "mongodb";
import { StereoGraphQLError } from "./error/index";
import schema from "./graphql/schema";
import type { PubSub } from "./lib/pubsub";
import { FollowService } from "./services/follow";
import { MessageService } from "./services/message";
import { NotificationService } from "./services/notification";
import { NowPlayingService } from "./services/nowPlaying";
import { QueueService } from "./services/queue";
import { StoryService } from "./services/story";
import { TrackService } from "./services/track";
import { UserService } from "./services/user";
import type { MyGQLContext } from "./types/index";

const EXPECTED_ERR_CODES = ["PERSISTED_QUERY_NOT_FOUND"];

export function buildGraphQLServer(
  db: Db,
  redis: IORedis.Cluster,
  pubsub: PubSub
) {
  const serviceContext = { redis, db, pubsub };
  const services = {
    Message: new MessageService(serviceContext),
    NowPlaying: new NowPlayingService(serviceContext),
    Queue: new QueueService(serviceContext),
    Story: new StoryService(serviceContext),
    Track: new TrackService(serviceContext),
    User: new UserService(serviceContext),
    Follow: new FollowService(serviceContext),
    Notification: new NotificationService(serviceContext),
  };

  const GQL = new Benzene<
    MyGQLContext,
    {
      setCacheControl?: MyGQLContext["setCacheControl"];
      user: MyGQLContext["user"] | Promise<MyGQLContext["user"]>; // promise only in WS. need better workaround
    }
  >({
    schema,
    formatErrorFn: (err) => {
      if (
        err.extensions?.code &&
        EXPECTED_ERR_CODES.includes(err.extensions.code)
      ) {
        // expected error
        return formatError(err);
      }
      if (err.originalError) {
        if (err.originalError instanceof StereoGraphQLError)
          // user error
          return formatError(err);
        else {
          // internal error
          Sentry.captureException(err);
          return formatError(err);
        }
      }
      // graphql error
      else return formatError(err);
    },
    contextFn: async ({ extra: { user, setCacheControl } }) => ({
      user: user ? ("then" in user ? await user : user) : null,
      pubsub,
      services,
      setCacheControl,
    }),
  });

  // http

  const graphqlHTTP = makeHandler(GQL);

  // ws
  const graphqlWS = makeWSHandler(GQL);

  // json stringify
  const stringify = fastJson({
    title: "GraphQL Response Schema",
    type: "object",
    properties: {
      data: {
        type: "object",
        additionalProperties: true,
        nullable: true,
      },
      errors: {
        type: "array",
        items: {
          type: "object",
          required: ["message"],
          properties: {
            message: { type: "string" },
            locations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  line: { type: "integer" },
                  column: { type: "integer" },
                },
              },
            },
            path: {
              type: "array",
              items: { type: "string" },
            },
            extensions: {
              type: "object",
              properties: {
                code: { type: "string" },
              },
              additionalProperties: true,
            },
          },
        },
      },
    },
  });

  return { GQL, graphqlHTTP, graphqlWS, stringify };
}
