import crypto from "crypto";
import { GraphQL, httpHandler, persistedQueryPresets } from "@benzene/server";
import { wsHandler, SubscriptionConnection } from "@benzene/ws";

import { formatError, getOperationAST } from "graphql";
import * as Sentry from "@sentry/node";
// @ts-ignore
import { buildContext } from "./graphql/context";
import schema from "./graphql/schema";
import { applySession } from "./middleware/session";
import { db } from "./db/mongo";
import { redis } from "./db/redis";
import { pubsub } from "./lib/pubsub";
import { ExtendedIncomingMessage, MyGQLContext } from "./types/common";
import { UserDbObject } from "./types/db";

const USER_ERR_CODES = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "BAD_USER_INPUT",
  "PERSISTED_QUERY_NOT_FOUND",
];

const GQL = new GraphQL({
  schema,
  formatError: (err) => {
    if (err.extensions?.code && USER_ERR_CODES.includes(err.extensions.code)) {
      // This is a user error
      return formatError(err);
    }
    if (err.message === "Must provide query string.") return formatError(err);
    // This is a internal error
    Sentry.captureException(err);
    return formatError(err);
  },
  persisted: persistedQueryPresets.automatic({
    sha256: (query) => crypto.createHash("sha256").update(query).digest("hex"),
  }),
});

export const httpHandle = httpHandler(GQL, {
  context: (req: ExtendedIncomingMessage): MyGQLContext => {
    const ctx = buildContext({
      user: req.user || null,
      cache: true,
      db,
      redis,
      pubsub,
    });
    (ctx as any).setCacheControl = req.setCacheControl;
    return ctx;
  },
});

const $onSubComplete = Symbol("conn#onSubComplete");

const getOnSubCompleteObject = (
  t: SubscriptionConnection & {
    [$onSubComplete]: { [key: string]: () => void };
  }
) => (t[$onSubComplete] = t[$onSubComplete] || {});

export const wsHandle = wsHandler(GQL, {
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
    const ctx = buildContext({ cache: false, user, db, redis, pubsub });
    // setCacheControl is irrelavant in ws
    ctx.setCacheControl = () => undefined;
    return ctx;
  },
  onStart(id, { document, contextValue, variableValues }) {
    // Register user appearance in room
    if (getOperationAST(document)?.name?.value === "onNowPlayingUpdated") {
      const onSubComplete = getOnSubCompleteObject(this as any);
      const [resourceType, resourceId] = variableValues?.id.split(":");
      if (resourceType !== "room") return;
      const context = contextValue as MyGQLContext;
      if (!context.user) return;
      context.services.Room.setUserPresence(resourceId, context.user._id, true);
      onSubComplete[id] = () =>
        context.user &&
        context.services.Room.setUserPresence(
          resourceId,
          context.user._id,
          false
        );
    }
  },
  onComplete(id) {
    const onSubComplete = getOnSubCompleteObject(this as any);
    onSubComplete[id]?.();
  },
});
