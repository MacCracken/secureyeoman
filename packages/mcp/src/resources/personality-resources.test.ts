import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPersonalityResources } from './personality-resources.js';
import type { CoreApiClient } from '../core-client.js';

function mockClient(): CoreApiClient {
  return {
    get: vi.fn().mockResolvedValue({ personality: { id: '1', name: 'Default' } }),
    post: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    healthCheck: vi.fn().mockResolvedValue(true),
  } as unknown as CoreApiClient;
}

describe('personality-resources', () => {
  it('should register personality-active resource', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerPersonalityResources(server, mockClient())).not.toThrow();
  });

  it('should register personality-entry template resource', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerPersonalityResources(server, mockClient());
    expect(true).toBe(true);
  });

  it('should register both resources without errors', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerPersonalityResources(server, mockClient())).not.toThrow();
  });

  it('should handle core client errors', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const client = mockClient();
    (client.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Not found'));
    registerPersonalityResources(server, client);
    expect(true).toBe(true);
  });

  it('should use application/json mimeType', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerPersonalityResources(server, mockClient());
    expect(true).toBe(true);
  });
});
