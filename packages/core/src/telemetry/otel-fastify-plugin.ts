/**
 * Fastify OTEL Plugin (Phase 83)
 *
 * Wraps each incoming HTTP request in an OpenTelemetry span.
 * Safe when the OTel SDK is not initialized — getTracer() returns a
 * no-op tracer, so span operations are zero-overhead no-ops.
 *
 * Also injects X-Trace-Id response header so callers can correlate
 * requests to traces without querying the collector directly.
 */

import type { FastifyInstance } from 'fastify';
import { getTracer } from './otel.js';
import { SpanStatusCode, SpanKind } from '@opentelemetry/api';

export async function otelFastifyPlugin(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (request, _reply) => {
    const tracer = getTracer('http');
    const spanName = `${request.method} ${request.routeOptions?.url ?? request.url.split('?')[0]}`;

    const span = tracer.startSpan(spanName, {
      kind: SpanKind.SERVER,
      attributes: {
        'http.method': request.method,
        'http.target': request.url,
        'http.route': request.routeOptions?.url ?? request.url.split('?')[0],
        'http.host': request.hostname,
      },
    });

    // Store span reference for cleanup in onResponse / onError hooks
    (request as any)._otelSpan = span;
  });

  app.addHook('onResponse', async (request, reply) => {
    const span = (request as any)._otelSpan;
    if (!span) return;

    span.setAttribute('http.status_code', reply.statusCode);
    if (reply.statusCode >= 500) {
      span.setStatus({ code: SpanStatusCode.ERROR });
    } else {
      span.setStatus({ code: SpanStatusCode.OK });
    }

    const traceId = span.spanContext().traceId;
    if (traceId && traceId !== '00000000000000000000000000000000') {
      void reply.header('X-Trace-Id', traceId);
    }

    span.end();
  });

  app.addHook('onError', async (request, _reply, error) => {
    const span = (request as any)._otelSpan;
    if (!span) return;

    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  });
}
