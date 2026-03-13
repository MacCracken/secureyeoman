import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuditForwarder } from './audit-forwarder.js';

describe('AuditForwarder', () => {
  const parentUrl = 'http://parent:18789';
  let forwarder: AuditForwarder;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    forwarder = new AuditForwarder({
      parentUrl,
      registrationToken: 'reg-tok',
      batchSize: 3, // Small batch for testing
      flushIntervalMs: 50_000, // Long interval — we'll flush manually
    });
  });

  afterEach(async () => {
    await forwarder.stop();
    vi.restoreAllMocks();
  });

  it('creates instance with default config', () => {
    const f = new AuditForwarder({ parentUrl });
    expect(f.bufferSize).toBe(0);
    expect(f.totalForwarded).toBe(0);
    expect(f.totalDropped).toBe(0);
  });

  describe('record', () => {
    it('buffers events', () => {
      forwarder.start();
      forwarder.record({ event: 'test', level: 'info', message: 'hello', timestamp: Date.now() });
      expect(forwarder.bufferSize).toBe(1);
    });

    it('auto-flushes when buffer reaches batch size', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', mockFetch);

      forwarder.start();

      // Record batchSize events to trigger auto-flush
      forwarder.record({ event: 'a', level: 'info', message: 'm', timestamp: 1 });
      forwarder.record({ event: 'b', level: 'info', message: 'm', timestamp: 2 });
      forwarder.record({ event: 'c', level: 'info', message: 'm', timestamp: 3 });

      // Wait for async flush
      await new Promise((r) => setTimeout(r, 50));

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(forwarder.totalForwarded).toBe(3);
      expect(forwarder.bufferSize).toBe(0);
    });

    it('does not record after stop', async () => {
      forwarder.start();
      await forwarder.stop();

      forwarder.record({ event: 'late', level: 'info', message: 'm', timestamp: Date.now() });
      expect(forwarder.bufferSize).toBe(0);
    });
  });

  describe('flush', () => {
    it('sends batch to parent with correct format', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', mockFetch);

      forwarder.start();
      forwarder.record({
        event: 'auth:login',
        level: 'info',
        message: 'user logged in',
        timestamp: 1000,
      });

      await forwarder.flush();

      expect(mockFetch).toHaveBeenCalledWith(
        `${parentUrl}/api/v1/audit/forward`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer reg-tok',
          }),
        })
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.source).toBe('agent');
      expect(body.events).toHaveLength(1);
      expect(body.events[0].event).toBe('auth:login');
    });

    it('does nothing when buffer is empty', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      await forwarder.flush();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('tracks dropped events on non-ok response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

      forwarder.start();
      forwarder.record({ event: 'test', level: 'error', message: 'fail', timestamp: 1 });

      await forwarder.flush();

      expect(forwarder.totalDropped).toBe(1);
      expect(forwarder.totalForwarded).toBe(0);
    });

    it('tracks dropped events on fetch error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

      forwarder.start();
      forwarder.record({ event: 'test', level: 'warn', message: 'x', timestamp: 1 });

      await forwarder.flush();

      expect(forwarder.totalDropped).toBe(1);
    });
  });

  describe('stop', () => {
    it('flushes remaining events on stop', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', mockFetch);

      forwarder.start();
      forwarder.record({ event: 'final', level: 'info', message: 'bye', timestamp: 1 });

      await forwarder.stop();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(forwarder.totalForwarded).toBe(1);
    });

    it('is safe to call multiple times', async () => {
      forwarder.start();
      await forwarder.stop();
      await forwarder.stop(); // Should not throw
    });
  });

  describe('timer flush', () => {
    it('flushes on interval', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', mockFetch);

      const fast = new AuditForwarder({
        parentUrl,
        flushIntervalMs: 30,
        batchSize: 100, // High batch size so it doesn't auto-flush on record
      });

      fast.start();
      fast.record({ event: 'timed', level: 'info', message: 'm', timestamp: 1 });

      // Wait for timer to fire
      await new Promise((r) => setTimeout(r, 80));

      expect(mockFetch).toHaveBeenCalled();

      await fast.stop();
    });
  });
});
