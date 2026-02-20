import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerA2ARoutes } from './a2a-routes.js';
import type { A2AManager } from './manager.js';

// ── Mock data ────────────────────────────────────────────────────────

const PEER = {
  id: 'peer-1',
  name: 'Test Peer',
  url: 'https://peer.example.com',
  publicKey: 'pk-abc',
  trustLevel: 'untrusted',
  capabilities: [],
  lastSeen: 1000,
  status: 'online',
};

const MESSAGE = {
  id: 'msg-1',
  type: 'a2a:delegate',
  fromPeerId: 'local',
  toPeerId: 'peer-1',
  payload: { task: 'do something' },
  timestamp: 1000,
};

function makeMockManager(overrides?: Partial<A2AManager>): A2AManager {
  return {
    listPeers: vi.fn().mockResolvedValue({ peers: [PEER], total: 1 }),
    addPeer: vi.fn().mockResolvedValue(PEER),
    removePeer: vi.fn().mockResolvedValue(true),
    updateTrust: vi.fn().mockResolvedValue(PEER),
    discover: vi.fn().mockResolvedValue([PEER]),
    getLocalCapabilities: vi.fn().mockReturnValue([{ name: 'chat', description: 'Chat', version: '1.0' }]),
    delegate: vi.fn().mockResolvedValue(MESSAGE),
    getMessageHistory: vi.fn().mockResolvedValue({ messages: [MESSAGE], total: 1 }),
    getConfig: vi.fn().mockReturnValue({ enabled: true }),
    ...overrides,
  } as unknown as A2AManager;
}

function buildApp(overrides?: Partial<A2AManager>) {
  const app = Fastify();
  registerA2ARoutes(app, { a2aManager: makeMockManager(overrides) });
  return app;
}

// ── Tests ────────────────────────────────────────────────────────────

describe('GET /api/v1/a2a/peers', () => {
  it('returns list of peers', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/a2a/peers' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.peers).toHaveLength(1);
    expect(body.peers[0].id).toBe('peer-1');
  });
});

describe('POST /api/v1/a2a/peers', () => {
  it('adds a peer and returns 201', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/a2a/peers',
      payload: { url: 'https://peer.example.com', name: 'Test Peer' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().peer.id).toBe('peer-1');
  });

  it('returns 400 when addPeer throws', async () => {
    const app = buildApp({ addPeer: vi.fn().mockRejectedValue(new Error('unreachable')) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/a2a/peers',
      payload: { url: 'https://bad.example.com' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('DELETE /api/v1/a2a/peers/:id', () => {
  it('removes peer and returns 204', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/a2a/peers/peer-1' });
    expect(res.statusCode).toBe(204);
  });

  it('returns 404 when peer not found', async () => {
    const app = buildApp({ removePeer: vi.fn().mockResolvedValue(false) });
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/a2a/peers/missing' });
    expect(res.statusCode).toBe(404);
  });
});

describe('PUT /api/v1/a2a/peers/:id/trust', () => {
  it('updates trust level', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/a2a/peers/peer-1/trust',
      payload: { trustLevel: 'trusted' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().peer.id).toBe('peer-1');
  });

  it('returns 404 when peer not found', async () => {
    const app = buildApp({ updateTrust: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/a2a/peers/missing/trust',
      payload: { trustLevel: 'verified' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/v1/a2a/discover', () => {
  it('returns discovered peers', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/a2a/discover' });
    expect(res.statusCode).toBe(200);
    expect(res.json().discovered).toHaveLength(1);
  });
});

describe('GET /api/v1/a2a/capabilities', () => {
  it('returns local capabilities', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/a2a/capabilities' });
    expect(res.statusCode).toBe(200);
    expect(res.json().capabilities).toHaveLength(1);
  });
});

describe('POST /api/v1/a2a/delegate', () => {
  it('delegates task and returns 201', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/a2a/delegate',
      payload: { peerId: 'peer-1', task: 'do something' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().message.id).toBe('msg-1');
  });

  it('returns 404 when peer not found or unreachable', async () => {
    const app = buildApp({ delegate: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/a2a/delegate',
      payload: { peerId: 'missing', task: 'do something' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 on delegation error', async () => {
    const app = buildApp({ delegate: vi.fn().mockRejectedValue(new Error('trust error')) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/a2a/delegate',
      payload: { peerId: 'peer-1', task: 'do something' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/v1/a2a/messages', () => {
  it('returns message history', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/a2a/messages' });
    expect(res.statusCode).toBe(200);
    expect(res.json().messages).toHaveLength(1);
  });
});

describe('GET /api/v1/a2a/config', () => {
  it('returns A2A config', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/a2a/config' });
    expect(res.statusCode).toBe(200);
    expect(res.json().config.enabled).toBe(true);
  });
});
