/**
 * Unified OpenTelemetry Bridge — Cross-project trace correlation.
 *
 * Bridges SecureYeoman's OTEL traces with AGNOSTIC and AGNOS by:
 *   1. Propagating W3C trace context (traceparent/tracestate) in outbound requests
 *   2. Accepting inbound trace context from cross-project calls
 *   3. Forwarding span data to a shared OTLP collector endpoint
 *   4. Creating correlation spans for cross-service hops
 *
 * Phase C — Unified OpenTelemetry Pipeline
 */

import { trace, context, propagation, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import type { Span, Tracer } from '@opentelemetry/api';
import type { SecureLogger } from '../logging/logger.js';

export interface OtelBridgeConfig {
  /** Shared OTLP endpoint for cross-project traces. Falls back to OTEL_EXPORTER_OTLP_ENDPOINT. */
  sharedOtlpEndpoint?: string;
  /** Service name for this instance. Default: 'secureyeoman' */
  serviceName?: string;
  /** Whether to inject trace context into outbound AGNOSTIC/AGNOS requests */
  propagateContext?: boolean;
}

export interface OtelBridgeDeps {
  logger: SecureLogger;
}

/**
 * Injects W3C traceparent/tracestate headers into outbound request headers.
 * Call before making cross-project HTTP requests to AGNOSTIC or AGNOS.
 */
export function injectTraceContext(headers: Record<string, string>): Record<string, string> {
  const enriched = { ...headers };
  propagation.inject(context.active(), enriched, {
    set(carrier, key, value) {
      carrier[key] = value;
    },
  });
  return enriched;
}

/**
 * Extracts W3C trace context from inbound request headers.
 * Call when receiving cross-project requests to continue the trace.
 */
export function extractTraceContext(headers: Record<string, string>): ReturnType<typeof context.active> {
  return propagation.extract(context.active(), headers, {
    get(carrier, key) {
      return carrier[key];
    },
    keys(carrier) {
      return Object.keys(carrier);
    },
  });
}

/**
 * Create a cross-service span for tracking a request to AGNOSTIC or AGNOS.
 * Automatically injects trace context into the provided headers.
 */
export function startCrossServiceSpan(
  tracerName: string,
  operationName: string,
  targetService: string,
  headers: Record<string, string>
): { span: Span; headers: Record<string, string> } {
  const tracer = trace.getTracer(tracerName);
  const span = tracer.startSpan(operationName, {
    kind: SpanKind.CLIENT,
    attributes: {
      'peer.service': targetService,
      'rpc.system': 'http',
    },
  });

  // Inject trace context into headers within span context
  const ctx = trace.setSpan(context.active(), span);
  const enrichedHeaders = { ...headers };
  propagation.inject(ctx, enrichedHeaders, {
    set(carrier, key, value) {
      carrier[key] = value;
    },
  });

  return { span, headers: enrichedHeaders };
}

/**
 * Wraps a cross-service HTTP call with automatic span creation and error handling.
 */
export async function tracedFetch(
  tracerName: string,
  operationName: string,
  targetService: string,
  url: string,
  init?: RequestInit
): Promise<Response> {
  const headers = { ...(init?.headers as Record<string, string> ?? {}) };
  const { span, headers: enrichedHeaders } = startCrossServiceSpan(
    tracerName,
    operationName,
    targetService,
    headers
  );

  try {
    const response = await fetch(url, { ...init, headers: enrichedHeaders });

    span.setAttribute('http.status_code', response.status);
    span.setAttribute('http.url', url);

    if (!response.ok) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: `HTTP ${response.status}` });
    }

    return response;
  } catch (err) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  } finally {
    span.end();
  }
}

/**
 * OtelBridge manages the unified pipeline configuration and provides
 * convenience methods for cross-project traced calls.
 */
export class OtelBridge {
  private readonly config: OtelBridgeConfig;
  private readonly logger: SecureLogger;
  private readonly tracer: Tracer;

  constructor(config: OtelBridgeConfig, deps: OtelBridgeDeps) {
    this.config = config;
    this.logger = deps.logger;
    this.tracer = trace.getTracer(config.serviceName ?? 'secureyeoman');
  }

  /**
   * Make a traced HTTP request to AGNOSTIC.
   */
  async fetchAgnostic(
    path: string,
    agnosticUrl: string,
    init?: RequestInit
  ): Promise<Response> {
    return tracedFetch(
      this.config.serviceName ?? 'secureyeoman',
      `agnostic:${path}`,
      'agnostic',
      `${agnosticUrl}${path}`,
      init
    );
  }

  /**
   * Make a traced HTTP request to AGNOS runtime.
   */
  async fetchAgnosRuntime(
    path: string,
    runtimeUrl: string,
    init?: RequestInit
  ): Promise<Response> {
    return tracedFetch(
      this.config.serviceName ?? 'secureyeoman',
      `agnos-runtime:${path}`,
      'agnos-runtime',
      `${runtimeUrl}${path}`,
      init
    );
  }

  /**
   * Make a traced HTTP request to AGNOS gateway.
   */
  async fetchAgnosGateway(
    path: string,
    gatewayUrl: string,
    init?: RequestInit
  ): Promise<Response> {
    return tracedFetch(
      this.config.serviceName ?? 'secureyeoman',
      `agnos-gateway:${path}`,
      'agnos-gateway',
      `${gatewayUrl}${path}`,
      init
    );
  }

  /**
   * Create a span wrapping a cross-project operation.
   */
  async withCrossProjectSpan<T>(
    name: string,
    targetService: string,
    fn: (span: Span) => Promise<T>
  ): Promise<T> {
    const span = this.tracer.startSpan(name, {
      kind: SpanKind.CLIENT,
      attributes: { 'peer.service': targetService },
    });

    try {
      const result = await fn(span);
      return result;
    } catch (err) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    } finally {
      span.end();
    }
  }

  /**
   * Get the current trace context as headers for manual injection.
   */
  getTraceHeaders(): Record<string, string> {
    return injectTraceContext({});
  }
}
