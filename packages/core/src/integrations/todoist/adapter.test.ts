import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TodoistIntegration } from './adapter.js';
import type { IntegrationConfig, UnifiedMessage } from '@secureyeoman/shared';
import type { IntegrationDeps } from '../types.js';
import type { SecureLogger } from '../../logging/logger.js';

// ── Helpers ────────────────────────────────────────────────────────

function noopLogger(): SecureLogger {
  const noop = () => {};
  return {
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    child: () => noopLogger(),
    level: 'silent',
  } as SecureLogger;
}

function makeConfig(overrides: Partial<IntegrationConfig> = {}): IntegrationConfig {
  return {
    id: 'todoist_int_1',
    platform: 'todoist',
    displayName: 'Test Todoist',
    enabled: true,
    status: 'disconnected',
    config: {
      apiToken: 'todoist-api-token',
      projectId: 'proj_123',
      pollIntervalMs: 999999, // effectively never fires during tests
    },
    messageCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeDeps(onMessage = vi.fn().mockResolvedValue(undefined)): IntegrationDeps {
  return { logger: noopLogger(), onMessage };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('TodoistIntegration', () => {
  let adapter: TodoistIntegration;

  beforeEach(() => {
    adapter = new TodoistIntegration();
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should have platform "todoist"', () => {
    expect(adapter.platform).toBe('todoist');
  });

  it('should have rate limit of 10 per second', () => {
    expect(adapter.platformRateLimit).toEqual({ maxPerSecond: 10 });
  });

  it('should not be healthy before init', () => {
    expect(adapter.isHealthy()).toBe(false);
  });

  describe('init()', () => {
    it('should initialize successfully with valid config', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });
      vi.stubGlobal('fetch', mockFetch);

      await expect(adapter.init(makeConfig(), makeDeps())).resolves.not.toThrow();
    });

    it('should throw when apiToken is missing', async () => {
      const cfg = makeConfig({ config: { projectId: 'proj_123' } });
      await expect(adapter.init(cfg, makeDeps())).rejects.toThrow(
        'Todoist integration requires an apiToken'
      );
    });
  });

  describe('start()', () => {
    it('should become healthy and set up polling', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();

      expect(adapter.isHealthy()).toBe(true);
    });

    it('should be idempotent — calling start twice is safe', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await expect(adapter.start()).resolves.not.toThrow();
      expect(adapter.isHealthy()).toBe(true);
    });

    it('should throw if called before init', async () => {
      await expect(adapter.start()).rejects.toThrow('not initialized');
    });

    it('should seed seen tasks on start to avoid replaying existing tasks', async () => {
      const existingTask = { id: 'existing_1', content: 'Old task', project_id: 'proj_123' };
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([existingTask]),
      });
      vi.stubGlobal('fetch', mockFetch);

      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));
      await adapter.start();

      // The existing task should have been seeded, not dispatched as a new message
      expect(onMessage).not.toHaveBeenCalled();
    });
  });

  describe('stop()', () => {
    it('should become unhealthy after stop', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await adapter.stop();

      expect(adapter.isHealthy()).toBe(false);
    });

    it('should be safe to call stop without start', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await expect(adapter.stop()).resolves.not.toThrow();
    });
  });

  describe('sendMessage()', () => {
    it('should POST a new task and return its ID', async () => {
      const createdTask = { id: 'task_abc', content: 'Buy milk' };
      const mockFetch = vi
        .fn()
        // First call: seedSeenTasks during start()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
        // Second call: create task
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(createdTask) });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      const id = await adapter.sendMessage('proj_123', 'Buy milk');

      expect(id).toBe('task_abc');
      const [url, opts] = mockFetch.mock.calls[1];
      expect(url).toBe('https://api.todoist.com/rest/v2/tasks');
      expect(opts.method).toBe('POST');
      expect(opts.headers['Authorization']).toBe('Bearer todoist-api-token');
      const body = JSON.parse(opts.body);
      expect(body.content).toBe('Buy milk');
      expect(body.project_id).toBe('proj_123');
    });

    it('should use the configured projectId when chatId is empty', async () => {
      const createdTask = { id: 'task_xyz', content: 'Test' };
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(createdTask) });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await adapter.sendMessage('', 'Test');

      const body = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body.project_id).toBe('proj_123');
    });

    it('should throw when task creation fails', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
        .mockResolvedValueOnce({
          ok: false,
          text: () => Promise.resolve('Bad Request'),
        });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await expect(adapter.sendMessage('proj_123', 'Test')).rejects.toThrow(
        'Todoist create task failed'
      );
    });
  });

  describe('testConnection()', () => {
    it('should return ok=true when projects are accessible', async () => {
      const projects = [
        { id: 'proj_1', name: 'Inbox' },
        { id: 'proj_2', name: 'Work' },
      ];
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(projects),
        statusText: 'OK',
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();

      expect(result.ok).toBe(true);
      expect(result.message).toContain('2 project(s)');
    });

    it('should return ok=false when API returns an error', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        statusText: 'Unauthorized',
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();

      expect(result.ok).toBe(false);
      expect(result.message).toContain('Unauthorized');
    });

    it('should return ok=false when fetch throws', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();

      expect(result.ok).toBe(false);
      expect(result.message).toContain('Network error');
    });
  });

  describe('isHealthy()', () => {
    it('should return false before start', async () => {
      await adapter.init(makeConfig(), makeDeps());
      expect(adapter.isHealthy()).toBe(false);
    });

    it('should return true after start', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      expect(adapter.isHealthy()).toBe(true);
    });

    it('should return false after stop', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await adapter.stop();
      expect(adapter.isHealthy()).toBe(false);
    });
  });
});
