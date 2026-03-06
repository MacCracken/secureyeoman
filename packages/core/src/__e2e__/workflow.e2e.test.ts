/**
 * E2E: Workflow Definition CRUD
 *
 * Tests workflow creation, listing, update, export, import,
 * and deletion over real HTTP against a running server + DB.
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

const TEST_WORKFLOW = {
  name: 'E2E Test Workflow',
  description: 'A workflow for E2E testing',
  steps: [
    { id: 'step-1', type: 'agent', name: 'Research', config: { prompt: 'Research the topic' } },
    { id: 'step-2', type: 'agent', name: 'Summarize', config: { prompt: 'Summarize findings' } },
  ],
  edges: [{ source: 'step-1', target: 'step-2' }],
  triggers: [],
  isEnabled: true,
};

describe('Workflow CRUD', () => {
  it('lists workflows (initially empty)', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/workflows`, {
      headers: authHeaders(token),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.definitions).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('creates a workflow', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/workflows`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(TEST_WORKFLOW),
    });
    expect(res.status).toBe(201);
    const { definition } = await res.json();
    expect(definition.name).toBe('E2E Test Workflow');
    expect(definition.id).toEqual(expect.any(String));
    expect(definition.steps).toHaveLength(2);
  });

  it('lists created workflow', async () => {
    await fetch(`${server.baseUrl}/api/v1/workflows`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(TEST_WORKFLOW),
    });

    const res = await fetch(`${server.baseUrl}/api/v1/workflows`, {
      headers: authHeaders(token),
    });
    const body = await res.json();
    expect(body.definitions).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it('updates a workflow', async () => {
    const createRes = await fetch(`${server.baseUrl}/api/v1/workflows`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(TEST_WORKFLOW),
    });
    const { definition: created } = await createRes.json();

    const updateRes = await fetch(
      `${server.baseUrl}/api/v1/workflows/${created.id}`,
      {
        method: 'PUT',
        headers: authHeaders(token),
        body: JSON.stringify({
          name: 'Updated Workflow',
          description: 'Updated description',
          steps: created.steps,
          edges: created.edges,
          triggers: [],
          isEnabled: false,
        }),
      },
    );
    expect(updateRes.status).toBe(200);
    const { definition: updated } = await updateRes.json();
    expect(updated.name).toBe('Updated Workflow');
    expect(updated.isEnabled).toBe(false);
  });

  it('deletes a workflow', async () => {
    const createRes = await fetch(`${server.baseUrl}/api/v1/workflows`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(TEST_WORKFLOW),
    });
    const { definition: created } = await createRes.json();

    const deleteRes = await fetch(
      `${server.baseUrl}/api/v1/workflows/${created.id}`,
      { method: 'DELETE', headers: authDeleteHeaders(token) },
    );
    expect(deleteRes.status).toBe(204);

    const listRes = await fetch(`${server.baseUrl}/api/v1/workflows`, {
      headers: authHeaders(token),
    });
    const body = await listRes.json();
    expect(body.definitions).toHaveLength(0);
  });

  it('returns error for non-existent workflow run', async () => {
    const res = await fetch(
      `${server.baseUrl}/api/v1/workflows/runs/non-existent-run`,
      { headers: authHeaders(token) },
    );
    expect([404, 500]).toContain(res.status);
  });
});

describe('Workflow export/import', () => {
  it('exports a workflow definition', async () => {
    const createRes = await fetch(`${server.baseUrl}/api/v1/workflows`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(TEST_WORKFLOW),
    });
    const { definition: created } = await createRes.json();

    const exportRes = await fetch(
      `${server.baseUrl}/api/v1/workflows/${created.id}/export`,
      { headers: authHeaders(token) },
    );
    expect(exportRes.status).toBe(200);
    const exported = await exportRes.json();
    // Export wraps in { workflow, exportedAt, requires }
    expect(exported.workflow.name).toBe('E2E Test Workflow');
    expect(exported.workflow.steps).toHaveLength(2);
    expect(exported.exportedAt).toEqual(expect.any(Number));
  });

  it('imports a workflow definition', async () => {
    // First create + export, then re-import
    const createRes = await fetch(`${server.baseUrl}/api/v1/workflows`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(TEST_WORKFLOW),
    });
    const { definition: created } = await createRes.json();

    const exportRes = await fetch(
      `${server.baseUrl}/api/v1/workflows/${created.id}/export`,
      { headers: authHeaders(token) },
    );
    const exportPayload = await exportRes.json();

    // Change name to avoid conflict
    exportPayload.workflow.name = 'Imported Workflow';
    delete exportPayload.workflow.id;

    const res = await fetch(`${server.baseUrl}/api/v1/workflows/import`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ workflow: exportPayload }),
    });
    expect(res.status).toBe(201);
    const { definition } = await res.json();
    expect(definition.name).toBe('Imported Workflow');
  });
});

describe('Workflow pagination', () => {
  it('paginates workflow list', async () => {
    for (let i = 1; i <= 4; i++) {
      await fetch(`${server.baseUrl}/api/v1/workflows`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ ...TEST_WORKFLOW, name: `Workflow-${i}` }),
      });
    }

    const res = await fetch(
      `${server.baseUrl}/api/v1/workflows?limit=2&offset=0`,
      { headers: authHeaders(token) },
    );
    const body = await res.json();
    expect(body.definitions).toHaveLength(2);
    expect(body.total).toBe(4);
  });
});
