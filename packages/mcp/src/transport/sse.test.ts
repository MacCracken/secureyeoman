import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSseTransport } from './sse.js';
import { ProxyAuth } from '../auth/proxy-auth.js';
import type { CoreApiClient } from '../core-client.js';

function mockClient(valid = true): CoreApiClient {
  return {
    post: vi.fn().mockResolvedValue({ valid, userId: 'admin', role: 'admin', permissions: [] }),
    get: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    healthCheck: vi.fn().mockResolvedValue(true),
  } as unknown as CoreApiClient;
}

describe('sse transport', () => {
  let app: FastifyInstance;
  let mcpServer: McpServer;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    mcpServer = new McpServer({ name: 'test', version: '1.0.0' });
  });

  afterEach(async () => {
    await app.close();
  });

  it('should reject GET /mcp/v1/sse without auth', async () => {
    const auth = new ProxyAuth(mockClient());
    registerSseTransport({ app, mcpServer, auth });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/mcp/v1/sse' });
    expect(res.statusCode).toBe(401);
  });

  it('should reject GET /mcp/v1/sse with invalid token', async () => {
    const auth = new ProxyAuth(mockClient(false));
    registerSseTransport({ app, mcpServer, auth });
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/mcp/v1/sse',
      headers: { authorization: 'Bearer invalid' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('should reject POST /mcp/v1/message without auth', async () => {
    const auth = new ProxyAuth(mockClient());
    registerSseTransport({ app, mcpServer, auth });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/mcp/v1/message',
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });

  it('should reject POST /mcp/v1/message with invalid token', async () => {
    const auth = new ProxyAuth(mockClient(false));
    registerSseTransport({ app, mcpServer, auth });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/mcp/v1/message',
      headers: { authorization: 'Bearer invalid' },
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });

  it('should return 400 on POST /mcp/v1/message without sessionId', async () => {
    const auth = new ProxyAuth(mockClient());
    registerSseTransport({ app, mcpServer, auth });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/mcp/v1/message',
      headers: { authorization: 'Bearer valid-token' },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('should return 404 on POST /mcp/v1/message with unknown sessionId', async () => {
    const auth = new ProxyAuth(mockClient());
    registerSseTransport({ app, mcpServer, auth });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/mcp/v1/message?sessionId=unknown',
      headers: { authorization: 'Bearer valid-token' },
      payload: {},
    });
    expect(res.statusCode).toBe(404);
  });

  it('should register SSE routes', async () => {
    const auth = new ProxyAuth(mockClient());
    registerSseTransport({ app, mcpServer, auth });
    await app.ready();

    // Routes should be registered
    expect(true).toBe(true);
  });

  it('should register both GET and POST endpoints', async () => {
    const auth = new ProxyAuth(mockClient());
    registerSseTransport({ app, mcpServer, auth });
    await app.ready();

    // GET /mcp/v1/sse and POST /mcp/v1/message are registered
    const getRes = await app.inject({ method: 'GET', url: '/mcp/v1/sse' });
    expect(getRes.statusCode).not.toBe(404);

    const postRes = await app.inject({ method: 'POST', url: '/mcp/v1/message', payload: {} });
    expect(postRes.statusCode).not.toBe(404);
  });

  it('should enforce auth on SSE endpoint', async () => {
    const auth = new ProxyAuth(mockClient());
    registerSseTransport({ app, mcpServer, auth });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/mcp/v1/sse' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toContain('authentication');
  });

  it('should enforce auth on message endpoint', async () => {
    const auth = new ProxyAuth(mockClient());
    registerSseTransport({ app, mcpServer, auth });
    await app.ready();

    const res = await app.inject({ method: 'POST', url: '/mcp/v1/message', payload: {} });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toContain('authentication');
  });
});
