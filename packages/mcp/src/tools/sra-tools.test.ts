/**
 * SRA Tools — unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSraTools } from './sra-tools.js';
import type { CoreApiClient } from '../core-client.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { ToolMiddleware } from './index.js';

function mockClient(overrides: Partial<CoreApiClient> = {}): CoreApiClient {
  return {
    get: vi.fn().mockResolvedValue({ blueprints: [] }),
    post: vi.fn().mockResolvedValue({ id: 'bp-1', name: 'Test' }),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
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

function makeConfig(overrides: Record<string, unknown> = {}): McpServiceConfig {
  return {
    exposeSra: true,
    ...overrides,
  } as unknown as McpServiceConfig;
}

describe('sra-tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers all 7 SRA tools without throwing', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() =>
      registerSraTools(server, mockClient(), makeConfig(), noopMiddleware())
    ).not.toThrow();
  });

  describe('disabled guard', () => {
    it('returns disabled error for all tools when exposeSra is false', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerSraTools(server, mockClient(), makeConfig({ exposeSra: false }), noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const toolNames = [
        'sra_list_blueprints',
        'sra_get_blueprint',
        'sra_create_blueprint',
        'sra_assess',
        'sra_get_assessment',
        'sra_compliance_map',
        'sra_summary',
      ];

      for (const name of toolNames) {
        const handler = globalToolRegistry.get(name);
        expect(handler, `${name} should be registered`).toBeDefined();
        const result = await handler!({
          id: 'test', name: 'test', provider: 'aws', framework: 'aws_sra',
          blueprintId: 'bp-1', description: 'test',
        });
        expect(result.isError, `${name} should return isError=true when disabled`).toBe(true);
        expect((result.content[0] as { text: string }).text).toContain('disabled');
      }
    });
  });

  describe('sra_list_blueprints', () => {
    it('calls GET /api/v1/security/sra/blueprints with filters', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerSraTools(server, client, makeConfig(), noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('sra_list_blueprints')!;
      await handler({ provider: 'aws', framework: 'aws_sra', status: 'active' });

      expect(client.get).toHaveBeenCalledWith('/api/v1/security/sra/blueprints', {
        provider: 'aws',
        framework: 'aws_sra',
        status: 'active',
      });
    });

    it('sends empty params when no filters', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerSraTools(server, client, makeConfig(), noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('sra_list_blueprints')!;
      await handler({});

      expect(client.get).toHaveBeenCalledWith('/api/v1/security/sra/blueprints', {});
    });
  });

  describe('sra_get_blueprint', () => {
    it('calls GET /api/v1/security/sra/blueprints/:id', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerSraTools(server, client, makeConfig(), noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('sra_get_blueprint')!;
      await handler({ id: 'bp-123' });

      expect(client.get).toHaveBeenCalledWith('/api/v1/security/sra/blueprints/bp-123');
    });
  });

  describe('sra_create_blueprint', () => {
    it('calls POST /api/v1/security/sra/blueprints', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerSraTools(server, client, makeConfig(), noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('sra_create_blueprint')!;
      await handler({
        name: 'Custom BP',
        description: 'A blueprint',
        provider: 'aws',
        framework: 'custom',
        controls: [{ id: 'c1', domain: 'iam', title: 'MFA', description: 'Enable MFA' }],
      });

      expect(client.post).toHaveBeenCalledWith('/api/v1/security/sra/blueprints', {
        name: 'Custom BP',
        description: 'A blueprint',
        provider: 'aws',
        framework: 'custom',
        controls: [{ id: 'c1', domain: 'iam', title: 'MFA', description: 'Enable MFA' }],
      });
    });
  });

  describe('sra_assess', () => {
    it('calls POST /api/v1/security/sra/assessments', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerSraTools(server, client, makeConfig(), noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('sra_assess')!;
      await handler({
        blueprintId: 'bp-1',
        name: 'Q1 Assessment',
        infrastructureDescription: 'AWS prod',
      });

      expect(client.post).toHaveBeenCalledWith('/api/v1/security/sra/assessments', {
        blueprintId: 'bp-1',
        name: 'Q1 Assessment',
        infrastructureDescription: 'AWS prod',
      });
    });
  });

  describe('sra_get_assessment', () => {
    it('calls GET /api/v1/security/sra/assessments/:id', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerSraTools(server, client, makeConfig(), noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('sra_get_assessment')!;
      await handler({ id: 'a-1' });

      expect(client.get).toHaveBeenCalledWith('/api/v1/security/sra/assessments/a-1');
    });
  });

  describe('sra_compliance_map', () => {
    it('calls GET with domain and framework filters', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerSraTools(server, client, makeConfig(), noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('sra_compliance_map')!;
      await handler({ domain: 'network_security', framework: 'NIST CSF' });

      expect(client.get).toHaveBeenCalledWith('/api/v1/security/sra/compliance-mappings', {
        domain: 'network_security',
        framework: 'NIST CSF',
      });
    });
  });

  describe('sra_summary', () => {
    it('calls GET /api/v1/security/sra/summary', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerSraTools(server, client, makeConfig(), noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('sra_summary')!;
      await handler({});

      expect(client.get).toHaveBeenCalledWith('/api/v1/security/sra/summary');
    });
  });

  describe('error handling', () => {
    it('returns error when API call fails', async () => {
      const client = mockClient({
        get: vi.fn().mockRejectedValue(new Error('Connection refused')),
      });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerSraTools(server, client, makeConfig(), noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('sra_summary')!;
      const result = await handler({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Connection refused');
    });
  });
});
