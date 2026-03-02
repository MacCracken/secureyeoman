/**
 * Intent MCP Tools — unit tests
 *
 * Phase 48 — Organizational Intent tools + writing access
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerIntentTools } from './intent-tools.js';
import type { CoreApiClient } from '../core-client.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { ToolMiddleware } from './index.js';

// ─── Mock factories ───────────────────────────────────────────────────────────

function makeMockClient(overrides: Partial<CoreApiClient> = {}): CoreApiClient {
  return {
    get: vi.fn().mockResolvedValue({ intents: [] }),
    post: vi.fn().mockResolvedValue({ intent: { id: 'i-1', name: 'Test' } }),
    put: vi.fn().mockResolvedValue({ intent: { id: 'i-1', name: 'Updated' } }),
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
    exposeOrgIntentTools: true,
    ...overrides,
  } as McpServiceConfig;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('intent-tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers all 9 intent_* tools without throwing', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() =>
      registerIntentTools(server, makeMockClient(), makeConfig(), noopMiddleware())
    ).not.toThrow();
  });

  describe('disabled guard', () => {
    it('returns disabled error for all tools when exposeOrgIntentTools is false', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerIntentTools(
        server,
        makeMockClient(),
        makeConfig({ exposeOrgIntentTools: false }),
        noopMiddleware()
      );

      const { globalToolRegistry } = await import('./tool-utils.js');

      const toolNames = [
        'intent_signal_read',
        'intent_list',
        'intent_get',
        'intent_get_active',
        'intent_create',
        'intent_update',
        'intent_activate',
        'intent_delete',
        'intent_enforcement_log',
      ];

      for (const name of toolNames) {
        const handler = globalToolRegistry.get(name);
        expect(handler, `${name} should be registered`).toBeDefined();
        const result = await handler!({
          signalId: 'test',
          id: 'test',
          name: 'test',
          doc: {},
          patch: {},
          limit: 100,
        });
        expect(result.isError, `${name} should return isError=true when disabled`).toBe(true);
        expect((result.content[0] as { text: string }).text).toContain('disabled');
      }
    });
  });

  describe('intent_signal_read', () => {
    it('calls GET /api/v1/intent/signals/:id/value', async () => {
      const client = makeMockClient({
        get: vi.fn().mockResolvedValue({
          signalId: 'cpu_usage',
          value: 72,
          threshold: 80,
          direction: 'below',
          status: 'healthy',
          message: 'CPU usage is healthy',
        }),
      });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerIntentTools(server, client, makeConfig(), noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('intent_signal_read');
      const result = await handler!({ signalId: 'cpu_usage' });

      expect(client.get).toHaveBeenCalledWith('/api/v1/intent/signals/cpu_usage/value');
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.signalId).toBe('cpu_usage');
      expect(parsed.status).toBe('healthy');
    });

    it('returns error on API failure', async () => {
      const client = makeMockClient({
        get: vi.fn().mockRejectedValue(new Error('Signal not found')),
      });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerIntentTools(server, client, makeConfig(), noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('intent_signal_read');
      const result = await handler!({ signalId: 'nonexistent' });

      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.error).toContain('Signal not found');
    });
  });

  describe('intent_list', () => {
    it('calls GET /api/v1/intent', async () => {
      const client = makeMockClient({
        get: vi.fn().mockResolvedValue({
          intents: [{ id: 'i-1', name: 'Production Intent', isActive: true }],
        }),
      });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerIntentTools(server, client, makeConfig(), noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('intent_list');
      const result = await handler!({});

      expect(client.get).toHaveBeenCalledWith('/api/v1/intent');
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.intents).toHaveLength(1);
    });
  });

  describe('intent_get', () => {
    it('calls GET /api/v1/intent/:id', async () => {
      const client = makeMockClient({
        get: vi.fn().mockResolvedValue({
          intent: { id: 'i-1', name: 'Test', doc: { goals: [] } },
        }),
      });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerIntentTools(server, client, makeConfig(), noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('intent_get');
      await handler!({ id: 'i-1' });

      expect(client.get).toHaveBeenCalledWith('/api/v1/intent/i-1');
    });
  });

  describe('intent_get_active', () => {
    it('calls GET /api/v1/intent/active', async () => {
      const client = makeMockClient({
        get: vi.fn().mockResolvedValue({
          intent: { id: 'i-2', name: 'Active', isActive: true },
        }),
      });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerIntentTools(server, client, makeConfig(), noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('intent_get_active');
      await handler!({});

      expect(client.get).toHaveBeenCalledWith('/api/v1/intent/active');
    });
  });

  describe('intent_create', () => {
    it('calls POST /api/v1/intent', async () => {
      const client = makeMockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerIntentTools(server, client, makeConfig(), noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('intent_create');
      await handler!({
        name: 'New Intent',
        doc: { goals: [{ id: 'g1', description: 'Ship faster' }] },
      });

      expect(client.post).toHaveBeenCalledWith(
        '/api/v1/intent',
        expect.objectContaining({
          name: 'New Intent',
          goals: [{ id: 'g1', description: 'Ship faster' }],
        })
      );
    });
  });

  describe('intent_update', () => {
    it('calls PUT /api/v1/intent/:id', async () => {
      const client = makeMockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerIntentTools(server, client, makeConfig(), noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('intent_update');
      await handler!({ id: 'i-1', patch: { name: 'Updated Name' } });

      expect(client.put).toHaveBeenCalledWith(
        '/api/v1/intent/i-1',
        expect.objectContaining({ name: 'Updated Name' })
      );
    });
  });

  describe('intent_activate', () => {
    it('calls POST /api/v1/intent/:id/activate', async () => {
      const client = makeMockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerIntentTools(server, client, makeConfig(), noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('intent_activate');
      await handler!({ id: 'i-1' });

      expect(client.post).toHaveBeenCalledWith('/api/v1/intent/i-1/activate', {});
    });
  });

  describe('intent_delete', () => {
    it('calls DELETE /api/v1/intent/:id', async () => {
      const client = makeMockClient({ delete: vi.fn().mockResolvedValue(undefined) });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerIntentTools(server, client, makeConfig(), noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('intent_delete');
      const result = await handler!({ id: 'i-1' });

      expect(client.delete).toHaveBeenCalledWith('/api/v1/intent/i-1');
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed).toMatchObject({ success: true, deleted: 'i-1' });
    });
  });

  describe('intent_enforcement_log', () => {
    it('calls GET /api/v1/intent/enforcement-log with filters', async () => {
      const client = makeMockClient({
        get: vi.fn().mockResolvedValue({
          entries: [{ id: 'e1', eventType: 'boundary_violated', rule: 'deny:api-keys' }],
        }),
      });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerIntentTools(server, client, makeConfig(), noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('intent_enforcement_log');
      await handler!({ eventType: 'boundary_violated', limit: 50 });

      expect(client.get).toHaveBeenCalledWith(
        '/api/v1/intent/enforcement-log',
        expect.objectContaining({ eventType: 'boundary_violated', limit: '50' })
      );
    });

    it('sends empty params when no filters provided', async () => {
      const client = makeMockClient({
        get: vi.fn().mockResolvedValue({ entries: [] }),
      });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerIntentTools(server, client, makeConfig(), noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('intent_enforcement_log');
      await handler!({});

      expect(client.get).toHaveBeenCalledWith('/api/v1/intent/enforcement-log', {});
    });
  });
});
