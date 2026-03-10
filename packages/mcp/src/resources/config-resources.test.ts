import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerConfigResources } from './config-resources.js';
import type { CoreApiClient } from '../core-client.js';

type ResourceHandler = () => Promise<{
  contents: { uri: string; mimeType: string; text: string }[];
}>;

function mockClient(overrides: Partial<CoreApiClient> = {}): CoreApiClient {
  return {
    get: vi.fn().mockResolvedValue({ appName: 'secureyeoman', version: '1.0.0' }),
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

  registerConfigResources(server, client);
  return handlers;
}

describe('config-resources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers config-current resource', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerConfigResources(server, mockClient())).not.toThrow();
  });

  describe('config-current', () => {
    it('calls GET /api/v1/soul/config and returns JSON on success', async () => {
      const client = mockClient();
      const handlers = captureResourceHandlers(client);

      const result = await handlers['config-current']();

      expect(client.get).toHaveBeenCalledWith('/api/v1/soul/config');
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].uri).toBe('secureyeoman://config/current');
      expect(result.contents[0].mimeType).toBe('application/json');
      const parsed = JSON.parse(result.contents[0].text);
      expect(parsed.appName).toBe('secureyeoman');
    });

    it('returns error message when config API fails', async () => {
      const client = mockClient({
        get: vi.fn().mockRejectedValue(new Error('Not found')),
      });
      const handlers = captureResourceHandlers(client);

      const result = await handlers['config-current']();

      const parsed = JSON.parse(result.contents[0].text);
      expect(parsed.error).toBe('Config unavailable');
    });
  });
});
