import { describe, it, expect, beforeEach } from 'vitest';
import { BackpressureManager, createBackpressureHook } from './backpressure.js';

function makeManager(opts?: Partial<{ enabled: boolean; drainPeriodMs: number }>) {
  return new BackpressureManager({
    enabled: opts?.enabled ?? true,
    drainPeriodMs: opts?.drainPeriodMs ?? 30000,
  });
}

describe('BackpressureManager', () => {
  let mgr: BackpressureManager;

  beforeEach(() => {
    mgr = makeManager();
  });

  // ── Level classification ────────────────────────────────────────

  it('defaults to normal level', () => {
    expect(mgr.getLevel()).toBe('normal');
  });

  it('setPressure changes level to elevated', () => {
    mgr.setPressure(0.5);
    expect(mgr.getLevel()).toBe('elevated');
  });

  it('setPressure changes level to critical', () => {
    mgr.setPressure(0.8);
    expect(mgr.getLevel()).toBe('critical');
  });

  it('clamps pressure to [0, 1]', () => {
    mgr.setPressure(2);
    expect(mgr.getLevel()).toBe('critical');
    mgr.setPressure(-1);
    expect(mgr.getLevel()).toBe('normal');
  });

  // ── Normal level allows all routes ──────────────────────────────

  it('normal level allows all routes', () => {
    mgr.setPressure(0);
    expect(mgr.shouldReject('/api/v1/auth/login')).toBe(false);
    expect(mgr.shouldReject('/api/v1/chat/ws')).toBe(false);
    expect(mgr.shouldReject('/health')).toBe(false);
    expect(mgr.shouldReject('/api/v1/soul/config')).toBe(false);
    expect(mgr.shouldReject('/metrics')).toBe(false);
    expect(mgr.shouldReject('/api/v1/diagnostics/info')).toBe(false);
  });

  // ── Elevated level rejects low-priority ─────────────────────────

  it('elevated level rejects low-priority but allows normal and critical', () => {
    mgr.setPressure(0.5);

    // Critical routes pass
    expect(mgr.shouldReject('/api/v1/auth/login')).toBe(false);
    expect(mgr.shouldReject('/api/v1/chat/ws')).toBe(false);
    expect(mgr.shouldReject('/health')).toBe(false);

    // Normal routes pass
    expect(mgr.shouldReject('/api/v1/soul/config')).toBe(false);
    expect(mgr.shouldReject('/api/v1/chat/messages')).toBe(false);

    // Low-priority routes rejected
    expect(mgr.shouldReject('/metrics')).toBe(true);
    expect(mgr.shouldReject('/prom/metrics')).toBe(true);
    expect(mgr.shouldReject('/api/v1/training/export')).toBe(true);
    expect(mgr.shouldReject('/api/v1/diagnostics/info')).toBe(true);
  });

  // ── Critical level only allows critical routes ──────────────────

  it('critical level only allows critical routes', () => {
    mgr.setPressure(0.9);

    // Critical routes pass
    expect(mgr.shouldReject('/api/v1/auth/login')).toBe(false);
    expect(mgr.shouldReject('/api/v1/chat/ws')).toBe(false);
    expect(mgr.shouldReject('/health')).toBe(false);

    // Normal routes rejected
    expect(mgr.shouldReject('/api/v1/soul/config')).toBe(true);
    expect(mgr.shouldReject('/api/v1/chat/messages')).toBe(true);

    // Low-priority routes rejected
    expect(mgr.shouldReject('/metrics')).toBe(true);
    expect(mgr.shouldReject('/api/v1/diagnostics/info')).toBe(true);
  });

  // ── Drain mode ──────────────────────────────────────────────────

  it('drain mode rejects all requests including critical', () => {
    mgr.startDrain();
    expect(mgr.draining).toBe(true);
    expect(mgr.shouldReject('/api/v1/auth/login')).toBe(true);
    expect(mgr.shouldReject('/health')).toBe(true);
    expect(mgr.shouldReject('/api/v1/soul/config')).toBe(true);
    expect(mgr.shouldReject('/metrics')).toBe(true);
  });

  // ── Disabled mode ───────────────────────────────────────────────

  it('disabled manager allows all routes even under pressure', () => {
    const disabled = makeManager({ enabled: false });
    disabled.setPressure(0.9);
    expect(disabled.shouldReject('/metrics')).toBe(false);
    expect(disabled.shouldReject('/api/v1/soul/config')).toBe(false);
  });

  it('disabled manager still rejects in drain mode', () => {
    const disabled = makeManager({ enabled: false });
    disabled.startDrain();
    expect(disabled.shouldReject('/health')).toBe(true);
  });

  // ── Stats tracking ──────────────────────────────────────────────

  it('getStats tracks rejection counts', () => {
    mgr.setPressure(0.5);

    // Trigger low-priority rejections
    mgr.shouldReject('/metrics');
    mgr.shouldReject('/prom/metrics');

    const stats = mgr.getStats();
    expect(stats.level).toBe('elevated');
    expect(stats.pressure).toBe(0.5);
    expect(stats.draining).toBe(false);
    expect(stats.rejectedLow).toBe(2);
    expect(stats.rejectedNormal).toBe(0);
    expect(stats.rejectedDrain).toBe(0);
  });

  it('getStats tracks normal rejections in critical mode', () => {
    mgr.setPressure(0.9);

    mgr.shouldReject('/api/v1/soul/config');
    mgr.shouldReject('/metrics');

    const stats = mgr.getStats();
    expect(stats.rejectedNormal).toBe(1);
    expect(stats.rejectedLow).toBe(1);
  });

  it('getStats tracks drain rejections', () => {
    mgr.startDrain();
    mgr.shouldReject('/health');
    mgr.shouldReject('/metrics');

    const stats = mgr.getStats();
    expect(stats.rejectedDrain).toBe(2);
  });

  // ── stop() resets state ─────────────────────────────────────────

  it('stop resets all state', () => {
    mgr.setPressure(0.9);
    mgr.startDrain();
    mgr.shouldReject('/metrics');
    mgr.stop();

    expect(mgr.getLevel()).toBe('normal');
    expect(mgr.draining).toBe(false);
    const stats = mgr.getStats();
    expect(stats.rejectedLow).toBe(0);
    expect(stats.rejectedDrain).toBe(0);
  });
});

