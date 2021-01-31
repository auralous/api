import { Benzene, makeHandler } from "@benzene/http";
import { makeHandler as makeWSHandler } from "@benzene/ws";
import { formatError } from "graphql";
import * as Sentry from "@sentry/node";

import schema from "./graphql/schema";
import { StereoGraphQLError } from "./error/index";

import { MessageService } from "./services/message";
import { NowPlayingService } from "./services/nowPlaying";
import { QueueService } from "./services/queue";
import { StoryService } from "./services/story";
import { TrackService } from "./services/track";
import { UserService } from "./services/user";
import { FollowService } from "./services/follow";
import { NotificationService } from "./services/notification";

import type { Db } from "mongodb";
import type IORedis from "ioredis";
import type { PubSub } from "./lib/pubsub";
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
      user: MyGQLContext["user"];
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
    contextFn: ({ extra: { user, setCacheControl } }) => ({
      user,
      pubsub,
      services,
      setCacheControl,
    }),
  });

  // http

  const graphqlHTTP = makeHandler(GQL);

  // ws
  const graphqlWS = makeWSHandler(GQL);

  return { graphqlHTTP, graphqlWS };
}
