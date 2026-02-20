import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { registerCommsRoutes } from './comms-routes.js';
import type { AgentComms } from './agent-comms.js';

const IDENTITY = { id: 'agent-1', name: 'TestAgent', publicKey: 'pubkey' };
const PEER = { id: 'peer-1', name: 'Peer', publicKey: 'peerpubkey' };
const ENCRYPTED_MSG = { from: 'agent-1', to: 'agent-2', ciphertext: 'abc', nonce: 'xyz' };
const PAYLOAD = { type: 'task', data: {} };

function makeMockComms(overrides?: Partial<AgentComms>): AgentComms {
  return {
    getIdentity: vi.fn().mockReturnValue(IDENTITY),
    listPeers: vi.fn().mockResolvedValue([PEER]),
    addPeer: vi.fn().mockResolvedValue(undefined),
    removePeer: vi.fn().mockResolvedValue(true),
    decryptMessage: vi.fn().mockResolvedValue(PAYLOAD),
    encryptMessage: vi.fn().mockResolvedValue(ENCRYPTED_MSG),
    getMessageLog: vi.fn().mockResolvedValue([{ id: 'msg-1', type: 'task' }]),
    ...overrides,
  } as unknown as AgentComms;
}

function buildApp(overrides?: Partial<AgentComms>) {
  const app = Fastify();
  registerCommsRoutes(app, { agentComms: makeMockComms(overrides) });
  return app;
}

describe('GET /api/v1/comms/identity', () => {
  it('returns agent identity', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/comms/identity' });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe('agent-1');
  });
});

describe('GET /api/v1/comms/peers', () => {
  it('returns peer list', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/comms/peers' });
    expect(res.statusCode).toBe(200);
    expect(res.json().peers).toHaveLength(1);
  });
});

describe('POST /api/v1/comms/peers', () => {
  it('adds a peer and returns 201', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/comms/peers',
      payload: PEER,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().message).toBe('Peer added');
  });

  it('returns 400 on error', async () => {
    const app = buildApp({ addPeer: vi.fn().mockRejectedValue(new Error('duplicate')) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/comms/peers',
      payload: PEER,
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('DELETE /api/v1/comms/peers/:id', () => {
  it('removes a peer and returns 204', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/comms/peers/peer-1' });
    expect(res.statusCode).toBe(204);
  });

  it('returns 404 when peer not found', async () => {
    const app = buildApp({ removePeer: vi.fn().mockResolvedValue(false) });
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/comms/peers/missing' });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/v1/comms/message', () => {
  it('decrypts and acknowledges message', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/comms/message',
      payload: ENCRYPTED_MSG,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().acknowledged).toBe(true);
    expect(res.json().type).toBe('task');
  });

  it('returns 400 on decrypt error', async () => {
    const app = buildApp({ decryptMessage: vi.fn().mockRejectedValue(new Error('bad key')) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/comms/message',
      payload: ENCRYPTED_MSG,
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/v1/comms/send', () => {
  it('encrypts and sends message, returns 201', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/comms/send',
      payload: { toAgentId: 'peer-1', payload: PAYLOAD },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().message).toBeDefined();
  });

  it('returns 400 on encrypt error', async () => {
    const app = buildApp({ encryptMessage: vi.fn().mockRejectedValue(new Error('no peer')) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/comms/send',
      payload: { toAgentId: 'missing', payload: PAYLOAD },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/v1/comms/log', () => {
  it('returns message log', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/comms/log' });
    expect(res.statusCode).toBe(200);
    expect(res.json().log).toHaveLength(1);
  });

  it('passes query params to getMessageLog', async () => {
    const logMock = vi.fn().mockResolvedValue([]);
    const app = buildApp({ getMessageLog: logMock });
    await app.inject({ method: 'GET', url: '/api/v1/comms/log?peerId=p1&type=task&limit=5' });
    expect(logMock).toHaveBeenCalledWith({ peerId: 'p1', type: 'task', limit: 5 });
  });
});
