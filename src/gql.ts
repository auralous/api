import { GraphQL, httpHandler } from "@benzene/server";
import { PersistedAutomatic } from "@benzene/persisted";
import { wsHandler } from "@benzene/ws";

import { formatError, GraphQLError, getOperationAST } from "graphql";
import * as Sentry from "@sentry/node";
// @ts-ignore
import { hri } from "human-readable-ids";
import { buildContext } from "./graphql/context";
import schema from "./graphql/schema";
import { applySession } from "./middleware/session";
import { db } from "./db/mongo";
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
    const refId = hri.random();
    Sentry.withScope((scope) => {
      scope.setTag("referenceId", refId);
      Sentry.captureException(err);
    });
    return formatError(
      new GraphQLError(
        `Aw, Snap! Something went wrong. If needed, please contact support with reference ID: ${refId}.`
      )
    );
  },
  persisted: new PersistedAutomatic(),
});

export const httpHandle = httpHandler(GQL, {
  context: (req: ExtendedIncomingMessage): MyGQLContext => {
    const ctx = buildContext({ user: req.user || null, cache: true });
    (ctx as any).setCacheControl = req.setCacheControl;
    return ctx;
  },
});

const $roomStateSubId = Symbol("conn#roomStateSubId");

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
    const ctx = buildContext({ cache: false, user });
    // setCacheControl is irrelavant in ws
    ctx.setCacheControl = () => undefined;
    return ctx;
  },
  onStart(id, { document, contextValue, variableValues }) {
    if (getOperationAST(document)?.name?.value === "onNowPlayingUpdated") {
      (contextValue as MyGQLContext).services.User.setPresence({
        roomId: variableValues!.id,
      });
      (this as any)[$roomStateSubId] = id;
    }
  },
  onComplete(id) {
    if ((this as any)[$roomStateSubId] === id) {
      (this as any)[$roomStateSubId] = null;
      (this.context as MyGQLContext).services.User.setPresence({
        roomId: null,
      });
    }
  },
});
