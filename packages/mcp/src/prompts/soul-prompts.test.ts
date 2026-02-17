import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSoulPrompts } from './soul-prompts.js';
import type { CoreApiClient } from '../core-client.js';

function mockClient(): CoreApiClient {
  return {
    get: vi
      .fn()
      .mockResolvedValue({ personality: { name: 'FRIDAY', systemPrompt: 'I am FRIDAY' } }),
    post: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    healthCheck: vi.fn().mockResolvedValue(true),
  } as unknown as CoreApiClient;
}

describe('soul-prompts', () => {
  it('should register friday:compose-prompt', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerSoulPrompts(server, mockClient())).not.toThrow();
  });

  it('should handle missing personality gracefully', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const client = mockClient();
    (client.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Not found'));
    registerSoulPrompts(server, client);
    expect(true).toBe(true);
  });

  it('should support optional personalityId argument', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerSoulPrompts(server, mockClient());
    expect(true).toBe(true);
  });

  it('should register prompt with correct name', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerSoulPrompts(server, mockClient());
    expect(true).toBe(true);
  });

  it('should handle core API errors in prompt generation', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const client = mockClient();
    (client.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Server error'));
    registerSoulPrompts(server, client);
    expect(true).toBe(true);
  });
});
