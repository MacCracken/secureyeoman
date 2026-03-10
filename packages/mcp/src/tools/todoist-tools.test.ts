/**
 * Todoist MCP Tools — unit tests
 *
 * Verifies that all 6 todoist_* tools register and proxy correctly
 * through to the core API client via globalToolRegistry.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTodoistTools } from './todoist-tools.js';
import { globalToolRegistry } from './tool-utils.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';

function mockClient(): CoreApiClient {
  return {
    get: vi.fn().mockResolvedValue({ tasks: [] }),
    post: vi.fn().mockResolvedValue({ id: 'task-1' }),
    delete: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({ id: 'task-1', content: 'Updated' }),
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

describe('todoist-tools', () => {
  let client: CoreApiClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = mockClient();
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerTodoistTools(server, client, noopMiddleware());
  });

  it('registers all 6 todoist_* tools in globalToolRegistry', () => {
    const tools = [
      'todoist_list_tasks',
      'todoist_get_task',
      'todoist_create_task',
      'todoist_update_task',
      'todoist_complete_task',
      'todoist_list_projects',
    ];
    for (const t of tools) {
      expect(globalToolRegistry.has(t)).toBe(true);
    }
  });

  // ── todoist_list_tasks ─────────────────────────────────────

  it('todoist_list_tasks calls GET with query params', async () => {
    const handler = globalToolRegistry.get('todoist_list_tasks')!;
    const result = await handler({ projectId: 'proj-1', filter: 'today' });
    expect(result.isError).toBeFalsy();
    expect(client.get).toHaveBeenCalledWith(
      '/api/v1/integrations/todoist/tasks',
      { projectId: 'proj-1', filter: 'today' }
    );
  });

  it('todoist_list_tasks with no filters', async () => {
    const handler = globalToolRegistry.get('todoist_list_tasks')!;
    await handler({});
    expect(client.get).toHaveBeenCalledWith('/api/v1/integrations/todoist/tasks', {});
  });

  // ── todoist_get_task ───────────────────────────────────────

  it('todoist_get_task calls GET with taskId in path', async () => {
    const handler = globalToolRegistry.get('todoist_get_task')!;
    const result = await handler({ taskId: 'task-42' });
    expect(result.isError).toBeFalsy();
    expect(client.get).toHaveBeenCalledWith(
      '/api/v1/integrations/todoist/tasks/task-42',
      undefined
    );
  });

  // ── todoist_create_task ────────────────────────────────────

  it('todoist_create_task calls POST with full body', async () => {
    const handler = globalToolRegistry.get('todoist_create_task')!;
    const result = await handler({
      content: 'Buy groceries',
      description: 'Milk, eggs, bread',
      projectId: 'proj-1',
      dueString: 'tomorrow',
      priority: 3,
    });
    expect(result.isError).toBeFalsy();
    expect(client.post).toHaveBeenCalledWith('/api/v1/integrations/todoist/tasks', {
      content: 'Buy groceries',
      description: 'Milk, eggs, bread',
      projectId: 'proj-1',
      dueString: 'tomorrow',
      priority: 3,
    });
  });

  it('todoist_create_task with content only', async () => {
    const handler = globalToolRegistry.get('todoist_create_task')!;
    await handler({ content: 'Quick task' });
    expect(client.post).toHaveBeenCalledWith('/api/v1/integrations/todoist/tasks', {
      content: 'Quick task',
      description: undefined,
      projectId: undefined,
      dueString: undefined,
      priority: undefined,
    });
  });

  // ── todoist_update_task ────────────────────────────────────

  it('todoist_update_task calls PUT with taskId in path and body', async () => {
    const handler = globalToolRegistry.get('todoist_update_task')!;
    const result = await handler({
      taskId: 'task-42',
      content: 'Updated content',
      priority: 4,
    });
    expect(result.isError).toBeFalsy();
    expect(client.put).toHaveBeenCalledWith(
      '/api/v1/integrations/todoist/tasks/task-42',
      expect.objectContaining({
        taskId: 'task-42',
        content: 'Updated content',
        priority: 4,
      })
    );
  });

  // ── todoist_complete_task ──────────────────────────────────

  it('todoist_complete_task calls POST with taskId in path', async () => {
    const handler = globalToolRegistry.get('todoist_complete_task')!;
    const result = await handler({ taskId: 'task-42' });
    expect(result.isError).toBeFalsy();
    expect(client.post).toHaveBeenCalledWith(
      '/api/v1/integrations/todoist/tasks/task-42/close',
      {}
    );
  });

  // ── todoist_list_projects ──────────────────────────────────

  it('todoist_list_projects calls GET', async () => {
    const handler = globalToolRegistry.get('todoist_list_projects')!;
    const result = await handler({});
    expect(result.isError).toBeFalsy();
    expect(client.get).toHaveBeenCalledWith(
      '/api/v1/integrations/todoist/projects',
      undefined
    );
  });

  // ── Error handling ──────────────────────────────────────────────

  it('returns isError when API throws', async () => {
    (client.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
    const handler = globalToolRegistry.get('todoist_list_tasks')!;
    const result = await handler({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Network error');
  });

  it('returns JSON response on success', async () => {
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      tasks: [{ id: '1', content: 'Test' }],
    });
    const handler = globalToolRegistry.get('todoist_list_tasks')!;
    const result = await handler({});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.tasks).toHaveLength(1);
  });
});
