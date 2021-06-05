import * as Sentry from "@sentry/node";
import { GraphQLError } from "graphql";
import { HTTPStatusError } from "undecim";
import { AuraError } from "./index.js";

const GRAPHQL_EXPECTED_ERR_CODES = ["PERSISTED_QUERY_NOT_FOUND"];

export function isExpectedError(err: Error | GraphQLError | AuraError) {
  if (err instanceof GraphQLError) {
    if (err.extensions?.code in GRAPHQL_EXPECTED_ERR_CODES) {
      return true;
    }
  }
  if (err instanceof AuraError) {
    return true;
  }
  return false;
}

export async function logError(error: Error | GraphQLError | AuraError) {
  if (error instanceof HTTPStatusError) {
    (error as HTTPStatusError & { responseBody: string }).responseBody =
      await error.response.text();
  }
  if (!isExpectedError(error)) {
    Sentry.captureException(error);
  } else {
    console.error(error);
  }
}
