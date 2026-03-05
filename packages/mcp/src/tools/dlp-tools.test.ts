/**
 * DLP MCP Tools — unit tests
 *
 * Phase 136-F — DLP Egress Monitoring, MCP Tools, Dashboard
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerDlpTools } from './dlp-tools.js';
import type { CoreApiClient } from '../core-client.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { ToolMiddleware } from './index.js';

// ── Mock factories ────────────────────────────────────────────────────────────

function makeMockClient(overrides: Partial<CoreApiClient> = {}): CoreApiClient {
  return {
    get: vi.fn().mockResolvedValue({
      policies: [],
      total: 0,
    }),
    post: vi.fn().mockResolvedValue({
      classification: { level: 'internal', piiFound: [], keywordsFound: [] },
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
    exposeDlp: true,
    ...overrides,
  } as McpServiceConfig;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('dlp-tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers all 6 dlp_* tools without throwing', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() =>
      registerDlpTools(server, makeMockClient(), makeConfig(), noopMiddleware()),
    ).not.toThrow();
  });

  describe('disabled guard', () => {
    it('returns disabled error for all tools when exposeDlp is false', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerDlpTools(
        server,
        makeMockClient(),
        makeConfig({ exposeDlp: false } as any),
        noopMiddleware(),
      );

      const { globalToolRegistry } = await import('./tool-utils.js');

      const toolNames = [
        'dlp_classify',
        'dlp_scan',
        'dlp_policies',
        'dlp_egress_stats',
        'dlp_watermark_embed',
        'dlp_watermark_extract',
      ];
      for (const name of toolNames) {
        const handler = globalToolRegistry.get(name);
        expect(handler, `${name} should be registered`).toBeDefined();
        const result = await handler!({});
        expect(result.isError, `${name} should return isError=true when disabled`).toBe(true);
        expect((result.content[0] as { text: string }).text).toContain('disabled');
      }
    });
  });

  describe('dlp_classify', () => {
    it('calls POST /api/v1/security/dlp/classify', async () => {
      const client = makeMockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerDlpTools(server, client, makeConfig(), noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('dlp_classify');
      const result = await handler!({ text: 'hello world' });

      expect(client.post).toHaveBeenCalledWith(
        '/api/v1/security/dlp/classify',
        { text: 'hello world' },
      );
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.classification).toBeDefined();
    });
  });

  describe('dlp_scan', () => {
    it('calls POST /api/v1/security/dlp/scan', async () => {
      const client = makeMockClient({
        post: vi.fn().mockResolvedValue({
          scan: { allowed: true, action: 'allowed', findings: [] },
        }),
      });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerDlpTools(server, client, makeConfig(), noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('dlp_scan');
      const result = await handler!({ content: 'test data', destination: 'email' });

      expect(client.post).toHaveBeenCalledWith(
        '/api/v1/security/dlp/scan',
        { content: 'test data', destination: 'email' },
      );
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.scan.allowed).toBe(true);
    });
  });

  describe('dlp_policies', () => {
    it('calls GET /api/v1/security/dlp/policies', async () => {
      const client = makeMockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerDlpTools(server, client, makeConfig(), noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('dlp_policies');
      const result = await handler!({ active: true });

      expect(client.get).toHaveBeenCalledWith(
        '/api/v1/security/dlp/policies',
        { active: 'true' },
      );
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.policies).toBeDefined();
    });
  });

  describe('dlp_egress_stats', () => {
    it('calls GET /api/v1/security/dlp/egress/stats', async () => {
      const client = makeMockClient({
        get: vi.fn().mockResolvedValue({
          totalEvents: 42,
          byDestination: { email: 20, slack: 22 },
          byAction: { allowed: 40, blocked: 2 },
          byClassification: { internal: 30, confidential: 12 },
          period: { from: 1000, to: 2000 },
        }),
      });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerDlpTools(server, client, makeConfig(), noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('dlp_egress_stats');
      const result = await handler!({ from: 1000, to: 2000 });

      expect(client.get).toHaveBeenCalledWith(
        '/api/v1/security/dlp/egress/stats',
        { from: '1000', to: '2000' },
      );
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.totalEvents).toBe(42);
    });
  });

  describe('dlp_watermark_embed', () => {
    it('calls POST /api/v1/security/dlp/watermark/embed', async () => {
      const client = makeMockClient({
        post: vi.fn().mockResolvedValue({
          watermarked: 'text with watermark',
          contentId: 'doc-1',
          algorithm: 'unicode-steganography',
        }),
      });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerDlpTools(server, client, makeConfig(), noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('dlp_watermark_embed');
      const result = await handler!({ text: 'hello', contentId: 'doc-1' });

      expect(client.post).toHaveBeenCalledWith(
        '/api/v1/security/dlp/watermark/embed',
        { text: 'hello', contentId: 'doc-1' },
      );
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.watermarked).toBeDefined();
    });
  });

  describe('dlp_watermark_extract', () => {
    it('calls POST /api/v1/security/dlp/watermark/extract', async () => {
      const client = makeMockClient({
        post: vi.fn().mockResolvedValue({ found: true, payload: { userId: 'u1' } }),
      });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerDlpTools(server, client, makeConfig(), noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('dlp_watermark_extract');
      const result = await handler!({ text: 'watermarked text' });

      expect(client.post).toHaveBeenCalledWith(
        '/api/v1/security/dlp/watermark/extract',
        { text: 'watermarked text' },
      );
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.found).toBe(true);
    });

    it('returns error on API failure', async () => {
      const client = makeMockClient({
        post: vi.fn().mockRejectedValue(new Error('Service unavailable')),
      });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerDlpTools(server, client, makeConfig(), noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('dlp_watermark_extract');
      const result = await handler!({ text: 'test' });

      expect(result.isError).toBe(true);
      expect((result.content[0] as { text: string }).text).toContain('Service unavailable');
    });
  });
});
