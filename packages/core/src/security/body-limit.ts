/**
 * Request Body Size Enforcement
 *
 * Per-route body size limits enforced via a Fastify onRequest hook.
 * Checks the Content-Length header against route-specific thresholds
 * to reject oversized payloads early, before the body is parsed.
 *
 * Route categories:
 *   - /api/v1/auth/*         -> authBytes    (16 KB default)
 *   - /api/v1/chat/*         -> chatBytes    (512 KB default)
 *   - /api/v1/inline-complete/* -> chatBytes (512 KB default)
 *   - multipart requests     -> uploadBytes  (10 MB default)
 *   - everything else        -> defaultBytes (1 MB default)
 *
 * Requests without a Content-Length header are allowed through; Fastify's
 * built-in body limit handles streaming/chunked payloads natively.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { BodyLimitsConfig } from '@secureyeoman/shared';
import { sendError } from '../utils/errors.js';
import { getLogger, createNoopLogger, type SecureLogger } from '../logging/logger.js';

/**
 * Determine the applicable body size limit for a given request.
 */
function resolveLimit(
  url: string,
  contentType: string | undefined,
  config: BodyLimitsConfig
): number {
  // Auth routes — smallest limit (credentials are tiny)
  if (url.startsWith('/api/v1/auth/')) {
    return config.authBytes;
  }

  // Chat and inline-complete routes — medium limit
  if (url.startsWith('/api/v1/chat/') || url.startsWith('/api/v1/inline-complete/')) {
    return config.chatBytes;
  }

  // Multipart (file uploads) — largest limit
  if (contentType?.includes('multipart')) {
    return config.uploadBytes;
  }

  return config.defaultBytes;
}

/**
 * Create a Fastify onRequest hook that enforces per-route body size limits.
 */
export function createBodyLimitHook(
  config: BodyLimitsConfig
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  let logger: SecureLogger;
  try {
    logger = getLogger().child({ component: 'BodyLimit' });
  } catch {
    logger = createNoopLogger();
  }

  logger.info(
    {
      defaultBytes: config.defaultBytes,
      authBytes: config.authBytes,
      uploadBytes: config.uploadBytes,
      chatBytes: config.chatBytes,
    },
    'Body limit hook initialized'
  );

  return async function bodyLimitHook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const contentLength = request.headers['content-length'];
    if (!contentLength) {
      // No Content-Length header — let Fastify's native limit handle streaming
      return;
    }

    const bytes = Number(contentLength);
    if (Number.isNaN(bytes) || bytes < 0) {
      return;
    }

    const limit = resolveLimit(request.url, request.headers['content-type'], config);

    if (bytes > limit) {
      logger.warn(
        {
          url: request.url,
          contentLength: bytes,
          limit,
        },
        'Request body too large'
      );
      sendError(reply, 413, 'Request body too large');
      return;
    }
  };
}
