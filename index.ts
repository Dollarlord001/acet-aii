/**
 * Structured application errors.
 * Never leak stack traces or secrets to the client.
 */

export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "RATE_LIMITED"
  | "INTEGRATION_NOT_CONNECTED"
  | "APPROVAL_REQUIRED"
  | "APPROVAL_INVALID"
  | "TOOL_FAILED"
  | "ORCHESTRATOR_FAILED"
  | "TEMPORARY"
  | "INTERNAL";

export interface AppErrorPayload {
  code: ErrorCode;
  message: string;
  userMessage: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly userMessage: string;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(payload: AppErrorPayload) {
    super(payload.message);
    this.name = "AppError";
    this.code = payload.code;
    this.userMessage = payload.userMessage;
    this.retryable = payload.retryable;
    this.details = payload.details;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.userMessage,
      retryable: this.retryable,
      details: this.details,
    };
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

export function toUserError(err: unknown): AppErrorPayload {
  if (isAppError(err)) {
    return {
      code: err.code,
      message: err.message,
      userMessage: err.userMessage,
      retryable: err.retryable,
      details: err.details,
    };
  }
  if (err instanceof Error) {
    return {
      code: "INTERNAL",
      message: err.message,
      userMessage: "Something went wrong. Please try again.",
      retryable: true,
    };
  }
  return {
    code: "INTERNAL",
    message: "Unknown error",
    userMessage: "Something went wrong. Please try again.",
    retryable: true,
  };
}

export function unauthorized(message = "Authentication required") {
  return new AppError({
    code: "UNAUTHORIZED",
    message,
    userMessage: "Please sign in to continue.",
    retryable: false,
  });
}

export function forbidden(message = "Permission denied") {
  return new AppError({
    code: "FORBIDDEN",
    message,
    userMessage: "You do not have permission to perform this action.",
    retryable: false,
  });
}

export function notFound(resource = "Resource") {
  return new AppError({
    code: "NOT_FOUND",
    message: `${resource} not found`,
    userMessage: `${resource} could not be found.`,
    retryable: false,
  });
}

export function rateLimited(retryAfterMs?: number) {
  return new AppError({
    code: "RATE_LIMITED",
    message: "Rate limit exceeded",
    userMessage: "Too many requests. Please wait a moment and try again.",
    retryable: true,
    details: retryAfterMs ? { retryAfterMs } : undefined,
  });
}

export function integrationNotConnected(provider: string) {
  return new AppError({
    code: "INTEGRATION_NOT_CONNECTED",
    message: `${provider} is not connected`,
    userMessage: `${provider} is not connected for this organization. Connect it in Settings to use this capability.`,
    retryable: false,
    details: { provider },
  });
}

export function validationError(message: string, details?: Record<string, unknown>) {
  return new AppError({
    code: "VALIDATION",
    message,
    userMessage: message,
    retryable: false,
    details,
  });
}