describe('createBackpressureHook', () => {
  it('returns 503 with Retry-After header when rejecting', async () => {
    const mgr = makeManager();
    mgr.setPressure(0.5); // elevated — low-priority rejected
    const hook = createBackpressureHook(mgr);

    let sentStatus = 0;
    let sentBody: unknown = null;
    const headers: Record<string, string> = {};

    const fakeRequest = { url: '/metrics' } as any;
    const fakeReply = {
      code(c: number) {
        sentStatus = c;
        return this;
      },
      header(k: string, v: string) {
        headers[k] = v;
        return this;
      },
      send(body: unknown) {
        sentBody = body;
        return this;
      },
    } as any;

    await hook(fakeRequest, fakeReply);

    expect(sentStatus).toBe(503);
    expect(headers['Retry-After']).toBe('30');
    expect((sentBody as any).error).toBe('Service Unavailable');
  });

  it('does not reject allowed routes', async () => {
    const mgr = makeManager();
    mgr.setPressure(0.5);
    const hook = createBackpressureHook(mgr);

    let called = false;
    const fakeRequest = { url: '/api/v1/auth/login' } as any;
    const fakeReply = {
      code() {
        called = true;
        return this;
      },
      header() {
        return this;
      },
      send() {
        return this;
      },
    } as any;

    await hook(fakeRequest, fakeReply);
    expect(called).toBe(false);
  });

  it('handles query strings in URLs', async () => {
    const mgr = makeManager();
    mgr.setPressure(0.5);
    const hook = createBackpressureHook(mgr);

    // /metrics?foo=bar should still be classified as low-priority
    let sentStatus = 0;
    const fakeRequest = { url: '/metrics?foo=bar' } as any;
    const fakeReply = {
      code(c: number) {
        sentStatus = c;
        return this;
      },
      header() {
        return this;
      },
      send() {
        return this;
      },
    } as any;

    await hook(fakeRequest, fakeReply);
    expect(sentStatus).toBe(503);
  });
});
