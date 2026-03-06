/**
 * Tests for Replay Routes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerReplayRoutes } from './replay-routes.js';
import type { ExecutionTrace } from '@secureyeoman/shared';

function makeTrace(id = 'trace-1'): ExecutionTrace {
  return {
    id,
    model: 'gpt-4',
    provider: 'openai',
    input: 'hello',
    output: 'world',
    steps: [
      {
        index: 0,
        type: 'tool_call',
        timestamp: Date.now(),
        durationMs: 100,
        toolName: 'search',
        args: {},
        result: 'found',
        isError: false,
        blocked: false,
      },
    ],
    totalDurationMs: 500,
    totalInputTokens: 100,
    totalOutputTokens: 50,
    totalCostUsd: 0.01,
    toolIterations: 1,
    success: true,
    tags: ['test'],
    isReplay: false,
    createdAt: Date.now(),
    tenantId: 'default',
  };
}

function makeMockStore() {
  const traces = new Map<string, ExecutionTrace>();
  const t1 = makeTrace('trace-1');
  traces.set('trace-1', t1);

  return {
    getTrace: vi.fn(async (id: string) => traces.get(id) ?? null),
    listTraces: vi.fn(async () => ({ items: [...traces.values()], total: traces.size })),
    deleteTrace: vi.fn(async (id: string) => traces.delete(id)),
    saveTrace: vi.fn(async (t: ExecutionTrace) => {
      traces.set(t.id, t);
    }),
    getReplayChain: vi.fn(async () => [t1]),
  };
}

function makeMockReplayEngine() {
  return {
    replay: vi.fn(async (source: ExecutionTrace) => ({
      ...source,
      id: 'replay-1',
      isReplay: true,
      sourceTraceId: source.id,
    })),
    currentReplays: 0,
  };
}

describe('Replay Routes', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify();
    registerReplayRoutes(app, {
      traceStore: makeMockStore() as any,
      replayEngine: makeMockReplayEngine() as any,
    });
    await app.ready();
  });

  it('GET /traces lists traces', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/agent-replay/traces' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.items).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it('GET /traces/:traceId returns trace', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/agent-replay/traces/trace-1' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).id).toBe('trace-1');
  });

  it('GET /traces/:traceId returns 404 for unknown', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/agent-replay/traces/nope' });
    expect(res.statusCode).toBe(404);
  });

  it('DELETE /traces/:traceId deletes trace', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/agent-replay/traces/trace-1' });
    expect(res.statusCode).toBe(200);
  });

  it('GET /traces/:traceId/chain returns chain', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/agent-replay/traces/trace-1/chain',
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).chain).toHaveLength(1);
  });

  it('GET /diff requires both params', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/agent-replay/diff' });
    expect(res.statusCode).toBe(400);
  });

  it('GET /traces/:traceId/summary returns summary', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/agent-replay/traces/trace-1/summary',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.toolCallCount).toBe(1);
    expect(body.toolNames).toEqual(['search']);
  });

  it('POST /traces/:traceId/replay creates replay', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/agent-replay/traces/trace-1/replay',
      payload: { tags: ['regression'] },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.isReplay).toBe(true);
  });

  it('POST /traces/:traceId/replay returns 404 for unknown', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/agent-replay/traces/nope/replay',
      payload: {},
    });
    expect(res.statusCode).toBe(404);
  });
});
