import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  registerAgnosticHooks,
  dispatchToAgnostic,
  type AgnosticHooksConfig,
  type AgnosticHooksDeps,
} from './agnostic-hooks.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeConfig(overrides?: Partial<AgnosticHooksConfig>): AgnosticHooksConfig {
  return {
    enabled: true,
    agnosticUrl: 'http://127.0.0.1:8000',
    apiKey: 'test-api-key',
    webhookSecret: 'webhook-secret',
    triggerHookPoints: ['agent:after-delegate', 'swarm:after-execute'],
    defaultPriority: 'high',
    defaultAgents: [],
    defaultStandards: [],
    ...overrides,
  };
}

function makeDeps(): AgnosticHooksDeps & {
  hookHandlers: Map<string, (ctx: { data: unknown }) => Promise<{ vetoed: boolean; errors: string[] }>>;
  hookIdCounter: number;
} {
  const hookHandlers = new Map<
    string,
    (ctx: { data: unknown }) => Promise<{ vetoed: boolean; errors: string[] }>
  >();
  let hookIdCounter = 0;

  return {
    hookHandlers,
    hookIdCounter,
    extensionManager: {
      registerHook: vi.fn((hookPoint: string, handler: any) => {
        const id = `hook-${hookIdCounter++}`;
        hookHandlers.set(id, handler);
        return id;
      }),
      unregisterHook: vi.fn((id: string) => {
        hookHandlers.delete(id);
      }),
    } as any,
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any,
  };
}

function mockFetch(
  responses: Array<{ ok: boolean; status: number; json?: unknown; text?: string }>
) {
  let callIndex = 0;
  return vi.fn().mockImplementation(() => {
    const resp = responses[callIndex % responses.length];
    callIndex++;
    return Promise.resolve({
      ok: resp.ok,
      status: resp.status,
      json: () => Promise.resolve(resp.json ?? {}),
      text: () => Promise.resolve(resp.text ?? ''),
    });
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('agnostic-hooks', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('registerAgnosticHooks', () => {
    it('does not register hooks when disabled', () => {
      const deps = makeDeps();
      const unregister = registerAgnosticHooks(makeConfig({ enabled: false }), deps);
      expect(deps.extensionManager.registerHook).not.toHaveBeenCalled();
      expect(deps.logger.debug).toHaveBeenCalledWith('AGNOSTIC hooks disabled');
      unregister();
    });

    it('registers hooks for all configured hook points', () => {
      const deps = makeDeps();
      const config = makeConfig({
        triggerHookPoints: ['agent:after-delegate', 'swarm:after-execute', 'task:after-execute'],
      });
      const unregister = registerAgnosticHooks(config, deps);
      expect(deps.extensionManager.registerHook).toHaveBeenCalledTimes(3);
      expect(deps.logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ hookPoints: config.triggerHookPoints }),
        'AGNOSTIC hooks registered'
      );
      unregister();
    });

    it('uses default hook points when none specified', () => {
      const deps = makeDeps();
      const config = makeConfig({ triggerHookPoints: undefined });
      const unregister = registerAgnosticHooks(config, deps);
      expect(deps.extensionManager.registerHook).toHaveBeenCalledTimes(2);
      unregister();
    });

    it('unregister function removes all hooks', () => {
      const deps = makeDeps();
      const unregister = registerAgnosticHooks(makeConfig(), deps);
      expect(deps.hookHandlers.size).toBe(2);
      unregister();
      expect(deps.extensionManager.unregisterHook).toHaveBeenCalledTimes(2);
    });

    it('hook handler submits QA task on trigger', async () => {
      const fetchSpy = mockFetch([
        {
          ok: true,
          status: 200,
          json: { task_id: 'task-123', session_id: 'sess-456' },
        },
      ]);
      vi.stubGlobal('fetch', fetchSpy);

      const deps = makeDeps();
      registerAgnosticHooks(makeConfig(), deps);

      const handler = [...deps.hookHandlers.values()][0];
      const result = await handler({
        data: { profileName: 'test-profile', delegationId: 'del-001' },
      });
      expect(result.vetoed).toBe(false);
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://127.0.0.1:8000/api/tasks',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('hook handler does not throw when QA submission fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

      const deps = makeDeps();
      registerAgnosticHooks(makeConfig(), deps);

      const handler = [...deps.hookHandlers.values()][0];
      const result = await handler({ data: {} });
      expect(result.vetoed).toBe(false);
      expect(deps.logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'ECONNREFUSED' }),
        'AGNOSTIC QA trigger failed'
      );
    });

    it('hook handler warns on non-200 response', async () => {
      const fetchSpy = mockFetch([
        { ok: false, status: 500, text: 'Internal Server Error' },
      ]);
      vi.stubGlobal('fetch', fetchSpy);

      const deps = makeDeps();
      registerAgnosticHooks(makeConfig(), deps);

      const handler = [...deps.hookHandlers.values()][0];
      await handler({ data: { swarmId: 'swarm-42' } });
      expect(deps.logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ status: 500 }),
        'AGNOSTIC QA task submission failed'
      );
    });
  });

  describe('dispatchToAgnostic', () => {
    it('sends HMAC-signed webhook when secret is set', async () => {
      const fetchSpy = mockFetch([
        { ok: true, status: 200, json: { accepted: true, task_id: 'task-789' } },
      ]);
      vi.stubGlobal('fetch', fetchSpy);

      const config = makeConfig({ webhookSecret: 'my-secret' });
      const result = await dispatchToAgnostic(config, 'agent:completed', {
        delegationId: 'del-001',
      });

      expect(result.accepted).toBe(true);
      expect(result.taskId).toBe('task-789');
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://127.0.0.1:8000/api/v1/yeoman/webhooks',
        expect.objectContaining({ method: 'POST' })
      );

      const callArgs = fetchSpy.mock.calls[0][1] as RequestInit;
      const headers = callArgs.headers as Record<string, string>;
      expect(headers['X-Yeoman-Event']).toBe('agent:completed');
      expect(headers['X-Yeoman-Signature']).toMatch(/^sha256=[a-f0-9]{64}$/);
    });

    it('skips signature when no webhook secret', async () => {
      const fetchSpy = mockFetch([
        { ok: true, status: 200, json: { accepted: true } },
      ]);
      vi.stubGlobal('fetch', fetchSpy);

      const config = makeConfig({ webhookSecret: undefined });
      await dispatchToAgnostic(config, 'test:event', {});

      const callArgs = fetchSpy.mock.calls[0][1] as RequestInit;
      const headers = callArgs.headers as Record<string, string>;
      expect(headers['X-Yeoman-Signature']).toBeUndefined();
    });

    it('includes API key header when set', async () => {
      const fetchSpy = mockFetch([
        { ok: true, status: 200, json: { accepted: true } },
      ]);
      vi.stubGlobal('fetch', fetchSpy);

      await dispatchToAgnostic(makeConfig({ apiKey: 'key-123' }), 'test', {});

      const callArgs = fetchSpy.mock.calls[0][1] as RequestInit;
      const headers = callArgs.headers as Record<string, string>;
      expect(headers['X-API-Key']).toBe('key-123');
    });

    it('returns accepted=false on non-200 response', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetch([{ ok: false, status: 503, text: 'Service Unavailable' }])
      );

      const result = await dispatchToAgnostic(makeConfig(), 'test', {});
      expect(result.accepted).toBe(false);
      expect(result.taskId).toBeUndefined();
    });
  });
});
