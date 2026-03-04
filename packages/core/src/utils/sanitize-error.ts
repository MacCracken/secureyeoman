/**
 * Error sanitization for HTTP responses.
 *
 * In production: never expose raw error messages for 5xx errors.
 * In development: include original message in a debug field.
 */

/** Known application errors whose messages are safe to surface. */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function sanitizeErrorForClient(err: unknown): { message: string; code?: string; debug?: string } {
  const isDev = process.env.NODE_ENV !== 'production';
  const rawMessage = err instanceof Error ? err.message : String(err);

  // Known application errors — safe to expose
  if (err instanceof AppError) {
    return { message: err.message, code: err.code };
  }

  // In dev, include the real message as debug info
  if (isDev) {
    return { message: 'An internal error occurred', debug: rawMessage };
  }

  // Production: generic message only
  return { message: 'An internal error occurred' };
}
