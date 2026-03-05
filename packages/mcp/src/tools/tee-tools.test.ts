/**
 * TEE MCP Tools — unit tests
 *
 * Phase 129-D — Confidential Computing TEE Full Stack
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTeeTools } from './tee-tools.js';
import type { CoreApiClient } from '../core-client.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { ToolMiddleware } from './index.js';

// ── Mock factories ────────────────────────────────────────────────────────────

function makeMockClient(overrides: Partial<CoreApiClient> = {}): CoreApiClient {
  return {
    get: vi.fn().mockResolvedValue({
      providers: ['anthropic', 'openai', 'gemini'],
      hardware: { sgxAvailable: false, sevAvailable: false, tpmAvailable: false, nvidiaCC: false },
      cache: { size: 0, providers: [] },
    }),
    post: vi.fn().mockResolvedValue({
      allowed: true,
      result: { provider: 'anthropic', verified: true, technology: null },
    }),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as CoreApiClient;
}

function noopMiddleware(): ToolMiddleware {
  return {
    rateLimiter: { check: () => ({ allowed: true }), reset: vi.fn(), wrap: vi.fn() },
    inputValidator: {
      validate: () => ({ valid: true, blocked: false, warnings: [], injectionScore: 0 }),
    },
    auditLogger: { log: vi.fn(), wrap: (_t: string, _a: unknown, fn: () => unknown) => fn() },
    secretRedactor: { redact: (v: unknown) => v },
  } as unknown as ToolMiddleware;
}

function makeConfig(overrides: Partial<McpServiceConfig> = {}): McpServiceConfig {
  return {
    exposeTee: true,
    ...overrides,
  } as McpServiceConfig;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('tee-tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers all 3 tee_* tools without throwing', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() =>
      registerTeeTools(server, makeMockClient(), makeConfig(), noopMiddleware()),
    ).not.toThrow();
  });

  describe('disabled guard', () => {
    it('returns disabled error for all tools when exposeTee is false', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerTeeTools(
        server,
        makeMockClient(),
        makeConfig({ exposeTee: false } as any),
        noopMiddleware(),
      );

      const { globalToolRegistry } = await import('./tool-utils.js');

      const toolNames = ['tee_providers', 'tee_status', 'tee_verify'];
      for (const name of toolNames) {
        const handler = globalToolRegistry.get(name);
        expect(handler, `${name} should be registered`).toBeDefined();
        const result = await handler!({ provider: 'anthropic' });
        expect(result.isError, `${name} should return isError=true when disabled`).toBe(true);
        expect((result.content[0] as { text: string }).text).toContain('disabled');
      }
    });
  });

  describe('tee_providers', () => {
    it('calls GET /api/v1/security/tee/providers', async () => {
      const client = makeMockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerTeeTools(server, client, makeConfig(), noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('tee_providers');
      const result = await handler!({});

      expect(client.get).toHaveBeenCalledWith('/api/v1/security/tee/providers');
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.providers).toContain('anthropic');
    });

    it('returns error on API failure', async () => {
      const client = makeMockClient({
        get: vi.fn().mockRejectedValue(new Error('Service unavailable')),
      });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerTeeTools(server, client, makeConfig(), noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('tee_providers');
      const result = await handler!({});

      expect(result.isError).toBe(true);
      expect((result.content[0] as { text: string }).text).toContain('Service unavailable');
    });
  });

  describe('tee_status', () => {
    it('calls GET /api/v1/security/tee/attestation/:provider', async () => {
      const client = makeMockClient({
        get: vi.fn().mockResolvedValue({
          provider: 'openai',
          verified: true,
          history: [],
        }),
      });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerTeeTools(server, client, makeConfig(), noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('tee_status');
      const result = await handler!({ provider: 'openai' });

      expect(client.get).toHaveBeenCalledWith('/api/v1/security/tee/attestation/openai');
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.provider).toBe('openai');
    });
  });

  describe('tee_verify', () => {
    it('calls POST /api/v1/security/tee/verify/:provider', async () => {
      const client = makeMockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerTeeTools(server, client, makeConfig(), noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('tee_verify');
      const result = await handler!({ provider: 'anthropic' });

      expect(client.post).toHaveBeenCalledWith(
        '/api/v1/security/tee/verify/anthropic',
        {},
      );
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.allowed).toBe(true);
    });

    it('encodes provider name in path', async () => {
      const client = makeMockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerTeeTools(server, client, makeConfig(), noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('tee_verify');
      await handler!({ provider: 'some provider' });

      expect(client.post).toHaveBeenCalledWith(
        '/api/v1/security/tee/verify/some%20provider',
        {},
      );
    });
  });
});
