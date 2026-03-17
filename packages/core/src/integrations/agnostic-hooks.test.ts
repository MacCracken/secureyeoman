import { describe, it, expect, vi, afterEach } from 'vitest';
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

type HookHandler = (ctx: { data: unknown }) => Promise<{ vetoed: boolean; errors: string[] }>;

function makeDeps(): AgnosticHooksDeps & {
  hookHandlers: Map<string, HookHandler>;
  hookPointMap: Map<string, HookHandler>;
  hookIdCounter: number;
} {
  const hookHandlers = new Map<string, HookHandler>();
  const hookPointMap = new Map<string, HookHandler>();
  let hookIdCounter = 0;

  return {
    hookHandlers,
    hookPointMap,
    hookIdCounter,
    extensionManager: {
      registerHook: vi.fn((hookPoint: string, handler: any) => {
        const id = `hook-${hookIdCounter++}`;
        hookHandlers.set(id, handler);
        hookPointMap.set(hookPoint, handler);
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

    it('uses default hook points when none specified (includes pr:created and deployment:after)', () => {
      const deps = makeDeps();
      const config = makeConfig({ triggerHookPoints: undefined });
      const unregister = registerAgnosticHooks(config, deps);
      expect(deps.extensionManager.registerHook).toHaveBeenCalledTimes(4);
      const registeredPoints = (deps.extensionManager.registerHook as any).mock.calls.map(
        (c: any[]) => c[0]
      );
      expect(registeredPoints).toContain('agent:after-delegate');
      expect(registeredPoints).toContain('swarm:after-execute');
      expect(registeredPoints).toContain('pr:created');
      expect(registeredPoints).toContain('deployment:after');
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
      const fetchSpy = mockFetch([{ ok: false, status: 500, text: 'Internal Server Error' }]);
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

    it('pr:created hook calls recommend then submits to crew API', async () => {
      const fetchSpy = mockFetch([
        {
          ok: true,
          status: 200,
          json: { result: { preset: 'software-engineering-standard' } },
        },
        {
          ok: true,
          status: 200,
          json: { crew_id: 'c-1' },
        },
      ]);
      vi.stubGlobal('fetch', fetchSpy);

      const deps = makeDeps();
      registerAgnosticHooks(makeConfig({ triggerHookPoints: ['pr:created'] }), deps);

      const handler = deps.hookPointMap.get('pr:created')!;
      const result = await handler({
        data: { prUrl: 'http://github.com/org/repo/pull/42', prTitle: 'Add auth' },
      });

      expect(result.vetoed).toBe(false);
      // First call: recommend endpoint
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://127.0.0.1:8000/api/v1/mcp/invoke',
        expect.objectContaining({ method: 'POST' })
      );
      // Second call: crew submission
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://127.0.0.1:8000/api/v1/crews',
        expect.objectContaining({ method: 'POST' })
      );
      const crewBody = JSON.parse(fetchSpy.mock.calls[1][1].body as string);
      expect(crewBody.preset).toBe('software-engineering-standard');
      expect(crewBody.target_url).toBe('http://github.com/org/repo/pull/42');
    });

    it('deployment:after hook calls recommend then submits to crew API', async () => {
      const fetchSpy = mockFetch([
        {
          ok: true,
          status: 200,
          json: { result: { preset: 'software-engineering-standard' } },
        },
        {
          ok: true,
          status: 200,
          json: { crew_id: 'c-1' },
        },
      ]);
      vi.stubGlobal('fetch', fetchSpy);

      const deps = makeDeps();
      registerAgnosticHooks(makeConfig({ triggerHookPoints: ['deployment:after'] }), deps);

      const handler = deps.hookPointMap.get('deployment:after')!;
      const result = await handler({
        data: { url: 'https://staging.example.com', environment: 'staging' },
      });

      expect(result.vetoed).toBe(false);
      // First call: recommend endpoint
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://127.0.0.1:8000/api/v1/mcp/invoke',
        expect.objectContaining({ method: 'POST' })
      );
      // Second call: crew submission
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://127.0.0.1:8000/api/v1/crews',
        expect.objectContaining({ method: 'POST' })
      );
      const crewBody = JSON.parse(fetchSpy.mock.calls[1][1].body as string);
      expect(crewBody.target_url).toBe('https://staging.example.com');
    });

    it('pr:created hook uses custom prReviewPreset when configured', async () => {
      const fetchSpy = mockFetch([{ ok: true, status: 200, json: { crew_id: 'crew-1' } }]);
      vi.stubGlobal('fetch', fetchSpy);

      const deps = makeDeps();
      registerAgnosticHooks(
        makeConfig({
          triggerHookPoints: ['pr:created'],
          prReviewPreset: 'qa-standard',
        }),
        deps
      );

      const handler = deps.hookPointMap.get('pr:created')!;
      await handler({ data: { prUrl: 'http://example.com/pr/1' } });

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
      expect(body.preset).toBe('qa-standard');
    });

    it('deployment:after hook uses custom deployReviewPreset when configured', async () => {
      const fetchSpy = mockFetch([{ ok: true, status: 200, json: { crew_id: 'crew-1' } }]);
      vi.stubGlobal('fetch', fetchSpy);

      const deps = makeDeps();
      registerAgnosticHooks(
        makeConfig({
          triggerHookPoints: ['deployment:after'],
          deployReviewPreset: 'devops',
        }),
        deps
      );

      const handler = deps.hookPointMap.get('deployment:after')!;
      await handler({ data: { url: 'https://prod.example.com' } });

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
      expect(body.preset).toBe('devops');
    });

    it('falls back to default preset when recommendation fails', async () => {
      // Recommendation fetch throws
      const fetchSpy = vi
        .fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        // Crew submission succeeds
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ crew_id: 'c-fallback' }),
          text: () => Promise.resolve(''),
        });
      vi.stubGlobal('fetch', fetchSpy);

      const deps = makeDeps();
      registerAgnosticHooks(makeConfig({ triggerHookPoints: ['pr:created'] }), deps);

      const handler = deps.hookPointMap.get('pr:created')!;
      await handler({ data: { prUrl: 'http://example.com/pr/1' } });

      // Should have fallen back to software-engineering-standard
      const crewCall = fetchSpy.mock.calls.find((c: any[]) =>
        String(c[0]).includes('/api/v1/crews')
      );
      expect(crewCall).toBeDefined();
      const body = JSON.parse(crewCall![1].body);
      expect(body.preset).toBe('software-engineering-standard');
    });

    it('crew hook warns on non-200 response from crew API', async () => {
      const fetchSpy = mockFetch([
        // recommend call succeeds
        { ok: true, status: 200, json: { result: { preset: 'software-engineering-standard' } } },
        // crew call fails
        { ok: false, status: 502, text: 'Bad Gateway' },
      ]);
      vi.stubGlobal('fetch', fetchSpy);

      const deps = makeDeps();
      registerAgnosticHooks(makeConfig({ triggerHookPoints: ['pr:created'] }), deps);

      const handler = deps.hookPointMap.get('pr:created')!;
      await handler({ data: { prUrl: 'http://example.com/pr/1' } });

      expect(deps.logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ status: 502, preset: 'software-engineering-standard' }),
        'AGNOSTIC crew submission failed'
      );
    });

    it('crew hook logs success with crew_id and task_id', async () => {
      const fetchSpy = mockFetch([
        // recommend call
        { ok: true, status: 200, json: { result: { preset: 'software-engineering-standard' } } },
        // crew call
        { ok: true, status: 200, json: { crew_id: 'crew-abc', task_id: 'task-xyz' } },
      ]);
      vi.stubGlobal('fetch', fetchSpy);

      const deps = makeDeps();
      registerAgnosticHooks(makeConfig({ triggerHookPoints: ['pr:created'] }), deps);

      const handler = deps.hookPointMap.get('pr:created')!;
      await handler({ data: { prTitle: 'Fix login bug' } });

      expect(deps.logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          hookPoint: 'pr:created',
          preset: 'software-engineering-standard',
          crewId: 'crew-abc',
          taskId: 'task-xyz',
        }),
        'AGNOSTIC crew submitted via hook'
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
      const fetchSpy = mockFetch([{ ok: true, status: 200, json: { accepted: true } }]);
      vi.stubGlobal('fetch', fetchSpy);

      const config = makeConfig({ webhookSecret: undefined });
      await dispatchToAgnostic(config, 'test:event', {});

      const callArgs = fetchSpy.mock.calls[0][1] as RequestInit;
      const headers = callArgs.headers as Record<string, string>;
      expect(headers['X-Yeoman-Signature']).toBeUndefined();
    });

    it('includes API key header when set', async () => {
      const fetchSpy = mockFetch([{ ok: true, status: 200, json: { accepted: true } }]);
      vi.stubGlobal('fetch', fetchSpy);

      await dispatchToAgnostic(makeConfig({ apiKey: 'key-123' }), 'test', {});

      const callArgs = fetchSpy.mock.calls[0][1] as RequestInit;
      const headers = callArgs.headers as Record<string, string>;
      expect(headers['X-API-Key']).toBe('key-123');
    });

    it('returns accepted=false on non-200 response', async () => {
      vi.stubGlobal('fetch', mockFetch([{ ok: false, status: 503, text: 'Service Unavailable' }]));

      const result = await dispatchToAgnostic(makeConfig(), 'test', {});
      expect(result.accepted).toBe(false);
      expect(result.taskId).toBeUndefined();
    });
  });
});
