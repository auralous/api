import type { ErrorTKey } from "../i18n/i18n.js";

export class AuraError extends Error {
  name = "AuraError";
  constructor(
    message: string,
    public code: string = "AURA_ERROR",
    public extensions?: Record<string, unknown>
  ) {
    super(message);
    if (code) this.code = (this.extensions = this.extensions || {}).code = code;
  }
}

export class NotFoundError extends AuraError {
  name = "NotFoundError";
  constructor(
    private entity: "session" | "user" | "playlist",
    private entityContext: string
  ) {
    super(`Cannot found ${entity} (${entityContext})`, "NOT_FOUND_ERROR", {
      entity,
      entityContext,
      i18n: {
        key: "error.not_found",
        options: {
          entity,
          context: entityContext,
        },
      },
    });
  }
}

export class UnauthorizedError extends AuraError {
  name = "UnauthorizedError";
  constructor() {
    super("Not authorized", "UNAUTHORIZED_ERROR", {
      i18n: {
        key: "error.unauthorized",
      },
    });
  }
}

export class CustomError extends AuraError {
  name = "CustomError";
  constructor(key: ErrorTKey, context?: Record<string, unknown>) {
    super(key, "CUSTOM_ERROR", {
      i18n: {
        key,
        options: context,
      },
    });
  }
}

export class InvalidArgError extends AuraError {
  name = "InvalidArgError";
  constructor(arg: string, message: string) {
    super(`Invalid argument "${arg}": ${message}`, "INVALID_ARGUMENT_ERROR", {
      i18n: {
        key: "error.invalid_argument",
        options: {
          arg,
          message,
        },
      },
    });
  }
}

export class ForbiddenError extends AuraError {
  constructor(
    private entity: "session" | "user" | "playlist",
    private entityContext: string
  ) {
    super("Forbidden", "FORBIDDEN", {
      i18n: {
        key: "error.forbidden",
        options: {
          entity,
          context: entityContext,
        },
      },
    });
  }
}
