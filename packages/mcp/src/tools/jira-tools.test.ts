/**
 * Jira MCP Tools — unit tests
 *
 * Verifies that all 8 jira_* tools register and proxy correctly
 * through to the core API client via globalToolRegistry.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerJiraTools } from './jira-tools.js';
import { globalToolRegistry } from './tool-utils.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';

function mockClient(): CoreApiClient {
  return {
    get: vi.fn().mockResolvedValue({ issues: [] }),
    post: vi.fn().mockResolvedValue({ id: 'result-1', key: 'PROJ-1' }),
    delete: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({ id: 'result-1' }),
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

describe('jira-tools', () => {
  let client: CoreApiClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = mockClient();
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerJiraTools(server, client, noopMiddleware());
  });

  it('registers all 8 jira_* tools in globalToolRegistry', () => {
    const tools = [
      'jira_search_issues',
      'jira_get_issue',
      'jira_create_issue',
      'jira_update_issue',
      'jira_create_comment',
      'jira_list_projects',
      'jira_get_transitions',
      'jira_transition_issue',
    ];
    for (const t of tools) {
      expect(globalToolRegistry.has(t)).toBe(true);
    }
  });

  // ── jira_search_issues ─────────────────────────────────────

  it('jira_search_issues calls GET with query params', async () => {
    const handler = globalToolRegistry.get('jira_search_issues')!;
    const result = await handler({ jql: 'project = PROJ AND status = Open', maxResults: 50 });
    expect(result.isError).toBeFalsy();
    expect(client.get).toHaveBeenCalledWith(
      '/api/v1/integrations/jira/issues/search',
      { jql: 'project = PROJ AND status = Open', maxResults: '50' }
    );
  });

  // ── jira_get_issue ─────────────────────────────────────────

  it('jira_get_issue calls GET with issueKey in path', async () => {
    const handler = globalToolRegistry.get('jira_get_issue')!;
    const result = await handler({ issueKey: 'PROJ-123' });
    expect(result.isError).toBeFalsy();
    expect(client.get).toHaveBeenCalledWith(
      '/api/v1/integrations/jira/issues/PROJ-123',
      undefined
    );
  });

  // ── jira_create_issue ──────────────────────────────────────

  it('jira_create_issue calls POST with body', async () => {
    const handler = globalToolRegistry.get('jira_create_issue')!;
    const result = await handler({
      projectKey: 'PROJ',
      summary: 'Bug in login',
      issueType: 'Bug',
      description: 'Login fails on mobile',
      assignee: 'user@example.com',
      priority: 'High',
    });
    expect(result.isError).toBeFalsy();
    expect(client.post).toHaveBeenCalledWith('/api/v1/integrations/jira/issues', {
      projectKey: 'PROJ',
      summary: 'Bug in login',
      issueType: 'Bug',
      description: 'Login fails on mobile',
      assignee: 'user@example.com',
      priority: 'High',
    });
  });

  it('jira_create_issue defaults issueType to Task', async () => {
    const handler = globalToolRegistry.get('jira_create_issue')!;
    await handler({ projectKey: 'PROJ', summary: 'Simple task' });
    const body = (client.post as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(body.issueType).toBe('Task');
  });

  // ── jira_update_issue ──────────────────────────────────────

  it('jira_update_issue calls PUT with issueKey in path', async () => {
    const handler = globalToolRegistry.get('jira_update_issue')!;
    const result = await handler({
      issueKey: 'PROJ-123',
      summary: 'Updated summary',
      priority: 'Low',
    });
    expect(result.isError).toBeFalsy();
    expect(client.put).toHaveBeenCalledWith(
      '/api/v1/integrations/jira/issues/PROJ-123',
      expect.objectContaining({ summary: 'Updated summary', priority: 'Low' })
    );
  });

  // ── jira_create_comment ────────────────────────────────────

  it('jira_create_comment calls POST with issueKey in path', async () => {
    const handler = globalToolRegistry.get('jira_create_comment')!;
    const result = await handler({ issueKey: 'PROJ-123', body: 'A comment' });
    expect(result.isError).toBeFalsy();
    expect(client.post).toHaveBeenCalledWith(
      '/api/v1/integrations/jira/issues/PROJ-123/comments',
      { issueKey: 'PROJ-123', body: 'A comment' }
    );
  });

  // ── jira_list_projects ─────────────────────────────────────

  it('jira_list_projects calls GET', async () => {
    const handler = globalToolRegistry.get('jira_list_projects')!;
    const result = await handler({});
    expect(result.isError).toBeFalsy();
    expect(client.get).toHaveBeenCalledWith(
      '/api/v1/integrations/jira/projects',
      undefined
    );
  });

  // ── jira_get_transitions ───────────────────────────────────

  it('jira_get_transitions calls GET with issueKey in path', async () => {
    const handler = globalToolRegistry.get('jira_get_transitions')!;
    const result = await handler({ issueKey: 'PROJ-123' });
    expect(result.isError).toBeFalsy();
    expect(client.get).toHaveBeenCalledWith(
      '/api/v1/integrations/jira/issues/PROJ-123/transitions',
      undefined
    );
  });

  // ── jira_transition_issue ──────────────────────────────────

  it('jira_transition_issue calls POST with issueKey and transitionId', async () => {
    const handler = globalToolRegistry.get('jira_transition_issue')!;
    const result = await handler({ issueKey: 'PROJ-123', transitionId: '31' });
    expect(result.isError).toBeFalsy();
    expect(client.post).toHaveBeenCalledWith(
      '/api/v1/integrations/jira/issues/PROJ-123/transitions',
      { issueKey: 'PROJ-123', transitionId: '31' }
    );
  });

  // ── Error handling ──────────────────────────────────────────────

  it('returns isError when API throws', async () => {
    (client.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
    const handler = globalToolRegistry.get('jira_search_issues')!;
    const result = await handler({ jql: 'test' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Network error');
  });

  it('returns JSON response on success', async () => {
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue({ issues: [{ key: 'PROJ-1' }] });
    const handler = globalToolRegistry.get('jira_search_issues')!;
    const result = await handler({ jql: 'test' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.issues).toHaveLength(1);
  });
});
