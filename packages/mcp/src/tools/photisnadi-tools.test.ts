import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPhotisnadiTools } from './photisnadi-tools.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { ToolMiddleware } from './index.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function noopMiddleware(): ToolMiddleware {
  return {
    rateLimiter: { check: () => ({ allowed: true }), reset: vi.fn(), wrap: vi.fn() },
    inputValidator: { validate: () => ({ valid: true, blocked: false, warnings: [] }) },
    auditLogger: { log: vi.fn(), wrap: (_t: string, _a: unknown, fn: () => unknown) => fn() },
    secretRedactor: { redact: (v: unknown) => v },
  } as unknown as ToolMiddleware;
}

function makeConfig(overrides?: Partial<McpServiceConfig>): McpServiceConfig {
  return {
    enabled: true,
    port: 3001,
    host: '127.0.0.1',
    transport: 'streamable-http',
    autoRegister: false,
    coreUrl: 'http://127.0.0.1:18789',
    exposePhotisnadiTools: true,
    ...overrides,
  } as McpServiceConfig;
}

function collectTools(server: McpServer): string[] {
  const names: string[] = [];
  const orig = server.registerTool.bind(server);
  vi.spyOn(server, 'registerTool').mockImplementation((name: string, ...rest: unknown[]) => {
    names.push(name);
    return (orig as Function)(name, ...rest);
  });
  return names;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('photisnadi-tools', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env.PHOTISNADI_SUPABASE_URL = 'https://test.supabase.co';
    process.env.PHOTISNADI_SUPABASE_KEY = 'test-key';
    process.env.PHOTISNADI_USER_ID = 'test-user-id';
  });

  afterEach(() => {
    process.env = { ...origEnv };
    vi.restoreAllMocks();
  });

  it('registers only a stub when disabled', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const names = collectTools(server);
    registerPhotisnadiTools(server, makeConfig({ exposePhotisnadiTools: false }), noopMiddleware());
    expect(names).toEqual(['photisnadi_status']);
  });

  it('registers all 7 tools when enabled', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const names = collectTools(server);
    registerPhotisnadiTools(server, makeConfig(), noopMiddleware());
    expect(names).toContain('photisnadi_list_tasks');
    expect(names).toContain('photisnadi_create_task');
    expect(names).toContain('photisnadi_update_task');
    expect(names).toContain('photisnadi_get_rituals');
    expect(names).toContain('photisnadi_analytics');
    expect(names).toContain('photisnadi_sync');
    expect(names.length).toBe(6); // 6 real tools (no stub)
  });

  it('stub returns error message when disabled', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    let handler: Function | undefined;
    vi.spyOn(server, 'registerTool').mockImplementation(
      (_name: string, _schema: unknown, fn: Function) => {
        handler = fn;
      }
    );
    registerPhotisnadiTools(server, makeConfig({ exposePhotisnadiTools: false }), noopMiddleware());
    expect(handler).toBeDefined();
    const result = await handler!({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('disabled');
  });

  it('photisnadi_list_tasks calls supabase with correct query', async () => {
    const mockResponse = [{ id: '1', title: 'Test task', status: 'todo' }];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse),
      })
    );

    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const handlers: Record<string, Function> = {};
    vi.spyOn(server, 'registerTool').mockImplementation(
      (name: string, _schema: unknown, fn: Function) => {
        handlers[name] = fn;
      }
    );
    registerPhotisnadiTools(server, makeConfig(), noopMiddleware());

    const result = await handlers.photisnadi_list_tasks({ status: 'todo' });
    expect(result.content[0].text).toContain('Test task');

    const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toContain('tasks');
    expect(fetchCall[0]).toContain('status=eq.todo');
  });

  it('photisnadi_create_task sends POST with task data', async () => {
    const created = [{ id: 'new-id', title: 'New task' }];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.resolve(created),
      })
    );

    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const handlers: Record<string, Function> = {};
    vi.spyOn(server, 'registerTool').mockImplementation(
      (name: string, _schema: unknown, fn: Function) => {
        handlers[name] = fn;
      }
    );
    registerPhotisnadiTools(server, makeConfig(), noopMiddleware());

    const result = await handlers.photisnadi_create_task({ title: 'New task', priority: 'high' });
    expect(result.content[0].text).toContain('New task');

    const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[1].method).toBe('POST');
    const body = JSON.parse(fetchCall[1].body);
    expect(body.title).toBe('New task');
    expect(body.priority).toBe('high');
    expect(body.user_id).toBe('test-user-id');
  });

  it('photisnadi_analytics computes stats correctly', async () => {
    const tasks = [
      { status: 'todo', priority: 'high', due_date: '2020-01-01' },
      { status: 'done', priority: 'low', due_date: null },
      { status: 'blocked', priority: 'medium', due_date: null },
      { status: 'todo', priority: 'high', due_date: null },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(tasks),
      })
    );

    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const handlers: Record<string, Function> = {};
    vi.spyOn(server, 'registerTool').mockImplementation(
      (name: string, _schema: unknown, fn: Function) => {
        handlers[name] = fn;
      }
    );
    registerPhotisnadiTools(server, makeConfig(), noopMiddleware());

    const result = await handlers.photisnadi_analytics({});
    const analytics = JSON.parse(result.content[0].text);
    expect(analytics.total).toBe(4);
    expect(analytics.blocked).toBe(1);
    expect(analytics.overdue).toBe(1); // 2020-01-01 is past due, status !== done
    expect(analytics.statusDistribution.todo).toBe(2);
  });

  it('photisnadi_sync returns connection summary', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, opts?: { method?: string }) => {
        // HEAD request for web UI health check
        if (opts?.method === 'HEAD') {
          return Promise.resolve({ ok: true, status: 200 });
        }
        // Supabase queries — tasks or rituals
        const isRituals = (url as string).includes('/rituals');
        const data = isRituals ? [{ id: 'r1' }] : [{ id: '1' }, { id: '2' }];
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(data),
        });
      })
    );

    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const handlers: Record<string, Function> = {};
    vi.spyOn(server, 'registerTool').mockImplementation(
      (name: string, _schema: unknown, fn: Function) => {
        handlers[name] = fn;
      }
    );
    registerPhotisnadiTools(server, makeConfig(), noopMiddleware());

    const result = await handlers.photisnadi_sync({});
    const sync = JSON.parse(result.content[0].text);
    expect(sync.status).toBe('connected');
    expect(sync.webUi).toBe('reachable');
    expect(sync.taskCount).toBe(2);
    expect(sync.ritualCount).toBe(1);
  });

  it('returns helpful message when supabase config is missing', async () => {
    delete process.env.PHOTISNADI_SUPABASE_URL;

    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const handlers: Record<string, Function> = {};
    vi.spyOn(server, 'registerTool').mockImplementation(
      (name: string, _schema: unknown, fn: Function) => {
        handlers[name] = fn;
      }
    );
    registerPhotisnadiTools(server, makeConfig(), noopMiddleware());

    const result = await handlers.photisnadi_list_tasks({});
    expect(result.content[0].text).toContain('not configured');
  });
});
