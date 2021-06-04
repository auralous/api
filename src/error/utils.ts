import { GraphQLError } from "graphql";
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
