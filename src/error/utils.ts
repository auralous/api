import { GraphQLError } from "graphql";
import pino from "pino";
import { UndecimError } from "undecim";
import { pinoOpts } from "../logger/options.js";
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
  Object.defineProperty(error.response, "body", {
    value: undefined,
    enumerable: false,
  });
  return augmentedError;
}

const errorLogger = pino(pinoOpts);

export async function logError(
  error: Error | GraphQLError | AuraError | UndecimError
) {
  if (error instanceof UndecimError) {
    await undecimAddResponseBody(error);
  }
  if (!isExpectedError(error)) {
    errorLogger.error(error);
  } else {
    errorLogger.debug({
      err: error,
    });
  }
}
