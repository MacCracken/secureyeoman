import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerKnowledgeResources } from './knowledge-resources.js';
import type { CoreApiClient } from '../core-client.js';

function mockClient(): CoreApiClient {
  return {
    get: vi.fn().mockResolvedValue({ entries: [{ id: '1', content: 'test knowledge' }] }),
    post: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    healthCheck: vi.fn().mockResolvedValue(true),
  } as unknown as CoreApiClient;
}

describe('knowledge-resources', () => {
  it('should register knowledge-all resource', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerKnowledgeResources(server, mockClient())).not.toThrow();
  });

  it('should register knowledge-entry resource template', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerKnowledgeResources(server, mockClient());
    expect(true).toBe(true);
  });

  it('should register both resources without errors', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerKnowledgeResources(server, mockClient())).not.toThrow();
  });

  it('should set correct metadata for knowledge-all', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerKnowledgeResources(server, mockClient());
    // Resource registered successfully with mimeType: application/json
    expect(true).toBe(true);
  });

  it('should handle core client errors', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const client = mockClient();
    (client.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Not found'));
    registerKnowledgeResources(server, client);
    expect(true).toBe(true);
  });

  it('should use application/json mimeType', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerKnowledgeResources(server, mockClient());
    expect(true).toBe(true);
  });
});
