import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpanStatusCode } from '@opentelemetry/api';

// ─── Mock OTel ───────────────────────────────────────────────────────
// vi.mock is hoisted, so mocks must be defined with vi.hoisted()

const { mockSpan, mockTracer } = vi.hoisted(() => {
  const mockSpan = {
    setAttribute: vi.fn(),
    setStatus: vi.fn(),
    end: vi.fn(),
    recordException: vi.fn(),
    spanContext: vi.fn().mockReturnValue({ traceId: 'abc123traceId00000000000000000000' }),
  };
  const mockTracer = {
    startSpan: vi.fn().mockReturnValue(mockSpan),
  };
  return { mockSpan, mockTracer };
});

vi.mock('./otel.js', () => ({
  getTracer: vi.fn().mockReturnValue(mockTracer),
}));

// ─── Import after mocks ──────────────────────────────────────────────
import { otelFastifyPlugin } from './otel-fastify-plugin.js';
import { getTracer } from './otel.js';

// ─── Helpers ─────────────────────────────────────────────────────────

interface HookMap {
  onRequest?: (req: any, reply: any) => Promise<void>;
  onResponse?: (req: any, reply: any) => Promise<void>;
  onError?: (req: any, reply: any, error: Error) => Promise<void>;
}

function makeFakeApp() {
  const hooks: HookMap = {};
  return {
    addHook: vi.fn((name: string, fn: any) => {
      (hooks as any)[name] = fn;
    }),
    _hooks: hooks,
  };
}

function makeRequest(overrides: Record<string, unknown> = {}): any {
  return {
    method: 'GET',
    url: '/api/v1/health',
    hostname: 'localhost',
    routeOptions: { url: '/api/v1/health' },
    ...overrides,
  };
}

function makeReply(statusCode = 200): any {
  return {
    statusCode,
    header: vi.fn(),
  };
}

describe('otelFastifyPlugin', () => {
  let app: ReturnType<typeof makeFakeApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSpan.setAttribute.mockClear();
    mockSpan.setStatus.mockClear();
    mockSpan.end.mockClear();
    mockSpan.recordException.mockClear();
    mockSpan.spanContext.mockReturnValue({ traceId: 'abc123traceId00000000000000000000' });
    mockTracer.startSpan.mockReturnValue(mockSpan);
    (getTracer as any).mockReturnValue(mockTracer);
    app = makeFakeApp();
  });

  it('registers onRequest, onResponse, and onError hooks', async () => {
    await otelFastifyPlugin(app as any);
    expect(app.addHook).toHaveBeenCalledWith('onRequest', expect.any(Function));
    expect(app.addHook).toHaveBeenCalledWith('onResponse', expect.any(Function));
    expect(app.addHook).toHaveBeenCalledWith('onError', expect.any(Function));
  });

  describe('onRequest hook', () => {
    it('starts a span with method + route as name', async () => {
      await otelFastifyPlugin(app as any);
      const onRequest = app._hooks.onRequest!;
      const req = makeRequest();

      await onRequest(req, makeReply());

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        'GET /api/v1/health',
        expect.objectContaining({ attributes: expect.objectContaining({ 'http.method': 'GET' }) })
      );
    });

    it('stores span on request object', async () => {
      await otelFastifyPlugin(app as any);
      const req = makeRequest();
      await app._hooks.onRequest!(req, makeReply());
      expect((req as any)._otelSpan).toBe(mockSpan);
    });

    it('falls back to url without query string when routeOptions absent', async () => {
      await otelFastifyPlugin(app as any);
      const req = makeRequest({ routeOptions: undefined, url: '/api/test?foo=bar' });
      await app._hooks.onRequest!(req, makeReply());
      expect(mockTracer.startSpan).toHaveBeenCalledWith('GET /api/test', expect.any(Object));
    });
  });

  describe('onResponse hook', () => {
    it('sets status code attribute and ends span', async () => {
      await otelFastifyPlugin(app as any);
      const req = makeRequest() as any;
      req._otelSpan = mockSpan;
      const reply = makeReply(200);

      await app._hooks.onResponse!(req, reply);

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('http.status_code', 200);
      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('sets ERROR status for 5xx responses', async () => {
      await otelFastifyPlugin(app as any);
      const req = makeRequest() as any;
      req._otelSpan = mockSpan;
      await app._hooks.onResponse!(req, makeReply(500));
      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.ERROR });
    });

    it('adds X-Trace-Id header when traceId is real', async () => {
      await otelFastifyPlugin(app as any);
      const req = makeRequest() as any;
      req._otelSpan = mockSpan;
      const reply = makeReply(200);

      await app._hooks.onResponse!(req, reply);

      expect(reply.header).toHaveBeenCalledWith('X-Trace-Id', 'abc123traceId00000000000000000000');
    });

    it('does NOT add X-Trace-Id when traceId is all zeros (no-op tracer)', async () => {
      mockSpan.spanContext.mockReturnValue({ traceId: '00000000000000000000000000000000' });
      await otelFastifyPlugin(app as any);
      const req = makeRequest() as any;
      req._otelSpan = mockSpan;
      const reply = makeReply(200);

      await app._hooks.onResponse!(req, reply);

      expect(reply.header).not.toHaveBeenCalled();
    });

    it('skips gracefully when no span on request', async () => {
      await otelFastifyPlugin(app as any);
      const req = makeRequest();
      // no _otelSpan set
      await expect(app._hooks.onResponse!(req, makeReply())).resolves.not.toThrow();
      expect(mockSpan.end).not.toHaveBeenCalled();
    });
  });

  describe('onError hook', () => {
    it('records exception and sets ERROR status', async () => {
      await otelFastifyPlugin(app as any);
      const req = makeRequest() as any;
      req._otelSpan = mockSpan;
      const error = new Error('Something blew up');

      await app._hooks.onError!(req, makeReply(), error);

      expect(mockSpan.recordException).toHaveBeenCalledWith(error);
      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.ERROR,
        message: 'Something blew up',
      });
    });

    it('skips gracefully when no span on request', async () => {
      await otelFastifyPlugin(app as any);
      const req = makeRequest();
      await expect(app._hooks.onError!(req, makeReply(), new Error('x'))).resolves.not.toThrow();
      expect(mockSpan.recordException).not.toHaveBeenCalled();
    });
  });
});
