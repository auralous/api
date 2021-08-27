import * as Sentry from "@sentry/node";
import { GraphQLError } from "graphql";
import { UndecimError } from "undecim";
import { AuraError } from "./errors.js";

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

export async function undecimAddResponseBody(error: UndecimError) {
  const augmentedError = error as UndecimError & {
    responseBody: string | Record<string, string>;
  };
  if (augmentedError.responseBody) return augmentedError;
  augmentedError.responseBody = await error.response.text();
  try {
    augmentedError.responseBody = JSON.parse(augmentedError.responseBody);
  } catch (e) {
    /* noop */
  }
  return augmentedError;
}

export async function logError(
  error: Error | GraphQLError | AuraError | UndecimError
) {
  if (error instanceof UndecimError) {
    await undecimAddResponseBody(error);
  }
  if (!isExpectedError(error)) {
    console.error(error);
    Sentry.captureException(error);
  }
}
