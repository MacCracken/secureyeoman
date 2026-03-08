import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  injectTraceContext,
  extractTraceContext,
  startCrossServiceSpan,
  tracedFetch,
  OtelBridge,
} from './otel-bridge.js';

describe('otel-bridge', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('injectTraceContext', () => {
    it('returns headers object (may include traceparent when OTEL initialized)', () => {
      const headers = injectTraceContext({ 'Content-Type': 'application/json' });
      expect(headers['Content-Type']).toBe('application/json');
      // Without active OTEL SDK, propagation is no-op
      expect(typeof headers).toBe('object');
    });

    it('preserves existing headers', () => {
      const headers = injectTraceContext({
        Authorization: 'Bearer tok',
        'X-Custom': 'value',
      });
      expect(headers.Authorization).toBe('Bearer tok');
      expect(headers['X-Custom']).toBe('value');
    });
  });

  describe('extractTraceContext', () => {
    it('returns context object from headers', () => {
      const ctx = extractTraceContext({
        traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
      });
      expect(ctx).toBeTruthy();
    });
  });

  describe('startCrossServiceSpan', () => {
    it('creates span and enriches headers', () => {
      const result = startCrossServiceSpan('secureyeoman', 'agnostic:health', 'agnostic', {
        'Content-Type': 'application/json',
      });
      expect(result.span).toBeTruthy();
      expect(result.headers['Content-Type']).toBe('application/json');
      result.span.end();
    });
  });

  describe('tracedFetch', () => {
    it('makes HTTP request with trace context', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });
      vi.stubGlobal('fetch', fetchSpy);

      const res = await tracedFetch(
        'secureyeoman',
        'agnostic:health',
        'agnostic',
        'http://localhost:8000/health',
        { method: 'GET' }
      );

      expect(res.ok).toBe(true);
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:8000/health',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('records error status on non-ok response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 503,
        })
      );

      const res = await tracedFetch(
        'secureyeoman',
        'agnos:health',
        'agnos',
        'http://localhost:8090/health'
      );

      expect(res.ok).toBe(false);
    });

    it('propagates errors from fetch', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

      await expect(
        tracedFetch('secureyeoman', 'agnos:test', 'agnos', 'http://localhost:8090/test')
      ).rejects.toThrow('ECONNREFUSED');
    });
  });

  describe('OtelBridge', () => {
    it('constructs with config', () => {
      const bridge = new OtelBridge(
        { serviceName: 'test' },
        { logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any }
      );
      expect(bridge).toBeTruthy();
    });

    it('fetchAgnostic makes traced request', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal('fetch', fetchSpy);

      const bridge = new OtelBridge(
        {},
        { logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any }
      );

      const res = await bridge.fetchAgnostic('/health', 'http://localhost:8000');
      expect(res.ok).toBe(true);
      expect(fetchSpy).toHaveBeenCalledWith('http://localhost:8000/health', expect.anything());
    });

    it('getTraceHeaders returns headers object', () => {
      const bridge = new OtelBridge(
        {},
        { logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any }
      );
      const headers = bridge.getTraceHeaders();
      expect(typeof headers).toBe('object');
    });

    it('withCrossProjectSpan wraps async operations', async () => {
      const bridge = new OtelBridge(
        { serviceName: 'test' },
        { logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any }
      );

      const result = await bridge.withCrossProjectSpan('test-op', 'agnostic', async () => 'done');
      expect(result).toBe('done');
    });

    it('withCrossProjectSpan records errors', async () => {
      const bridge = new OtelBridge(
        { serviceName: 'test' },
        { logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any }
      );

      await expect(
        bridge.withCrossProjectSpan('fail-op', 'agnos', async () => {
          throw new Error('test error');
        })
      ).rejects.toThrow('test error');
    });
  });
});
