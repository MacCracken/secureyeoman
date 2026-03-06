/**
 * OpenTelemetry Bootstrap (Phase 83)
 *
 * Provides:
 *   initTracing()       — call once at startup; no-op when env var absent
 *   getTracer(name)     — returns a tracer (no-op tracer when SDK not inited)
 *   getCurrentTraceId() — extracts active span's traceId for log correlation
 *
 * Design:
 *   @opentelemetry/api is always installed (lightweight, peer-dep friendly).
 *   The heavier sdk-trace-node + exporter are dynamic-imported only when
 *   OTEL_EXPORTER_OTLP_ENDPOINT is present, so binary builds that don't
 *   need tracing incur zero overhead.
 */

import { trace, type Tracer } from '@opentelemetry/api';

export interface TelemetryConfig {
  /** OTLP gRPC endpoint, e.g. "http://otel-collector:4317" */
  otlpEndpoint?: string;
  /** Service name sent to the collector. Defaults to "secureyeoman". */
  serviceName?: string;
  /** Head-based sampling rate (0.0–1.0). Defaults to 1.0 (sample everything). */
  samplingRate?: number;
}

let _initialized = false;

/**
 * Bootstrap OpenTelemetry tracing.
 *
 * If `OTEL_EXPORTER_OTLP_ENDPOINT` is set (or `config.otlpEndpoint`),
 * dynamically imports the Node.js SDK and OTLP gRPC exporter and registers
 * the global TracerProvider. Safe to call multiple times (idempotent).
 */
export async function initTracing(config: TelemetryConfig = {}): Promise<void> {
  if (_initialized) return;

  const endpoint = config.otlpEndpoint ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) {
    // No endpoint configured — leave the global no-op API in place
    _initialized = true;
    return;
  }

  try {
    const [
      { NodeTracerProvider, BatchSpanProcessor },
      { OTLPTraceExporter },
      { resourceFromAttributes },
      sdkTrace,
    ] = await Promise.all([
      import('@opentelemetry/sdk-trace-node'),
      import('@opentelemetry/exporter-trace-otlp-grpc'),
      import('@opentelemetry/resources'),
      import('@opentelemetry/sdk-trace-base'),
    ]);

    const serviceName = config.serviceName ?? process.env.OTEL_SERVICE_NAME ?? 'secureyeoman';
    const samplingRate = config.samplingRate ?? 1.0;

    const sampler = samplingRate < 1.0
      ? new sdkTrace.TraceIdRatioBasedSampler(samplingRate)
      : new sdkTrace.AlwaysOnSampler();

    const resource = resourceFromAttributes({ 'service.name': serviceName });
    const exporter = new OTLPTraceExporter({ url: endpoint });
    const provider = new NodeTracerProvider({
      resource,
      sampler,
      spanProcessors: [new BatchSpanProcessor(exporter)],
    });
    provider.register();

    _initialized = true;
  } catch (err) {
    // Non-fatal — tracing degrades gracefully to no-op
    console.error('[otel] Failed to initialize tracing:', err instanceof Error ? err.message : err);
    _initialized = true;
  }
}

/**
 * Get a named tracer. Returns the global API tracer which is a no-op when
 * the SDK has not been initialized, so callers never need to guard.
 */
export function getTracer(name: string): Tracer {
  return trace.getTracer(name);
}

/**
 * Extract the current span's traceId for log correlation.
 * Returns null when no active span exists (most of the time in no-op mode).
 */
export function getCurrentTraceId(): string | null {
  return trace.getActiveSpan()?.spanContext().traceId ?? null;
}

/** Reset internal state — test helper only */
export function _resetForTests(): void {
  _initialized = false;
}
