/**
 * Create GraphQL handlers for HTTP and WS
 */
import { makeAPQHandler } from "@benzene/extra";
import { Benzene, makeHandler } from "@benzene/http";
import { makeCompileQuery } from "@benzene/jit";
import { makeHandler as makeWSHandler } from "@benzene/ws";
import fastJson from "fast-json-stringify";
import { formatError } from "graphql";
import { pubsub } from "../data/pubsub.js";
import { logError } from "../error/utils.js";
import { FollowService } from "../services/follow.js";
import { MessageService } from "../services/message.js";
import { NotificationService } from "../services/notification.js";
import { NowPlayingService } from "../services/nowPlaying.js";
import { QueueService } from "../services/queue.js";
import { SessionService } from "../services/session.js";
import { TrackService } from "../services/track.js";
import { UserService } from "../services/user.js";
import schema from "./schema.js";
import type { MyGQLContext } from "./types.js";

const serviceContext = { loaders: {} };

interface BenzeneExtra {
  setCacheControl?: MyGQLContext["setCacheControl"];
  isWebSocket?: boolean;
  auth: MyGQLContext["auth"] | Promise<MyGQLContext["auth"]>; // promise only in WS. need better workaround
}

const services = {
  Message: new MessageService(serviceContext),
  NowPlaying: new NowPlayingService(serviceContext),
  Queue: new QueueService(serviceContext),
  Session: new SessionService(serviceContext),
  Track: new TrackService(serviceContext),
  User: new UserService(serviceContext),
  Follow: new FollowService(serviceContext),
  Notification: new NotificationService(serviceContext),
};

const GQL = new Benzene<MyGQLContext, BenzeneExtra>({
  schema,
  formatErrorFn(error) {
    logError(error.originalError || error);
    return formatError(error);
  },
  contextFn: async ({ extra: { auth, setCacheControl } }) => ({
    auth: auth ? ("then" in auth ? await auth : auth) : null,
    pubsub,
    services,
    setCacheControl,
  }),
  compileQuery: makeCompileQuery(),
});

// http
const apq = makeAPQHandler();
const graphqlHTTP = makeHandler(GQL, {
  onParams(params) {
    return apq(params);
  },
});

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

export { graphqlHTTP, graphqlWS, stringify };
