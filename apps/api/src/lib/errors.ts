/**
 * An error that maps straight to an HTTP status. Routes throw these; the error handler in index.ts
 * sends `status` with `{ error: message }`, so routes never format error responses themselves.
 */
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = 'Please log in') {
    super(401, message);
  }
}

export class ConflictError extends HttpError {
  constructor(message: string) {
    super(409, message);
  }
}

export class RateLimitError extends HttpError {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(429, 'Too many requests. Please wait a moment and try again.');
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
