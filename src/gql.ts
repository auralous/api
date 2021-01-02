import crypto from "crypto";
import { Benzene, httpHandler, persistedQueryPresets } from "@benzene/server";
import { wsHandler } from "@benzene/ws";
import { formatError } from "graphql";
import * as Sentry from "@sentry/node";

import schema from "./graphql/schema";
import { applySession } from "./middleware/session";
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
import type {
  UserDbObject,
  ExtendedIncomingMessage,
  MyGQLContext,
} from "./types/index";

const EXPECTED_ERR_CODES = ["PERSISTED_QUERY_NOT_FOUND"];

export function buildGraphQLServer(
  db: Db,
  redis: IORedis.Cluster,
  pubsub: PubSub
) {
  function buildContext(user: UserDbObject | null): MyGQLContext {
    const serviceContext = { redis, db, pubsub };
    return {
      user,
      redis,
      db,
      pubsub,
      services: {
        Message: new MessageService(serviceContext),
        NowPlaying: new NowPlayingService(serviceContext),
        Queue: new QueueService(serviceContext),
        Story: new StoryService(serviceContext),
        Track: new TrackService(serviceContext),
        User: new UserService(serviceContext),
        Follow: new FollowService(serviceContext),
        Notification: new NotificationService(serviceContext),
      },
    };
  }
  const GQL = new Benzene({
    schema,
    formatError: (err) => {
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
    persisted: persistedQueryPresets.automatic({
      sha256: (query) =>
        crypto.createHash("sha256").update(query).digest("hex"),
    }),
  });

  // http

  const httpHandle = httpHandler(GQL, {
    context: (req: ExtendedIncomingMessage): MyGQLContext => {
      const ctx = buildContext(req.user || null);
      ctx.setCacheControl = req.setCacheControl;
      return ctx;
    },
  });

  // ws

  const wsHandle = wsHandler(GQL, {
    context: async (
      socket,
      request: ExtendedIncomingMessage
    ): Promise<MyGQLContext> => {
      await applySession(request, {} as any);
      const _id = request.session?.passport?.user;
      const user = _id
        ? await db.collection<UserDbObject>("users").findOne({ _id })
        : null;
      const ctx = buildContext(user);
      // setCacheControl is irrelavant in ws
      ctx.setCacheControl = () => undefined;
      return ctx;
    },
  });

  return { httpHandle, wsHandle };
}
