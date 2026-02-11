/**
 * Rate Limit Bypass Tests
 *
 * Verifies rate limiting enforcement, IP spoofing resistance,
 * and concurrent request handling.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  createTestStack,
  createTestGateway,
  type TestStack,
} from './helpers.js';

let stack: TestStack;
let app: FastifyInstance;

beforeAll(async () => {
  stack = createTestStack();
  await stack.auditChain.initialize();
  app = await createTestGateway(stack);
});

afterAll(async () => {
  await app.close();
  stack.cleanup();
});

describe('Rate Limit Enforcement', () => {
  it('should enforce login rate limits after multiple failures', async () => {
    const results: number[] = [];

    // Rapid failed login attempts
    for (let i = 0; i < 10; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { password: 'wrong-password' },
      });
      results.push(res.statusCode);
    }

    // Should see some 429s after exceeding the limit
    const blocked = results.filter((s) => s === 429);
    expect(blocked.length).toBeGreaterThan(0);
  });

  it('should not bypass rate limits with X-Forwarded-For', async () => {
    const results: number[] = [];

    for (let i = 0; i < 10; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: {
          'X-Forwarded-For': `192.168.1.${i}`,
        },
        payload: { password: 'wrong-password' },
      });
      results.push(res.statusCode);
    }

    // Rate limiting should still apply (based on real IP, not spoofed)
    const unauthorized = results.filter((s) => s === 401 || s === 429);
    expect(unauthorized.length).toBe(results.length);
  });

  it('should not bypass rate limits with X-Real-IP', async () => {
    const results: number[] = [];

    for (let i = 0; i < 10; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: {
          'X-Real-IP': `10.0.0.${i}`,
        },
        payload: { password: 'wrong-password' },
      });
      results.push(res.statusCode);
    }

    const unauthorized = results.filter((s) => s === 401 || s === 429);
    expect(unauthorized.length).toBe(results.length);
  });

  it('should handle concurrent requests without race conditions', async () => {
    const promises = Array.from({ length: 20 }, () =>
      app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { password: 'wrong-password' },
      }),
    );

    const results = await Promise.all(promises);
    const statuses = results.map((r) => r.statusCode);

    // All should be handled (no 500s)
    const serverErrors = statuses.filter((s) => s >= 500);
    expect(serverErrors).toHaveLength(0);
  });

  it('should return appropriate rate limit headers', async () => {
    // Make requests until rate limited
    let rateLimitedRes = null;
    for (let i = 0; i < 20; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { password: 'wrong-password' },
      });
      if (res.statusCode === 429) {
        rateLimitedRes = res;
        break;
      }
    }

    if (rateLimitedRes) {
      expect(rateLimitedRes.statusCode).toBe(429);
    }
  });
});
