/**
 * Security Test Helpers
 *
 * Re-exports the integration test helpers and adds security-specific utilities.
 */

export {
  createTestStack,
  createTestGateway,
  loginAndGetToken,
  noopLogger,
  TEST_SIGNING_KEY,
  TEST_TOKEN_SECRET,
  TEST_ADMIN_PASSWORD,
  type TestStack,
} from '../../packages/core/src/__integration__/helpers.js';

import type { FastifyInstance } from 'fastify';

export function authHeaders(token: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export async function injectGet(
  app: FastifyInstance,
  url: string,
  token?: string,
) {
  return app.inject({
    method: 'GET',
    url,
    headers: token ? authHeaders(token) : {},
  });
}

export async function injectPost(
  app: FastifyInstance,
  url: string,
  payload: unknown,
  token?: string,
) {
  return app.inject({
    method: 'POST',
    url,
    payload,
    headers: token ? authHeaders(token) : { 'Content-Type': 'application/json' },
  });
}
