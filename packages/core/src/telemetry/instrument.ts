/**
 * OTel Instrumentation Utility (Phase 139)
 *
 * Provides `withSpan()` — a concise wrapper for creating child spans with
 * standard error handling.  Callers never need to manually manage span
 * lifecycle (end, setStatus, recordException).
 *
 * Also provides `getCurrentSpanId()` for trace-aware logging.
 */

import { trace, SpanStatusCode, type Span, type SpanOptions } from '@opentelemetry/api';
import { getTracer } from './otel.js';

/**
 * Execute `fn` inside an OTel span named `spanName`.
 * On success the span ends with OK; on error it records the exception,
 * sets ERROR status, re-throws, and ends the span.
 *
 * The span is made the active span in context so child spans link correctly.
 */
export async function withSpan<T>(
  tracerName: string,
  spanName: string,
  fn: (span: Span) => Promise<T>,
  options?: SpanOptions
): Promise<T> {
  const tracer = getTracer(tracerName);
  return tracer.startActiveSpan(spanName, options ?? {}, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      return result;
    } catch (error) {
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      span.end();
      throw error;
    }
  });
}

/**
 * Extract the current span's spanId for log correlation.
 * Returns null when no active span exists.
 */
export function getCurrentSpanId(): string | null {
  return trace.getActiveSpan()?.spanContext().spanId ?? null;
}
