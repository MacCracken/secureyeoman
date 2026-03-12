/**
 * Streamable HTTP Transport — primary MCP transport using POST /mcp/v1.
 *
 * Follows the MCP SDK's per-session server pattern: each `initialize` request
 * creates a new McpServer + StreamableHTTPServerTransport pair.  Subsequent
 * requests reuse the session via the `mcp-session-id` header.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyAuth } from '../auth/proxy-auth.js';

export interface StreamableHttpOptions {
  app: FastifyInstance;
  auth: ProxyAuth;
  /** Factory that creates a fresh McpServer with all tools/resources/prompts registered. */
  createServer: () => Promise<McpServer>;
}

interface Session {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
}

export function registerStreamableHttpTransport(opts: StreamableHttpOptions): void {
  const { app, auth, createServer } = opts;

  const sessions = new Map<string, Session>();

  app.post('/mcp/v1', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = auth.extractToken(request.headers.authorization);
    if (!token) {
      return reply.code(401).send({ error: 'Missing authentication credentials' });
    }

    const authResult = await auth.verify(token);
    if (!authResult.valid) {
      return reply.code(401).send({ error: 'Invalid or expired token' });
    }

    const body = request.body as Record<string, unknown>;
    const res = reply.raw;
    const req = request.raw;
    res.setHeader('Content-Type', 'application/json');

    const sessionId = request.headers['mcp-session-id'] as string | undefined;

    try {
      if (sessionId && sessions.has(sessionId)) {
        // ── Existing session ──
        const session = sessions.get(sessionId)!;
        await session.transport.handleRequest(req, res, body);
      } else if (!sessionId && isInitializeRequest(body)) {
        // ── New session: create server + transport ──
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
          onsessioninitialized: (sid: string) => {
            sessions.set(sid, { transport, server });
          },
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid) sessions.delete(sid);
        };

        const server = await createServer();
        await server.connect(transport);
        await transport.handleRequest(req, res, body);
      } else {
        // ── Invalid: no session ID and not an initialize request ──
        if (!res.headersSent) {
          return reply.code(400).send({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Bad Request: No valid session ID provided',
            },
            id: null,
          });
        }
      }
    } catch {
      if (!res.headersSent) {
        return reply.code(500).send({ error: 'Transport error' });
      }
    }
  });

  // Handle GET for SSE streams (resumability)
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
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;
      const res = reply.raw;
      const req = request.raw;
      try {
        await session.transport.handleRequest(req, res);
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
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;
      await session.transport.close();
      await session.server.close();
      sessions.delete(sessionId);
      return reply.code(200).send({ message: 'Session closed' });
    }
    return reply.code(404).send({ error: 'Session not found' });
  });
}
