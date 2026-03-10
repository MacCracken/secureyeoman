import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerAgnosHooks } from './agnos-hooks.js';
import type { AgnosHooksConfig, AgnosHooksDeps } from './agnos-hooks.js';
import type { ExtensionManager } from '../../extensions/manager.js';
import type { AgnosClient } from './agnos-client.js';

const noop = () => {};
const logger = {
  trace: noop,
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
  fatal: noop,
  child: () => logger,
} as any;

function makeMockExtensionManager(): ExtensionManager {
  const hooks = new Map<string, { point: string; handler: Function }>();
  let hookId = 0;
  return {
    registerHook: vi.fn().mockImplementation((point: string, handler: Function) => {
      const id = `hook-${++hookId}`;
      hooks.set(id, { point, handler });
      return id;
    }),
    unregisterHook: vi.fn(),
    emit: vi.fn().mockResolvedValue({ vetoed: false, errors: [] }),
    _hooks: hooks,
  } as unknown as ExtensionManager;
}

function makeMockClient(): AgnosClient {
  return {
    forwardAuditEvents: vi.fn().mockResolvedValue({ accepted: 1 }),
    publishEvent: vi.fn().mockResolvedValue(undefined),
    subscribeEvents: vi.fn().mockReturnValue({ abort: vi.fn() }),
  } as unknown as AgnosClient;
}

function defaultDeps(overrides?: Partial<AgnosHooksDeps>): AgnosHooksDeps {
  return {
    extensionManager: makeMockExtensionManager(),
    agnosClient: makeMockClient(),
    logger,
    ...overrides,
  };
}

