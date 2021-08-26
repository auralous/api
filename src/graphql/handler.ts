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
import { createContext } from "../services/_context.js";
import schema from "./schema.js";
import type { MyGQLContext } from "./types.js";

interface BenzeneExtra {
  setCacheControl?: MyGQLContext["setCacheControl"];
  isWebSocket?: boolean;
  auth: MyGQLContext["auth"] | Promise<MyGQLContext["auth"]>; // promise only in WS. need better workaround
}

const GQL = new Benzene<MyGQLContext, BenzeneExtra>({
  schema,
  formatErrorFn(error) {
    logError(error.originalError || error);
    return formatError(error);
  },
  contextFn: async ({ extra: { auth, setCacheControl } }) => ({
    setCacheControl,
    pubsub,
    ...createContext(await auth),
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
