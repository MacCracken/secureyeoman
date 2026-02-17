/**
 * SSE Transport — GET /mcp/v1/sse + POST /mcp/v1/message
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyAuth } from '../auth/proxy-auth.js';

export interface SseTransportOptions {
  app: FastifyInstance;
  mcpServer: McpServer;
  auth: ProxyAuth;
}

export function registerSseTransport(opts: SseTransportOptions): void {
  const { app, mcpServer, auth } = opts;

  const transports = new Map<string, SSEServerTransport>();

  app.get('/mcp/v1/sse', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = auth.extractToken(request.headers.authorization);
    if (!token) {
      return reply.code(401).send({ error: 'Missing authentication credentials' });
    }

    const authResult = await auth.verify(token);
    if (!authResult.valid) {
      return reply.code(401).send({ error: 'Invalid or expired token' });
    }

    const transport = new SSEServerTransport('/mcp/v1/message', reply.raw);
    const sessionId = crypto.randomUUID();
    transports.set(sessionId, transport);

    transport.onclose = () => {
      transports.delete(sessionId);
    };

    await mcpServer.server.connect(transport);
    await transport.start();
  });

  app.post('/mcp/v1/message', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = auth.extractToken(request.headers.authorization);
    if (!token) {
      return reply.code(401).send({ error: 'Missing authentication credentials' });
    }

    const authResult = await auth.verify(token);
    if (!authResult.valid) {
      return reply.code(401).send({ error: 'Invalid or expired token' });
    }

    // Find the transport matching this session
    const sessionId = (request.query as Record<string, string>).sessionId;
    if (!sessionId) {
      return reply.code(400).send({ error: 'Missing sessionId query parameter' });
    }

    const transport = transports.get(sessionId);
    if (!transport) {
      return reply.code(404).send({ error: 'Session not found' });
    }

    await transport.handlePostMessage(request.raw, reply.raw);
  });
}
