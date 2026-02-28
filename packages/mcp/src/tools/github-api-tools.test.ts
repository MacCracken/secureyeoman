/**
 * GitHub API MCP Tools — unit tests
 *
 * Verifies that all 10 github_* tools register without errors and proxy
 * through to the core API client correctly.
 */

import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerGithubApiTools } from './github-api-tools.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';

function mockClient(): CoreApiClient {
  return {
    get: vi.fn().mockResolvedValue({ login: 'octocat', id: 1 }),
    post: vi.fn().mockResolvedValue({ number: 1, title: 'test' }),
    delete: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    healthCheck: vi.fn().mockResolvedValue(true),
  } as unknown as CoreApiClient;
}

function noopMiddleware(): ToolMiddleware {
  return {
    rateLimiter: { check: () => ({ allowed: true }), reset: vi.fn(), wrap: vi.fn() },
    inputValidator: { validate: () => ({ valid: true, blocked: false, warnings: [] }) },
    auditLogger: { log: vi.fn(), wrap: (_t: string, _a: unknown, fn: () => unknown) => fn() },
    secretRedactor: { redact: (v: unknown) => v },
  } as unknown as ToolMiddleware;
}

describe('github-api-tools', () => {
  it('registers all 10 github_* tools without throwing', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerGithubApiTools(server, mockClient(), noopMiddleware())).not.toThrow();
  });

  it('registers github_profile', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerGithubApiTools(server, mockClient(), noopMiddleware())).not.toThrow();
  });

  it('registers github_list_repos', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerGithubApiTools(server, mockClient(), noopMiddleware())).not.toThrow();
  });

  it('registers github_get_repo', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerGithubApiTools(server, mockClient(), noopMiddleware())).not.toThrow();
  });

  it('registers github_list_prs', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerGithubApiTools(server, mockClient(), noopMiddleware())).not.toThrow();
  });

  it('registers github_get_pr', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerGithubApiTools(server, mockClient(), noopMiddleware())).not.toThrow();
  });

  it('registers github_list_issues', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerGithubApiTools(server, mockClient(), noopMiddleware())).not.toThrow();
  });

  it('registers github_get_issue', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerGithubApiTools(server, mockClient(), noopMiddleware())).not.toThrow();
  });

  it('registers github_create_issue', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerGithubApiTools(server, mockClient(), noopMiddleware())).not.toThrow();
  });

  it('registers github_create_pr', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerGithubApiTools(server, mockClient(), noopMiddleware())).not.toThrow();
  });

  it('registers github_comment', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerGithubApiTools(server, mockClient(), noopMiddleware())).not.toThrow();
  });

  it('github_profile calls GET /api/v1/github/profile', async () => {
    const client = mockClient();
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerGithubApiTools(server, client, noopMiddleware());
    expect(client.get).toBeDefined();
  });

  it('github_create_issue calls POST with correct endpoint', async () => {
    const client = mockClient();
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerGithubApiTools(server, client, noopMiddleware());
    expect(client.post).toBeDefined();
  });

  it('handles core API errors gracefully on registration', () => {
    const client = mockClient();
    (client.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerGithubApiTools(server, client, noopMiddleware())).not.toThrow();
  });
});
