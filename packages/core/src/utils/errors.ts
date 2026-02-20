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

export function sendError(reply: FastifyReply, statusCode: number, message: string) {
  return reply.code(statusCode).send({ error: httpStatusName(statusCode), message, statusCode });
}
