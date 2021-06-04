export class AuraError extends Error {
  constructor(
    message: string,
    public code: string = "AU_ERROR",
    public extensions?: Record<string, unknown>
  ) {
    super(message);
    if (code) this.code = (this.extensions = this.extensions || {}).code = code;
  }
}

export class AuthenticationError extends AuraError {
  constructor(message: string) {
    super(message, "UNAUTHENTICATED");
  }
}

export class UserInputError extends AuraError {
  constructor(message: string, invalidArgs: string[]) {
    super(message, "FORBIDDEN", {
      invalidArgs,
    });
  }
}

export class ForbiddenError extends AuraError {
  constructor(message: string) {
    super(message, "FORBIDDEN");
  }
}
