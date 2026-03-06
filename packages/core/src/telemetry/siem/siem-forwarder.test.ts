import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SiemForwarder, type SiemProvider, type SiemEvent } from './siem-forwarder.js';

function makeEvent(overrides: Partial<SiemEvent> = {}): SiemEvent {
  return {
    timestamp: new Date().toISOString(),
    source: 'test',
    event: 'test_event',
    severity: 'low',
    message: 'test message',
    metadata: {},
    ...overrides,
  };
}

function makeProvider(overrides: Partial<SiemProvider> = {}): SiemProvider {
  return {
    name: 'mock',
    send: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const mockLogger = {
  trace: vi.fn(), debug: vi.fn(), info: vi.fn(),
  warn: vi.fn(), error: vi.fn(), fatal: vi.fn(),
  child: vi.fn().mockReturnThis(), level: 'info' as const,
};

describe('SiemForwarder', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should buffer events and flush on demand', async () => {
    const provider = makeProvider();
    const forwarder = new SiemForwarder({ provider, logger: mockLogger, batchSize: 10 });

    forwarder.forward(makeEvent());
    forwarder.forward(makeEvent());
    expect(provider.send).not.toHaveBeenCalled();

    await forwarder.flush();
    expect(provider.send).toHaveBeenCalledTimes(1);
    expect((provider.send as any).mock.calls[0][0]).toHaveLength(2);
  });

  it('should auto-flush when batch size reached', async () => {
    const provider = makeProvider();
    const forwarder = new SiemForwarder({ provider, logger: mockLogger, batchSize: 2 });

    forwarder.forward(makeEvent());
    forwarder.forward(makeEvent());
    // Give the void flush a tick to complete
    await new Promise((r) => setTimeout(r, 10));

    expect(provider.send).toHaveBeenCalledTimes(1);
  });

  it('should track stats on success', async () => {
    const provider = makeProvider();
    const forwarder = new SiemForwarder({ provider, logger: mockLogger });

    forwarder.forward(makeEvent());
    forwarder.forward(makeEvent());
    await forwarder.flush();

    expect(forwarder.stats.forwarded).toBe(2);
    expect(forwarder.stats.errors).toBe(0);
    expect(forwarder.stats.dropped).toBe(0);
    expect(forwarder.stats.pending).toBe(0);
  });

  it('should track stats on failure', async () => {
    const provider = makeProvider({ send: vi.fn().mockRejectedValue(new Error('network')) });
    const forwarder = new SiemForwarder({ provider, logger: mockLogger });

    forwarder.forward(makeEvent());
    await forwarder.flush();

    expect(forwarder.stats.errors).toBe(1);
    expect(forwarder.stats.dropped).toBe(1);
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('should not flush if empty', async () => {
    const provider = makeProvider();
    const forwarder = new SiemForwarder({ provider, logger: mockLogger });

    await forwarder.flush();
    expect(provider.send).not.toHaveBeenCalled();
  });

  it('should close cleanly with final flush', async () => {
    const closeFn = vi.fn().mockResolvedValue(undefined);
    const provider = makeProvider({ close: closeFn });
    const forwarder = new SiemForwarder({ provider, logger: mockLogger, flushIntervalMs: 100 });

    forwarder.start();
    forwarder.forward(makeEvent());
    await forwarder.close();

    expect(provider.send).toHaveBeenCalledTimes(1);
    expect(closeFn).toHaveBeenCalled();
  });

  it('should start interval timer and stop on close', async () => {
    const provider = makeProvider();
    const forwarder = new SiemForwarder({ provider, logger: mockLogger, flushIntervalMs: 50 });

    forwarder.start();
    forwarder.forward(makeEvent());
    await new Promise((r) => setTimeout(r, 100));
    await forwarder.close();

    expect(forwarder.stats.forwarded).toBeGreaterThanOrEqual(1);
  });
});
