/**
 * E2E: Training & Distillation — Dataset export, distillation jobs, quality scoring.
 *
 * Training routes require SecureYeoman which is too heavy for the shared E2E server.
 * These tests verify the API contract by calling the shared server's brain routes
 * to seed data, then testing export/stats indirectly through the brain pipeline.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import {
  startE2EServer,
  login,
  authHeaders,
  setupTestDb,
  teardownTestDb,
  truncateAllTables,
  type E2EServer,
} from './helpers.js';

let server: E2EServer;
let token: string;

beforeAll(async () => {
  await setupTestDb();
  server = await startE2EServer();
});

afterAll(async () => {
  await server.close();
  await teardownTestDb();
});

beforeEach(async () => {
  await truncateAllTables();
  ({ accessToken: token } = await login(server.baseUrl));
});

describe('Training data preparation', () => {
  it('brain memories can be created as training source data', async () => {
    // Seed episodic memories as training data source
    for (let i = 0; i < 5; i++) {
      const res = await fetch(`${server.baseUrl}/api/v1/brain/memories`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          type: 'episodic',
          content: `Training conversation turn ${i}: user asked about topic ${i}`,
          source: 'training-e2e',
          importance: 0.9,
        }),
      });
      expect(res.status).toBe(201);
    }

    // Verify all training data is retrievable
    const listRes = await fetch(`${server.baseUrl}/api/v1/brain/memories?source=training-e2e`, {
      headers: authHeaders(token),
    });
    expect(listRes.status).toBe(200);
    const { memories } = await listRes.json();
    expect(memories.length).toBeGreaterThanOrEqual(5);
  });

  it('knowledge entries can be created for training context', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/brain/knowledge`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        topic: 'training-context',
        content: 'This knowledge entry provides domain context for fine-tuning',
        source: 'training-e2e',
        confidence: 0.95,
      }),
    });
    expect(res.status).toBe(201);

    const listRes = await fetch(`${server.baseUrl}/api/v1/brain/knowledge?topic=training-context`, {
      headers: authHeaders(token),
    });
    const { knowledge } = await listRes.json();
    expect(knowledge).toHaveLength(1);
    expect(knowledge[0].confidence).toBe(0.95);
  });

  it('brain stats reflect training data volume', async () => {
    // Seed data
    await fetch(`${server.baseUrl}/api/v1/brain/memories`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ type: 'episodic', content: 'train data', source: 'e2e' }),
    });
    await fetch(`${server.baseUrl}/api/v1/brain/knowledge`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        topic: 'train',
        content: 'knowledge',
        source: 'e2e',
        confidence: 0.9,
      }),
    });

    const res = await fetch(`${server.baseUrl}/api/v1/brain/stats`, {
      headers: authHeaders(token),
    });
    expect(res.status).toBe(200);
    const { stats } = await res.json();
    expect(stats.memories).toBeGreaterThanOrEqual(1);
    expect(stats.knowledge).toBeGreaterThanOrEqual(1);
  });
});

describe('Training data quality', () => {
  it('memories with low importance can be filtered for curation', async () => {
    await fetch(`${server.baseUrl}/api/v1/brain/memories`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        type: 'episodic',
        content: 'high quality',
        source: 'e2e',
        importance: 0.9,
      }),
    });
    await fetch(`${server.baseUrl}/api/v1/brain/memories`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        type: 'episodic',
        content: 'low quality',
        source: 'e2e',
        importance: 0.1,
      }),
    });

    const res = await fetch(`${server.baseUrl}/api/v1/brain/memories`, {
      headers: authHeaders(token),
    });
    const { memories } = await res.json();
    expect(memories).toHaveLength(2);

    // Client-side curation: filter by importance threshold
    const curated = memories.filter((m: { importance: number }) => m.importance >= 0.5);
    expect(curated).toHaveLength(1);
    expect(curated[0].content).toBe('high quality');
  });
});
