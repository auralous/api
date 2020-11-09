import crypto from "crypto";
import { Benzene, httpHandler, persistedQueryPresets } from "@benzene/server";
import { wsHandler } from "@benzene/ws";
import { formatError, getOperationAST } from "graphql";
import * as Sentry from "@sentry/node";

import schema from "./graphql/schema";
import { applySession } from "./middleware/session";
import { StereoGraphQLError } from "./error/index";
import Services from "./services";

import type { Db } from "mongodb";
import type IORedis from "ioredis";
import type { SubscriptionConnection } from "@benzene/ws";
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
  function buildContext(
    user: UserDbObject | null,
    isWs?: boolean
  ): MyGQLContext {
    return {
      user,
      redis,
      db,
      pubsub,
      services: new Services({ db, redis, pubsub, user, isWs }),
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

  const $onSubComplete = Symbol("conn#onSubComplete");

  const getOnSubCompleteObject = (
    t: SubscriptionConnection & {
      [$onSubComplete]?: { [key: string]: () => void };
    }
  ) => (t[$onSubComplete] = t[$onSubComplete] || {});

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
      // Since context only run once, cache will likely to be invalid
      const ctx = buildContext(user, true);
      // setCacheControl is irrelavant in ws
      ctx.setCacheControl = () => undefined;
      return ctx;
    },
    onStart(id, { document, contextValue, variableValues }) {
      // Register user appearance in room
      if (getOperationAST(document)?.name?.value === "onNowPlayingUpdated") {
        const onSubComplete = getOnSubCompleteObject(this);
        const context = contextValue as MyGQLContext;
        if (!context.user) return;
        context.services.Room.setUserPresence(
          variableValues?.id,
          context.user._id,
          true
        );
        onSubComplete[id] = () =>
          context.user &&
          context.services.Room.setUserPresence(
            variableValues?.id,
            context.user._id,
            false
          );
      }
    },
    onComplete(id) {
      const onSubComplete = getOnSubCompleteObject(this);
      onSubComplete[id]?.();
    },
  });

  return { httpHandle, wsHandle };
}
