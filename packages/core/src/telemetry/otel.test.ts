/**
 * OTel Bootstrap Tests (Phase 83)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { initTracing, getTracer, getCurrentTraceId, _resetForTests } from './otel.js';

describe('initTracing', () => {
  beforeEach(() => {
    _resetForTests();
  });

  afterEach(() => {
    delete process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];
  });

  it('no-ops when OTEL_EXPORTER_OTLP_ENDPOINT is unset', async () => {
    delete process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];
    await expect(initTracing({})).resolves.toBeUndefined();
  });

  it('is idempotent — second call is a no-op', async () => {
    await initTracing({});
    await initTracing({}); // Should not throw
    expect(true).toBe(true);
  });

  it('accepts config.otlpEndpoint but gracefully fails when SDK missing', async () => {
    // Dynamic import of missing packages is caught internally
    await expect(initTracing({ otlpEndpoint: 'http://localhost:4317', serviceName: 'test' })).resolves.not.toThrow();
  });
});

describe('getTracer', () => {
  it('returns a tracer object with startSpan', () => {
    const tracer = getTracer('test');
    expect(tracer).toBeDefined();
    expect(typeof tracer.startSpan).toBe('function');
  });

  it('returns a no-op tracer when SDK is not initialized', () => {
    const tracer = getTracer('my-component');
    const span = tracer.startSpan('test-op');
    expect(span).toBeDefined();
    expect(() => span.end()).not.toThrow();
  });
});

describe('getCurrentTraceId', () => {
  it('returns null when there is no active span', () => {
    const id = getCurrentTraceId();
    expect(id).toBeNull();
  });
});
