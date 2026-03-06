/**
 * Responsible AI Tools — unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerResponsibleAiTools } from './responsible-ai-tools.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';

function mockClient(overrides: Partial<CoreApiClient> = {}): CoreApiClient {
  return {
    get: vi.fn().mockResolvedValue({ entries: [] }),
    post: vi.fn().mockResolvedValue({ id: 'result-1' }),
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

describe('responsible-ai-tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers all 8 RAI tools without throwing', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerResponsibleAiTools(server, mockClient(), noopMiddleware())).not.toThrow();
  });

  describe('rai_cohort_analysis', () => {
    it('calls POST /api/v1/responsible-ai/cohort-analysis', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerResponsibleAiTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('rai_cohort_analysis')!;
      await handler({
        evalRunId: 'run-1',
        datasetId: 'ds-1',
        dimension: 'topic_category',
      });

      expect(client.post).toHaveBeenCalledWith(
        '/api/v1/responsible-ai/cohort-analysis',
        expect.objectContaining({ evalRunId: 'run-1', dimension: 'topic_category' })
      );
    });
  });

  describe('rai_fairness_report', () => {
    it('calls POST /api/v1/responsible-ai/fairness', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerResponsibleAiTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('rai_fairness_report')!;
      await handler({
        evalRunId: 'run-1',
        datasetId: 'ds-1',
        protectedAttribute: 'gender',
        threshold: 0.8,
      });

      expect(client.post).toHaveBeenCalledWith(
        '/api/v1/responsible-ai/fairness',
        expect.objectContaining({ protectedAttribute: 'gender' })
      );
    });
  });

  describe('rai_shap_explain', () => {
    it('calls POST /api/v1/responsible-ai/shap', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerResponsibleAiTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('rai_shap_explain')!;
      await handler({
        modelName: 'gpt-4',
        prompt: 'Hello',
        response: 'Hi there',
      });

      expect(client.post).toHaveBeenCalledWith(
        '/api/v1/responsible-ai/shap',
        expect.objectContaining({ modelName: 'gpt-4', prompt: 'Hello' })
      );
    });
  });

  describe('rai_provenance_query', () => {
    it('calls GET /api/v1/responsible-ai/provenance with filters', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerResponsibleAiTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('rai_provenance_query')!;
      await handler({
        datasetId: 'ds-1',
        userId: 'u-1',
        status: 'included',
        limit: 50,
      });

      expect(client.get).toHaveBeenCalledWith('/api/v1/responsible-ai/provenance', {
        datasetId: 'ds-1',
        userId: 'u-1',
        status: 'included',
        limit: '50',
      });
    });

    it('sends only limit when no filters', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerResponsibleAiTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('rai_provenance_query')!;
      await handler({ limit: 100 });

      expect(client.get).toHaveBeenCalledWith('/api/v1/responsible-ai/provenance', {
        limit: '100',
      });
    });
  });

  describe('rai_provenance_summary', () => {
    it('calls GET /api/v1/responsible-ai/provenance/summary/:datasetId', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerResponsibleAiTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('rai_provenance_summary')!;
      await handler({ datasetId: 'ds-1' });

      expect(client.get).toHaveBeenCalledWith('/api/v1/responsible-ai/provenance/summary/ds-1');
    });
  });

  describe('rai_user_provenance', () => {
    it('calls GET /api/v1/responsible-ai/provenance/user/:userId', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerResponsibleAiTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('rai_user_provenance')!;
      await handler({ userId: 'u-42' });

      expect(client.get).toHaveBeenCalledWith('/api/v1/responsible-ai/provenance/user/u-42');
    });
  });

  describe('rai_model_card', () => {
    it('calls POST /api/v1/responsible-ai/model-cards', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerResponsibleAiTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('rai_model_card')!;
      await handler({
        personalityId: 'p-1',
        modelName: 'gpt-4',
        riskClassification: 'limited',
      });

      expect(client.post).toHaveBeenCalledWith(
        '/api/v1/responsible-ai/model-cards',
        expect.objectContaining({ personalityId: 'p-1', modelName: 'gpt-4' })
      );
    });
  });

  describe('rai_model_card_markdown', () => {
    it('calls GET /api/v1/responsible-ai/model-cards/:id/markdown', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerResponsibleAiTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('rai_model_card_markdown')!;
      await handler({ id: 'mc-1' });

      expect(client.get).toHaveBeenCalledWith('/api/v1/responsible-ai/model-cards/mc-1/markdown');
    });
  });

  describe('error handling', () => {
    it('returns error when API call fails', async () => {
      const client = mockClient({
        post: vi.fn().mockRejectedValue(new Error('Server error')),
      });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerResponsibleAiTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('rai_cohort_analysis')!;
      const result = await handler({
        evalRunId: 'run-1',
        datasetId: 'ds-1',
        dimension: 'topic_category',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Server error');
    });
  });
});
