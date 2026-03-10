import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAuditResources } from './audit-resources.js';
import type { CoreApiClient } from '../core-client.js';

type ResourceHandler = () => Promise<{
  contents: { uri: string; mimeType: string; text: string }[];
}>;

function mockClient(overrides: Partial<CoreApiClient> = {}): CoreApiClient {
  return {
    get: vi.fn().mockResolvedValue({ entries: [{ id: '1', event: 'login' }] }),
    post: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    healthCheck: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as unknown as CoreApiClient;
}

function captureResourceHandlers(client: CoreApiClient): Record<string, ResourceHandler> {
  const server = new McpServer({ name: 'test', version: '1.0.0' });
  const handlers: Record<string, ResourceHandler> = {};

  vi.spyOn(server, 'resource').mockImplementation(
    (name: string, _uri: unknown, _meta: unknown, handler: unknown) => {
      handlers[name] = handler as ResourceHandler;
      return server as any;
    }
  );

  registerAuditResources(server, client);
  return handlers;
}

describe('audit-resources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers audit-recent and audit-stats resources', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerAuditResources(server, mockClient())).not.toThrow();
  });

  describe('audit-recent', () => {
    it('calls GET /api/v1/audit with limit=100 and returns JSON', async () => {
      const client = mockClient();
      const handlers = captureResourceHandlers(client);

      const result = await handlers['audit-recent']();

      expect(client.get).toHaveBeenCalledWith('/api/v1/audit', { limit: '100' });
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].uri).toBe('secureyeoman://audit/recent');
      expect(result.contents[0].mimeType).toBe('application/json');
      const parsed = JSON.parse(result.contents[0].text);
      expect(parsed.entries).toHaveLength(1);
    });
  });

  describe('audit-stats', () => {
    it('calls GET /api/v1/audit/stats and returns JSON on success', async () => {
      const client = mockClient({
        get: vi.fn().mockImplementation((url: string) => {
          if (url === '/api/v1/audit/stats') {
            return Promise.resolve({ totalEntries: 500, chainValid: true });
          }
          return Promise.resolve({});
        }),
      });
      const handlers = captureResourceHandlers(client);

      const result = await handlers['audit-stats']();

      expect(result.contents[0].uri).toBe('secureyeoman://audit/stats');
      const parsed = JSON.parse(result.contents[0].text);
      expect(parsed.totalEntries).toBe(500);
    });

    it('returns error message when audit stats API fails', async () => {
      const client = mockClient({
        get: vi.fn().mockRejectedValue(new Error('Service unavailable')),
      });
      const handlers = captureResourceHandlers(client);

      const result = await handlers['audit-stats']();

      const parsed = JSON.parse(result.contents[0].text);
      expect(parsed.error).toBe('Audit stats unavailable');
    });
  });
});
