import { GraphQLError } from "graphql";
import pino from "pino";
import { UndecimError } from "undecim";
import { pinoOpts } from "../logger/options.js";
import { AuraError } from "./errors.js";

const ExpectedErrorMessages = [
  "PersistedQueryNotFound",
  "Must provide query string.",
];

export function isExpectedError(err: Error | GraphQLError | AuraError) {
  if (ExpectedErrorMessages.includes(err.message)) {
    return true;
  }
  if (err instanceof AuraError) {
    return true;
  }
  return false;
}

export async function augmentUndecimError(error: UndecimError) {
  const augmentedError = error as UndecimError & {
    responseBody?: string | Record<string, string>;
  };
  if (augmentedError.responseBody || !error.response?.body)
    return augmentedError;
  if (error.response) {
    augmentedError.responseBody = await error.response?.text();
    try {
      augmentedError.responseBody = JSON.parse(augmentedError.responseBody);
    } catch (e) {
      /* noop */
    }
  }
  Object.defineProperty(augmentedError.response, "body", {
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
    await augmentUndecimError(error);
  }
  if (!isExpectedError(error)) {
    errorLogger.error(error);
  } else {
    if (ExpectedErrorMessages.includes(error.message)) {
      return;
    }
    errorLogger.debug(error);
  }
}
