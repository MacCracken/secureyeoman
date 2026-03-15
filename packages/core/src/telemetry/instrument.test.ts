import { describe, it, expect, vi } from 'vitest';
import { withSpan, getCurrentSpanId } from './instrument.js';

vi.mock('./otel.js', () => ({
  getTracer: () => ({
    startActiveSpan: (_name: string, _opts: unknown, fn: (span: any) => Promise<any>) => {
      const mockSpan = {
        setAttribute: vi.fn(),
        setStatus: vi.fn(),
        recordException: vi.fn(),
        end: vi.fn(),
      };
      return fn(mockSpan);
    },
  }),
}));

vi.mock('@opentelemetry/api', () => ({
  trace: {
    getActiveSpan: () => ({
      spanContext: () => ({ spanId: 'abc123span' }),
    }),
  },
  SpanStatusCode: { OK: 1, ERROR: 2 },
}));

describe('instrument', () => {
  describe('withSpan', () => {
    it('should execute function and return result', async () => {
      const result = await withSpan('test', 'test.op', async (span) => {
        span.setAttribute('key', 'value');
        return 42;
      });
      expect(result).toBe(42);
    });

    it('should set OK status on success', async () => {
      let capturedSpan: any;
      await withSpan('test', 'test.op', async (span) => {
        capturedSpan = span;
        return 'ok';
      });
      expect(capturedSpan.setStatus).toHaveBeenCalledWith({ code: 1 });
      expect(capturedSpan.end).toHaveBeenCalled();
    });

    it('should set ERROR status and rethrow on failure', async () => {
      let capturedSpan: any;
      await expect(
        withSpan('test', 'test.op', async (span) => {
          capturedSpan = span;
          throw new Error('boom');
        })
      ).rejects.toThrow('boom');

      expect(capturedSpan.recordException).toHaveBeenCalled();
      expect(capturedSpan.setStatus).toHaveBeenCalledWith({
        code: 2,
        message: 'boom',
      });
      expect(capturedSpan.end).toHaveBeenCalled();
    });

    it('should handle non-Error exceptions', async () => {
      let capturedSpan: any;
      await expect(
        withSpan('test', 'test.op', async (span) => {
          capturedSpan = span;
          throw 'string error';
        })
      ).rejects.toThrow('string error');

      expect(capturedSpan.recordException).toHaveBeenCalled();
      expect(capturedSpan.setStatus).toHaveBeenCalledWith({
        code: 2,
        message: 'string error',
      });
    });
  });

  describe('getCurrentSpanId', () => {
    it('should return the active span ID', () => {
      expect(getCurrentSpanId()).toBe('abc123span');
    });
  });
});
