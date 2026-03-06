/**
 * Tests for Guardrail Pipeline Routes — Phase 143
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerGuardrailPipelineRoutes } from './guardrail-pipeline-routes.js';
import { GuardrailPipeline } from './guardrail-pipeline.js';
import type { GuardrailPipelineConfig } from '@secureyeoman/shared';

function makePipeline(enabled = true): GuardrailPipeline {
  const config: GuardrailPipelineConfig = {
    enabled,
    dryRun: false,
    metricsEnabled: true,
    customFilterDir: 'guardrails',
    autoLoadCustomFilters: false,
    disabledFilters: [],
  };
  return new GuardrailPipeline(config, {
    auditRecord: vi.fn(),
  });
}

describe('Guardrail Pipeline Routes', () => {
  let app: ReturnType<typeof Fastify>;
  let pipeline: GuardrailPipeline;

  beforeEach(async () => {
    app = Fastify();
    pipeline = makePipeline();
    pipeline.registerFilter({
      id: 'test:echo',
      name: 'Echo Filter',
      priority: 100,
      enabled: true,
      async onOutput(text) {
        return { passed: true, text, findings: [] };
      },
    });
    registerGuardrailPipelineRoutes(app, { pipeline });
    await app.ready();
  });

  it('GET /filters lists registered filters', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/security/guardrail-pipeline/filters',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.filters).toHaveLength(1);
    expect(body.filters[0].id).toBe('test:echo');
    expect(body.filters[0].hasOutputHook).toBe(true);
    expect(body.filters[0].hasInputHook).toBe(false);
  });

  it('PUT /filters/:filterId/toggle toggles enabled', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/security/guardrail-pipeline/filters/test:echo/toggle',
      payload: { enabled: false },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.enabled).toBe(false);
    expect(pipeline.getFilter('test:echo')!.enabled).toBe(false);
  });

  it('PUT /filters/:filterId/toggle returns 404 for unknown', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/security/guardrail-pipeline/filters/nope/toggle',
      payload: { enabled: true },
    });
    expect(res.statusCode).toBe(404);
  });

  it('GET /metrics returns snapshot', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/security/guardrail-pipeline/metrics',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.filters).toBeDefined();
    expect(body.period).toBeDefined();
  });

  it('POST /metrics/reset clears metrics', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/security/guardrail-pipeline/metrics/reset',
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).ok).toBe(true);
  });

  it('POST /test runs dry-run pipeline', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/security/guardrail-pipeline/test',
      payload: { text: 'hello world', direction: 'output' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.passed).toBe(true);
    expect(body.text).toBe('hello world');
  });

  it('POST /test returns 400 without text', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/security/guardrail-pipeline/test',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});
