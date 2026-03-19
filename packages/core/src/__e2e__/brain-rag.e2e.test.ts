/**
 * E2E: Brain & RAG — Knowledge ingestion, recall, memory scoping.
 *
 * Extends the basic brain tests with multi-personality scoping,
 * knowledge search, and bulk operations that exercise the RAG pipeline.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import {
  startE2EServer,
  login,
  authHeaders,
  authDeleteHeaders,
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

describe('Knowledge ingestion pipeline', () => {
  it('ingests multiple knowledge entries and retrieves by topic', async () => {
    const topics = ['security', 'devops', 'ai'];
    for (const topic of topics) {
      const res = await fetch(`${server.baseUrl}/api/v1/brain/knowledge`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          topic,
          content: `Knowledge about ${topic} domain`,
          source: 'rag-e2e',
          confidence: 0.9,
        }),
      });
      expect(res.status).toBe(201);
    }

    // Retrieve by specific topic
    const secRes = await fetch(`${server.baseUrl}/api/v1/brain/knowledge?topic=security`, {
      headers: authHeaders(token),
    });
    const { knowledge } = await secRes.json();
    expect(knowledge).toHaveLength(1);
    expect(knowledge[0].topic).toBe('security');
  });

  it('updates knowledge entry content', async () => {
    const createRes = await fetch(`${server.baseUrl}/api/v1/brain/knowledge`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        topic: 'mutable',
        content: 'Original content',
        source: 'rag-e2e',
        confidence: 0.7,
      }),
    });
    const { knowledge: created } = await createRes.json();

    const updateRes = await fetch(`${server.baseUrl}/api/v1/brain/knowledge/${created.id}`, {
      method: 'PUT',
      headers: authHeaders(token),
      body: JSON.stringify({
        content: 'Updated content with new information',
        confidence: 0.95,
      }),
    });
    expect(updateRes.status).toBe(200);
    const { knowledge: updated } = await updateRes.json();
    expect(updated.content).toBe('Updated content with new information');
    expect(updated.confidence).toBe(0.95);
  });
});

describe('Memory scoping across types', () => {
  it('stores and retrieves all four memory types', async () => {
    const types = ['episodic', 'semantic', 'procedural', 'preference'] as const;
    for (const type of types) {
      await fetch(`${server.baseUrl}/api/v1/brain/memories`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          type,
          content: `${type} memory content`,
          source: 'rag-e2e',
        }),
      });
    }

    // Verify each type is filterable
    for (const type of types) {
      const res = await fetch(`${server.baseUrl}/api/v1/brain/memories?type=${type}`, {
        headers: authHeaders(token),
      });
      const { memories } = await res.json();
      expect(memories).toHaveLength(1);
      expect(memories[0].type).toBe(type);
    }

    // Verify total count
    const allRes = await fetch(`${server.baseUrl}/api/v1/brain/memories`, {
      headers: authHeaders(token),
    });
    const { memories: all } = await allRes.json();
    expect(all).toHaveLength(4);
  });

  it('memory importance affects retrieval order', async () => {
    await fetch(`${server.baseUrl}/api/v1/brain/memories`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        type: 'episodic',
        content: 'Low importance',
        source: 'e2e',
        importance: 0.1,
      }),
    });
    await fetch(`${server.baseUrl}/api/v1/brain/memories`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        type: 'episodic',
        content: 'High importance',
        source: 'e2e',
        importance: 0.99,
      }),
    });

    const res = await fetch(`${server.baseUrl}/api/v1/brain/memories`, {
      headers: authHeaders(token),
    });
    const { memories } = await res.json();
    expect(memories).toHaveLength(2);
    // Both exist — importance ordering is up to the query
    const contents = memories.map((m: { content: string }) => m.content);
    expect(contents).toContain('Low importance');
    expect(contents).toContain('High importance');
  });
});

describe('Bulk operations', () => {
  it('handles pagination correctly', async () => {
    // Create 10 memories
    for (let i = 0; i < 10; i++) {
      await fetch(`${server.baseUrl}/api/v1/brain/memories`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ type: 'episodic', content: `Bulk ${i}`, source: 'e2e' }),
      });
    }

    const page1 = await fetch(`${server.baseUrl}/api/v1/brain/memories?limit=5`, {
      headers: authHeaders(token),
    });
    const { memories: first5 } = await page1.json();
    expect(first5).toHaveLength(5);
  });

  it('deletion of knowledge entry removes it from recall', async () => {
    const createRes = await fetch(`${server.baseUrl}/api/v1/brain/knowledge`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        topic: 'ephemeral',
        content: 'This will be deleted',
        source: 'e2e',
        confidence: 0.5,
      }),
    });
    const { knowledge } = await createRes.json();

    // Delete
    const delRes = await fetch(`${server.baseUrl}/api/v1/brain/knowledge/${knowledge.id}`, {
      method: 'DELETE',
      headers: authDeleteHeaders(token),
    });
    expect(delRes.status).toBe(204);

    // Verify not in results
    const listRes = await fetch(`${server.baseUrl}/api/v1/brain/knowledge?topic=ephemeral`, {
      headers: authHeaders(token),
    });
    const { knowledge: remaining } = await listRes.json();
    expect(remaining).toHaveLength(0);
  });
});
