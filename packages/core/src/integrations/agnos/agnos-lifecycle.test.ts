import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgnosLifecycleManager } from './agnos-lifecycle.js';
import type { AgnosClient, AgnosAgentProfile } from './agnos-client.js';

const PROFILES: AgnosAgentProfile[] = [
  { id: 'agent-1', name: 'T.Ron', capabilities: ['chat', 'code'] },
  { id: 'agent-2', name: 'FRIDAY', capabilities: ['chat'] },
];

function makeClient(overrides?: Partial<AgnosClient>): AgnosClient {
  return {
    registerAgentsBatch: vi.fn().mockResolvedValue({ registered: 2 }),
    deregisterAgent: vi.fn().mockResolvedValue(undefined),
    heartbeat: vi.fn().mockResolvedValue(undefined),
    health: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as unknown as AgnosClient;
}

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

describe('AgnosLifecycleManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('registers agents on start and sends heartbeats', async () => {
    const client = makeClient();
    const manager = new AgnosLifecycleManager(client, logger, { heartbeatIntervalMs: 1000 });

    await manager.start(PROFILES);
    expect(client.registerAgentsBatch).toHaveBeenCalledWith(PROFILES);

    // Advance timer to trigger heartbeat
    await vi.advanceTimersByTimeAsync(1000);
    expect(client.heartbeat).toHaveBeenCalledWith(['agent-1', 'agent-2']);

    await manager.stop();
  });

  it('deregisters agents on stop', async () => {
    const client = makeClient();
    const manager = new AgnosLifecycleManager(client, logger);

    await manager.start(PROFILES);
    await manager.stop();

    expect(client.deregisterAgent).toHaveBeenCalledTimes(2);
    expect(client.deregisterAgent).toHaveBeenCalledWith('agent-1');
    expect(client.deregisterAgent).toHaveBeenCalledWith('agent-2');
  });

  it('handles registration failure gracefully', async () => {
    const client = makeClient({
      registerAgentsBatch: vi.fn().mockRejectedValue(new Error('connection refused')),
    });
    const manager = new AgnosLifecycleManager(client, logger);

    // Should not throw
    await manager.start(PROFILES);
    await manager.stop();
  });

  it('skips when no profiles provided', async () => {
    const client = makeClient();
    const manager = new AgnosLifecycleManager(client, logger);

    await manager.start([]);
    expect(client.registerAgentsBatch).not.toHaveBeenCalled();

    await manager.stop();
    expect(client.deregisterAgent).not.toHaveBeenCalled();
  });
});
