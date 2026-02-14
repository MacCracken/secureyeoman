import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerStreamableHttpTransport } from './streamable-http.js';
import { ProxyAuth } from '../auth/proxy-auth.js';
import type { CoreApiClient } from '../core-client.js';

function mockClient(): CoreApiClient {
  return {
    post: vi.fn().mockResolvedValue({ valid: true, userId: 'admin', role: 'admin', permissions: [] }),
    get: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    healthCheck: vi.fn().mockResolvedValue(true),
  } as unknown as CoreApiClient;
}

describe('streamable-http transport', () => {
  let app: FastifyInstance;
  let mcpServer: McpServer;
  let auth: ProxyAuth;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    mcpServer = new McpServer({ name: 'test', version: '1.0.0' });
    auth = new ProxyAuth(mockClient());
    registerStreamableHttpTransport({ app, mcpServer, auth });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('should reject POST /mcp/v1 without auth', async () => {
    const res = await app.inject({ method: 'POST', url: '/mcp/v1', payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it('should reject POST /mcp/v1 with invalid token', async () => {
    const client = mockClient();
    (client.post as ReturnType<typeof vi.fn>).mockResolvedValue({ valid: false });
    const invalidAuth = new ProxyAuth(client);

    const app2 = Fastify({ logger: false });
    registerStreamableHttpTransport({ app: app2, mcpServer, auth: invalidAuth });
    await app2.ready();

    const res = await app2.inject({
      method: 'POST',
      url: '/mcp/v1',
      headers: { authorization: 'Bearer invalid-token' },
      payload: {},
    });
    expect(res.statusCode).toBe(401);

    await app2.close();
  });

  it('should reject GET /mcp/v1 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/mcp/v1' });
    expect(res.statusCode).toBe(401);
  });

  it('should return 400 on GET /mcp/v1 without session', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/mcp/v1',
      headers: { authorization: 'Bearer valid-token' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('should handle DELETE /mcp/v1 for non-existent session', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/mcp/v1',
      headers: { 'mcp-session-id': 'nonexistent' },
    });
    expect(res.statusCode).toBe(404);
  });
});
