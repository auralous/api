import { GraphQLError } from "graphql";

export class StereoGraphQLError extends GraphQLError {
  constructor(
    message: string,
    code?: string,
    extensions?: Record<string, unknown>
  ) {
    if (code) (extensions = extensions || {}).code = code;
    super(
      message,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      extensions
    );
  }
}

export class AuthenticationError extends StereoGraphQLError {
  constructor(message: string) {
    super(message, "UNAUTHENTICATED");
  }
}

export class UserInputError extends StereoGraphQLError {
  constructor(message: string, invalidArgs: string[]) {
    super(message, "FORBIDDEN", {
      invalidArgs,
    });
  }
}

export class ForbiddenError extends StereoGraphQLError {
  constructor(message: string) {
    super(message, "FORBIDDEN");
  }
}
