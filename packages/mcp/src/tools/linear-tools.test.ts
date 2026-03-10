/**
 * Linear MCP Tools — unit tests
 *
 * Verifies that all 7 linear_* tools register without errors and proxy
 * through to the core API client correctly via globalToolRegistry.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerLinearTools } from './linear-tools.js';
import { globalToolRegistry } from './tool-utils.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';

function mockClient(): CoreApiClient {
  return {
    get: vi.fn().mockResolvedValue({ issues: [] }),
    post: vi.fn().mockResolvedValue({ id: 'issue-1' }),
    delete: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({ id: 'issue-1', title: 'Updated' }),
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

describe('linear-tools', () => {
  let client: CoreApiClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = mockClient();
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerLinearTools(server, client, noopMiddleware());
  });

  it('registers all 7 linear_* tools in globalToolRegistry', () => {
    const tools = [
      'linear_list_issues',
      'linear_get_issue',
      'linear_create_issue',
      'linear_update_issue',
      'linear_create_comment',
      'linear_list_teams',
      'linear_search_issues',
    ];
    for (const t of tools) {
      expect(globalToolRegistry.has(t)).toBe(true);
    }
  });

  // ── linear_list_issues ──────────────────────────────────────────

  it('linear_list_issues calls GET with query params', async () => {
    const handler = globalToolRegistry.get('linear_list_issues')!;
    const result = await handler({ teamId: 'team-1', status: 'In Progress', limit: 10 });
    expect(result.isError).toBeFalsy();
    expect(client.get).toHaveBeenCalledWith(
      '/api/v1/integrations/linear/issues',
      expect.objectContaining({ teamId: 'team-1', status: 'In Progress', limit: '10' })
    );
  });

  it('linear_list_issues works with no args', async () => {
    const handler = globalToolRegistry.get('linear_list_issues')!;
    const result = await handler({});
    expect(result.isError).toBeFalsy();
    expect(client.get).toHaveBeenCalledWith('/api/v1/integrations/linear/issues', {});
  });

  // ── linear_get_issue ────────────────────────────────────────────

  it('linear_get_issue calls GET with encoded issueId in path', async () => {
    const handler = globalToolRegistry.get('linear_get_issue')!;
    const result = await handler({ issueId: 'ABC-123' });
    expect(result.isError).toBeFalsy();
    expect(client.get).toHaveBeenCalledWith(
      '/api/v1/integrations/linear/issues/ABC-123',
      undefined
    );
  });

  // ── linear_create_issue ─────────────────────────────────────────

  it('linear_create_issue calls POST with body', async () => {
    const handler = globalToolRegistry.get('linear_create_issue')!;
    const result = await handler({
      title: 'Test Issue',
      teamId: 'team-1',
      priority: 2,
      description: 'A test issue',
      assigneeId: 'user-1',
      labelIds: ['label-1'],
    });
    expect(result.isError).toBeFalsy();
    expect(client.post).toHaveBeenCalledWith('/api/v1/integrations/linear/issues', {
      title: 'Test Issue',
      teamId: 'team-1',
      priority: 2,
      description: 'A test issue',
      assigneeId: 'user-1',
      labelIds: ['label-1'],
    });
  });

  // ── linear_update_issue ─────────────────────────────────────────

  it('linear_update_issue calls PUT with partial body', async () => {
    const handler = globalToolRegistry.get('linear_update_issue')!;
    const result = await handler({
      issueId: 'ABC-123',
      title: 'Updated Title',
      priority: 1,
    });
    expect(result.isError).toBeFalsy();
    expect(client.put).toHaveBeenCalledWith(
      '/api/v1/integrations/linear/issues/ABC-123',
      expect.objectContaining({ title: 'Updated Title', priority: 1 })
    );
  });

  it('linear_update_issue omits undefined fields from body', async () => {
    const handler = globalToolRegistry.get('linear_update_issue')!;
    await handler({ issueId: 'ABC-123', title: 'New Title' });
    const body = (client.put as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(body.title).toBe('New Title');
    expect(body).not.toHaveProperty('description');
    expect(body).not.toHaveProperty('stateId');
  });

  // ── linear_create_comment ───────────────────────────────────────

  it('linear_create_comment calls POST with issueId in path', async () => {
    const handler = globalToolRegistry.get('linear_create_comment')!;
    const result = await handler({ issueId: 'ABC-123', body: 'This is a comment' });
    expect(result.isError).toBeFalsy();
    expect(client.post).toHaveBeenCalledWith(
      '/api/v1/integrations/linear/issues/ABC-123/comments',
      { body: 'This is a comment' }
    );
  });

  // ── linear_list_teams ───────────────────────────────────────────

  it('linear_list_teams calls GET with no query params', async () => {
    const handler = globalToolRegistry.get('linear_list_teams')!;
    const result = await handler({});
    expect(result.isError).toBeFalsy();
    expect(client.get).toHaveBeenCalledWith(
      '/api/v1/integrations/linear/teams',
      undefined
    );
  });

  // ── linear_search_issues ────────────────────────────────────────

  it('linear_search_issues calls GET with query params', async () => {
    const handler = globalToolRegistry.get('linear_search_issues')!;
    const result = await handler({ query: 'bug fix', limit: 50 });
    expect(result.isError).toBeFalsy();
    expect(client.get).toHaveBeenCalledWith(
      '/api/v1/integrations/linear/issues/search',
      expect.objectContaining({ query: 'bug fix', limit: '50' })
    );
  });

  // ── Error handling ──────────────────────────────────────────────

  it('returns isError when API throws', async () => {
    (client.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
    const handler = globalToolRegistry.get('linear_list_issues')!;
    const result = await handler({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Network error');
  });

  it('returns JSON response on success', async () => {
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue({ issues: [{ id: '1', title: 'Test' }] });
    const handler = globalToolRegistry.get('linear_list_issues')!;
    const result = await handler({});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.issues).toHaveLength(1);
    expect(parsed.issues[0].title).toBe('Test');
  });

  // ── Rate limiting ───────────────────────────────────────────────

  it('returns rate limit error when rate limiter blocks', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const mw = noopMiddleware();
    mw.rateLimiter.check = () => ({ allowed: false, retryAfterMs: 5000 } as any);
    registerLinearTools(server, client, mw);

    const handler = globalToolRegistry.get('linear_list_issues')!;
    const result = await handler({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Rate limit exceeded');
  });

  // ── Input validation ────────────────────────────────────────────

  it('returns blocked error when input validator blocks', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const mw = noopMiddleware();
    mw.inputValidator.validate = () =>
      ({ valid: false, blocked: true, blockReason: 'Injection detected', warnings: [] } as any);
    registerLinearTools(server, client, mw);

    const handler = globalToolRegistry.get('linear_list_issues')!;
    const result = await handler({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Injection detected');
  });
});