describe('registerAgnosHooks', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns noop cleanup when disabled', () => {
    const deps = defaultDeps();
    const unregister = registerAgnosHooks({ enabled: false }, deps);
    expect(typeof unregister).toBe('function');
    expect(deps.extensionManager.registerHook).not.toHaveBeenCalled();
  });

  it('registers audit forwarding hooks for security and task events', () => {
    const deps = defaultDeps();
    registerAgnosHooks({ enabled: true }, deps);

    const hookPoints = (deps.extensionManager.registerHook as any).mock.calls.map((c: any) => c[0]);
    expect(hookPoints).toContain('security:auth-success');
    expect(hookPoints).toContain('security:auth-failure');
    expect(hookPoints).toContain('task:after-execute');
    expect(hookPoints).toContain('agent:after-delegate');
  });

  it('registers event publishing hooks for lifecycle events', () => {
    const deps = defaultDeps();
    registerAgnosHooks({ enabled: true }, deps);

    const hookPoints = (deps.extensionManager.registerHook as any).mock.calls.map((c: any) => c[0]);
    expect(hookPoints).toContain('swarm:after-execute');
    expect(hookPoints).toContain('system:error');
  });

  it('starts SSE subscription with default topics', () => {
    const deps = defaultDeps();
    registerAgnosHooks({ enabled: true }, deps);

    expect(deps.agnosClient.subscribeEvents).toHaveBeenCalledWith(
      ['agent.*', 'task.*'],
      expect.any(Function)
    );
  });

  it('uses custom subscribe topics', () => {
    const deps = defaultDeps();
    registerAgnosHooks({ enabled: true, subscribeTopics: ['swarm.*', 'system.*'] }, deps);

    expect(deps.agnosClient.subscribeEvents).toHaveBeenCalledWith(
      ['swarm.*', 'system.*'],
      expect.any(Function)
    );
  });

  it('unregisters all hooks and aborts SSE on cleanup', () => {
    const deps = defaultDeps();
    const unregister = registerAgnosHooks({ enabled: true }, deps);

    const registeredCount = (deps.extensionManager.registerHook as any).mock.calls.length;
    expect(registeredCount).toBeGreaterThan(0);

    unregister();

    expect(deps.extensionManager.unregisterHook).toHaveBeenCalledTimes(registeredCount);
  });

  it('respects per-feature disable flags', () => {
    const deps = defaultDeps();
    registerAgnosHooks(
      { enabled: true, forwardAudit: false, publishEvents: false, subscribeEvents: false },
      deps
    );

    expect(deps.extensionManager.registerHook).not.toHaveBeenCalled();
    expect(deps.agnosClient.subscribeEvents).not.toHaveBeenCalled();
  });

  it('batches audit events and flushes on size threshold', async () => {
    const deps = defaultDeps();
    registerAgnosHooks(
      { enabled: true, auditBatchSize: 2, publishEvents: false, subscribeEvents: false },
      deps
    );

    // Find the audit hook handler for task:after-execute
    const calls = (deps.extensionManager.registerHook as any).mock.calls;
    const taskAfterCall = calls.find((c: any) => c[0] === 'task:after-execute');
    expect(taskAfterCall).toBeDefined();
    const handler = taskAfterCall[1];

    // Push first event — should not flush yet
    await handler({ event: 'task:after-execute', timestamp: Date.now(), data: { taskId: '1' } });
    expect(deps.agnosClient.forwardAuditEvents).not.toHaveBeenCalled();

    // Push second event — should trigger flush (batchSize=2)
    await handler({ event: 'task:after-execute', timestamp: Date.now(), data: { taskId: '2' } });
    // flush is fire-and-forget, wait a tick
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.agnosClient.forwardAuditEvents).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ event: 'task:after-execute', source: 'secureyeoman' }),
      ])
    );
  });

  it('flushes audit events on timer interval', async () => {
    const deps = defaultDeps();
    registerAgnosHooks(
      {
        enabled: true,
        auditFlushIntervalMs: 3000,
        auditBatchSize: 100,
        publishEvents: false,
        subscribeEvents: false,
      },
      deps
    );

    const calls = (deps.extensionManager.registerHook as any).mock.calls;
    const authSuccessCall = calls.find((c: any) => c[0] === 'security:auth-success');
    const handler = authSuccessCall[1];

    await handler({ event: 'security:auth-success', timestamp: Date.now(), data: {} });
    expect(deps.agnosClient.forwardAuditEvents).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(3000);
    expect(deps.agnosClient.forwardAuditEvents).toHaveBeenCalledTimes(1);
  });

  it('publishes events to AGNOS on hook trigger', async () => {
    const deps = defaultDeps();
    registerAgnosHooks({ enabled: true, forwardAudit: false, subscribeEvents: false }, deps);

    const calls = (deps.extensionManager.registerHook as any).mock.calls;
    const swarmCall = calls.find((c: any) => c[0] === 'swarm:after-execute');
    const handler = swarmCall[1];

    await handler({
      event: 'swarm:after-execute',
      timestamp: 1234567890,
      data: { swarmId: 'sw-1', status: 'completed' },
    });

    expect(deps.agnosClient.publishEvent).toHaveBeenCalledWith(
      'secureyeoman.swarm:after-execute',
      expect.objectContaining({
        event: 'swarm:after-execute',
        swarmId: 'sw-1',
        status: 'completed',
      })
    );
  });

  it('forwards SSE events into extension manager emit', () => {
    const deps = defaultDeps();
    registerAgnosHooks({ enabled: true, forwardAudit: false, publishEvents: false }, deps);

    const onEvent = (deps.agnosClient.subscribeEvents as any).mock.calls[0][1];
    onEvent({
      topic: 'agent.completed',
      data: { agentId: 'a1' },
      timestamp: '2026-03-10T00:00:00Z',
    });

    expect(deps.extensionManager.emit).toHaveBeenCalledWith(
      'system:startup',
      expect.objectContaining({
        event: 'agnos:agent.completed',
        data: { agentId: 'a1' },
      })
    );
  });

  it('does not crash when audit forwarding fails', async () => {
    const deps = defaultDeps();
    (deps.agnosClient.forwardAuditEvents as any).mockRejectedValue(new Error('network'));
    registerAgnosHooks(
      { enabled: true, auditBatchSize: 1, publishEvents: false, subscribeEvents: false },
      deps
    );

    const calls = (deps.extensionManager.registerHook as any).mock.calls;
    const handler = calls.find((c: any) => c[0] === 'task:after-execute')[1];

    // Should not throw
    await handler({ event: 'task:after-execute', timestamp: Date.now(), data: {} });
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.agnosClient.forwardAuditEvents).toHaveBeenCalled();
  });

  it('uses custom publish hook points', () => {
    const deps = defaultDeps();
    registerAgnosHooks(
      {
        enabled: true,
        forwardAudit: false,
        subscribeEvents: false,
        publishHookPoints: ['ai:after-response', 'memory:after-store'],
      },
      deps
    );

    const hookPoints = (deps.extensionManager.registerHook as any).mock.calls.map((c: any) => c[0]);
    expect(hookPoints).toContain('ai:after-response');
    expect(hookPoints).toContain('memory:after-store');
    expect(hookPoints).not.toContain('swarm:after-execute');
  });
});
