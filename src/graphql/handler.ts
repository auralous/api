/**
 * Create GraphQL handlers for HTTP and WS
 */
import { makeAPQHandler } from "@benzene/extra";
import { Benzene, makeHandler } from "@benzene/http";
import { makeCompileQuery } from "@benzene/jit";
import { makeHandler as makeWSHandler } from "@benzene/ws";
import fastJson from "fast-json-stringify";
import { formatError } from "graphql";
import { IncomingMessage, ServerResponse } from "http";
import { pubsub } from "../data/pubsub.js";
import { logError } from "../error/utils.js";
import { createContext } from "../services/_context.js";
import { ENV } from "../utils/constant.js";
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

const graphiqlHtml = `<!doctypehtml><style>body{height:100%;margin:0;width:100%;overflow:hidden}#graphiql{height:100vh}</style><script src=https://unpkg.com/react@16/umd/react.development.js crossorigin></script><script src=https://unpkg.com/react-dom@16/umd/react-dom.development.js crossorigin></script><link href=https://unpkg.com/graphiql/graphiql.min.css rel=stylesheet><div id=graphiql>Loading...</div><script src=https://unpkg.com/graphiql/graphiql.min.js></script><script src=/renderExample.js></script><script>function graphQLFetcher(graphQLParams) {
  return fetch(
    ${JSON.stringify(`${ENV.API_URI}/graphql`)},
    {
      method: 'post',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(graphQLParams),
      credentials: 'omit',
    },
  ).then(function (response) {
    return response.json().catch(function () {
      return response.text();
    });
  });
}

ReactDOM.render(
  React.createElement(GraphiQL, {
    fetcher: graphQLFetcher,
    defaultVariableEditorOpen: true,
  }),
  document.getElementById('graphiql'),
);</script>`;

export const graphiql = (req: IncomingMessage, res: ServerResponse) => {
  res.setHeader("content-type", "text/html").end(graphiqlHtml);
};
