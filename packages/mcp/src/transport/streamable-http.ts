/**
 * Streamable HTTP Transport — primary MCP transport using POST /mcp/v1.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyAuth } from '../auth/proxy-auth.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

export interface StreamableHttpOptions {
  app: FastifyInstance;
  mcpServer: McpServer;
  auth: ProxyAuth;
}

export function registerStreamableHttpTransport(opts: StreamableHttpOptions): void {
  const { app, mcpServer, auth } = opts;

  const transports = new Map<string, Transport>();

  app.post('/mcp/v1', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = auth.extractToken(request.headers.authorization);
    if (!token) {
      return reply.code(401).send({ error: 'Missing authentication credentials' });
    }

    const authResult = await auth.verify(token);
    if (!authResult.valid) {
      return reply.code(401).send({ error: 'Invalid or expired token' });
    }

    const sessionId = request.headers['mcp-session-id'] as string | undefined;

    let transport: Transport;
    if (sessionId && transports.has(sessionId)) {
      transport = transports.get(sessionId)!;
    } else {
      // Generate session ID upfront so we can store the transport in the map
      // before handleRequest runs (handleRequest sets the response header).
      const newSessionId = crypto.randomUUID();

      const httpTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId,
      });

      // The MCP SDK's Server allows only one transport at a time.
      // If a previous transport's SSE stream ended without a clean close,
      // the server may still hold a stale reference. Close it before
      // connecting the new transport.
      try {
        await mcpServer.server.connect(httpTransport);
      } catch {
        await mcpServer.server.close();
        await mcpServer.server.connect(httpTransport);
      }

      transports.set(newSessionId, httpTransport);
      transport = httpTransport;

      httpTransport.onclose = () => {
        transports.delete(newSessionId);
      };
    }

    // Handle the request via the transport
    const body = request.body as Record<string, unknown>;
    const res = reply.raw;
    const req = request.raw;

    // Set headers for streaming
    res.setHeader('Content-Type', 'application/json');

    try {
      await (transport as StreamableHTTPServerTransport).handleRequest(req, res, body);
    } catch {
      if (!res.headersSent) {
        return reply.code(500).send({ error: 'Transport error' });
      }
    }
  });

  // Handle GET for session creation
  app.get('/mcp/v1', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = auth.extractToken(request.headers.authorization);
    if (!token) {
      return reply.code(401).send({ error: 'Missing authentication credentials' });
    }

    const authResult = await auth.verify(token);
    if (!authResult.valid) {
      return reply.code(401).send({ error: 'Invalid or expired token' });
    }

    const sessionId = request.headers['mcp-session-id'] as string | undefined;
    if (sessionId && transports.has(sessionId)) {
      const transport = transports.get(sessionId)!;
      const res = reply.raw;
      const req = request.raw;
      try {
        await (transport as StreamableHTTPServerTransport).handleRequest(req, res);
      } catch {
        if (!res.headersSent) {
          return reply.code(500).send({ error: 'Transport error' });
        }
      }
    } else {
      return reply.code(400).send({ error: 'No active session. Send a POST to initialize.' });
    }
  });

  // Handle DELETE for session cleanup
  app.delete('/mcp/v1', async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionId = request.headers['mcp-session-id'] as string | undefined;
    if (sessionId && transports.has(sessionId)) {
      const transport = transports.get(sessionId)!;
      await transport.close();
      transports.delete(sessionId);
      return reply.code(200).send({ message: 'Session closed' });
    }
    return reply.code(404).send({ error: 'Session not found' });
  });
}
