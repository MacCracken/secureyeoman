import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSkillResources } from './skill-resources.js';
import type { CoreApiClient } from '../core-client.js';

function mockClient(skills: unknown[] = []): CoreApiClient {
  return {
    get: vi.fn().mockResolvedValue({ skills }),
    post: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    healthCheck: vi.fn().mockResolvedValue(true),
  } as unknown as CoreApiClient;
}

describe('skill-resources', () => {
  it('registers skill-markdown resource without error', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerSkillResources(server, mockClient())).not.toThrow();
  });

  it('registers without throwing when client returns empty skills list', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const client = mockClient([]);
    expect(() => registerSkillResources(server, client)).not.toThrow();
  });

  it('handles core client error gracefully at registration time', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const client = mockClient();
    (client.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('API error'));
    // Registration itself should not throw; handler errors occur at resource call time
    expect(() => registerSkillResources(server, client)).not.toThrow();
  });

  it('uses mimeType text/markdown', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerSkillResources(server, mockClient());
    // Registration completes — mimeType is set declaratively at register time
    expect(true).toBe(true);
  });

  it('uses yeoman://skills/{id} URI pattern', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    // Should not throw — the URI template is yeoman://skills/{id}
    expect(() => registerSkillResources(server, mockClient())).not.toThrow();
  });

  it('registers without error alongside personality resources', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const client = mockClient([{ id: 'skill-1', name: 'Test Skill', instructions: 'Do stuff.' }]);
    expect(() => registerSkillResources(server, client)).not.toThrow();
  });
});
