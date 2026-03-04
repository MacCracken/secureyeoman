/**
 * Extracts a readable message from an unknown error value.
 * Use in route catch blocks: `reply.code(400).send({ error: toErrorMessage(err) })`
 */
export function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

import type { FastifyReply } from 'fastify';

const HTTP_STATUS_NAMES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  402: 'Payment Required',
  409: 'Conflict',
  410: 'Gone',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

export function httpStatusName(code: number): string {
  return HTTP_STATUS_NAMES[code] ?? 'Error';
}

export function sendError(
  reply: FastifyReply,
  statusCode: number,
  message: string,
  opts?: { headers?: Record<string, string>; extra?: Record<string, unknown> }
) {
  // For 500 Internal Server Error, sanitize the message to avoid leaking internals.
  // Other 5xx codes (502, 503) use intentional status descriptions and are safe to surface.
  const safeMessage = statusCode === 500
    ? 'An internal error occurred'
    : message;
  if (opts?.headers) {
    for (const [k, v] of Object.entries(opts.headers)) {
      reply.header(k, v);
    }
  }
  return reply.code(statusCode).send({
    error: httpStatusName(statusCode),
    message: safeMessage,
    statusCode,
    ...opts?.extra,
  });
}
