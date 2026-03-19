/**
 * E2E: A2A — Peer management, delegation, and messaging.
 *
 * Tests the Agent-to-Agent protocol REST API over real HTTP.
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

describe('A2A Peers', () => {
  it('lists peers (initially empty)', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/a2a/peers`, {
      headers: authHeaders(token),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.peers).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('registers a peer', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/a2a/peers`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        name: 'remote-sy',
        url: 'https://remote.example.com',
        capabilities: ['research', 'code-review'],
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.peer.name).toBe('remote-sy');
    expect(body.peer.id).toEqual(expect.any(String));
  });

  it('lists registered peer', async () => {
    await fetch(`${server.baseUrl}/api/v1/a2a/peers`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        name: 'peer-1',
        url: 'https://peer1.example.com',
        capabilities: ['analysis'],
      }),
    });

    const res = await fetch(`${server.baseUrl}/api/v1/a2a/peers`, {
      headers: authHeaders(token),
    });
    const { peers, total } = await res.json();
    expect(total).toBe(1);
    expect(peers[0].name).toBe('peer-1');
  });

  it('deletes a peer', async () => {
    const createRes = await fetch(`${server.baseUrl}/api/v1/a2a/peers`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        name: 'temp-peer',
        url: 'https://temp.example.com',
        capabilities: [],
      }),
    });
    const { peer } = await createRes.json();

    const deleteRes = await fetch(`${server.baseUrl}/api/v1/a2a/peers/${peer.id}`, {
      method: 'DELETE',
      headers: authDeleteHeaders(token),
    });
    expect(deleteRes.status).toBe(204);

    // Verify gone
    const listRes = await fetch(`${server.baseUrl}/api/v1/a2a/peers`, {
      headers: authHeaders(token),
    });
    const { total } = await listRes.json();
    expect(total).toBe(0);
  });

  it('updates peer trust level', async () => {
    const createRes = await fetch(`${server.baseUrl}/api/v1/a2a/peers`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        name: 'trust-peer',
        url: 'https://trust.example.com',
        capabilities: [],
      }),
    });
    const { peer } = await createRes.json();

    const trustRes = await fetch(`${server.baseUrl}/api/v1/a2a/peers/${peer.id}/trust`, {
      method: 'PUT',
      headers: authHeaders(token),
      body: JSON.stringify({ trustLevel: 'verified' }),
    });
    expect(trustRes.status).toBe(200);
  });
});

describe('A2A Capabilities', () => {
  it('returns local capabilities', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/a2a/capabilities`, {
      headers: authHeaders(token),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('capabilities');
  });
});

describe('A2A Config', () => {
  it('returns A2A configuration', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/a2a/config`, {
      headers: authHeaders(token),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('enabled');
  });
});

describe('A2A Messages', () => {
  it('lists messages (initially empty)', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/a2a/messages`, {
      headers: authHeaders(token),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.messages).toEqual([]);
  });
});
