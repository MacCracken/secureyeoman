/**
 * Injection Attack Tests
 *
 * Verifies that SQL injection, XSS, command injection, and path traversal
 * payloads are properly rejected or sanitized.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  createTestStack,
  createTestGateway,
  loginAndGetToken,
  type TestStack,
} from './helpers.js';

let stack: TestStack;
let app: FastifyInstance;
let token: string;

beforeAll(async () => {
  stack = createTestStack();
  await stack.auditChain.initialize();
  app = await createTestGateway(stack);
  const tokens = await loginAndGetToken(app);
  token = tokens.accessToken;
});

afterAll(async () => {
  await app.close();
  stack.cleanup();
});

describe('SQL Injection', () => {
  const sqlPayloads = [
    "' OR '1'='1",
    "'; DROP TABLE users; --",
    "1 UNION SELECT * FROM sqlite_master",
    "admin'--",
    "' OR 1=1 --",
    "1; ATTACH DATABASE '/tmp/evil.db' AS evil",
  ];

  it.each(sqlPayloads)('should reject SQL payload: %s', async (payload) => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { password: payload },
    });
    // Should not return 200 (no auth bypass)
    expect(res.statusCode).not.toBe(200);
  });

  it('should not leak database errors in responses', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { password: "' OR '1'='1" },
    });
    const body = JSON.parse(res.body);
    expect(body.error).not.toMatch(/sqlite|sql|syntax/i);
  });
});

describe('XSS Prevention', () => {
  const xssPayloads = [
    '<script>alert("xss")</script>',
    '<img src=x onerror=alert(1)>',
    '"><script>document.cookie</script>',
    "javascript:alert('xss')",
    '<svg onload=alert(1)>',
  ];

  it.each(xssPayloads)('should not reflect XSS payload: %s', async (payload) => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { password: payload },
    });
    // Response should not contain unescaped script tags
    expect(res.body).not.toContain('<script>');
    expect(res.body).not.toContain('onerror=');
  });
});

describe('Command Injection', () => {
  const cmdPayloads = [
    '; cat /etc/passwd',
    '| ls -la',
    '`whoami`',
    '$(id)',
    '&& rm -rf /',
  ];

  it.each(cmdPayloads)('should not execute command payload: %s', async (payload) => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { password: payload },
    });
    expect(res.statusCode).not.toBe(200);
    expect(res.body).not.toContain('root:');
    expect(res.body).not.toContain('uid=');
  });
});

describe('Path Traversal', () => {
  const traversalPayloads = [
    '../../../etc/passwd',
    '..\\..\\..\\windows\\system32',
    '%2e%2e%2f%2e%2e%2f',
    '....//....//....//etc/passwd',
  ];

  it.each(traversalPayloads)('should reject path traversal: %s', async (payload) => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/tasks/${encodeURIComponent(payload)}`,
      headers: { Authorization: `Bearer ${token}` },
    });
    // Should not return file contents
    expect(res.body).not.toContain('root:x:0:0');
  });
});
