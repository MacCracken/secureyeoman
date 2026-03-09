/**
 * Event Bridge — Bidirectional SSE channel between SecureYeoman and AGNOSTIC/AGNOS.
 *
 * Outbound: SecureYeoman publishes events to connected SSE clients (AGNOSTIC/AGNOS).
 * Inbound:  SecureYeoman subscribes to AGNOSTIC/AGNOS SSE streams and dispatches
 *           events to the internal event system.
 *
 * Uses Server-Sent Events (SSE) for reliable, reconnectable streaming.
 *
 * Phase B — Bidirectional Event Streaming
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { SecureLogger } from '../logging/logger.js';

import { errorToString } from '../utils/errors.js';

const MAX_SSE_CLIENTS = 10_000;
const MAX_BACKOFF_MS = 60_000;

export interface EventBridgeConfig {
  /** AGNOSTIC SSE endpoint to subscribe to */
  agnosticSseUrl?: string;
  /** AGNOS runtime SSE endpoint to subscribe to */
  agnosSseUrl?: string;
  /** API key for AGNOSTIC */
  agnosticApiKey?: string;
  /** API key for AGNOS runtime */
  agnosApiKey?: string;
  /** Reconnect delay in ms after connection drop */
  reconnectDelayMs?: number;
  /** Maximum reconnect attempts before giving up (0 = infinite) */
  maxReconnectAttempts?: number;
}

export interface EventBridgeDeps {
  logger: SecureLogger;
  /** Callback invoked when an inbound event arrives from a remote service */
  onRemoteEvent?: (source: string, event: string, data: unknown) => void;
}

interface SseClient {
  id: string;
  source: string;
  reply: FastifyReply;
  connectedAt: number;
}

/**
 * Manages bidirectional SSE event streaming.
 */
export class EventBridge {
  private readonly config: EventBridgeConfig;
  private readonly logger: SecureLogger;
  private readonly onRemoteEvent: ((source: string, event: string, data: unknown) => void) | null;

  /** Outbound SSE clients connected to our stream */
  private readonly clients = new Map<string, SseClient>();
  private clientIdCounter = 0;

  /** Inbound subscription abort controllers */
  private readonly subscriptionAborts = new Map<string, AbortController>();

  constructor(config: EventBridgeConfig, deps: EventBridgeDeps) {
    this.config = config;
    this.logger = deps.logger;
    this.onRemoteEvent = deps.onRemoteEvent ?? null;
  }

  /**
   * Register the outbound SSE endpoint on Fastify.
   * External services connect to GET /api/v1/events/bridge/stream
   */
  registerRoutes(app: FastifyInstance): void {
    app.get(
      '/api/v1/events/bridge/stream',
      async (
        request: FastifyRequest<{ Querystring: { source?: string } }>,
        reply: FastifyReply
      ) => {
        const source = request.query.source ?? 'unknown';
        const clientId = `bridge-${++this.clientIdCounter}`;

        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        });

        // Enforce client cap
        if (this.clients.size >= MAX_SSE_CLIENTS) {
          // Evict the oldest client
          const oldest = this.clients.values().next().value;
          if (oldest) {
            try {
              oldest.reply.raw.end();
            } catch {
              /* already gone */
            }
            this.clients.delete(oldest.id);
            this.logger.warn({ evictedId: oldest.id }, 'Evicted oldest SSE client (at capacity)');
          }
        }

        // Send initial connection event
        reply.raw.write(`event: connected\ndata: ${JSON.stringify({ clientId, source })}\n\n`);

        const client: SseClient = { id: clientId, source, reply, connectedAt: Date.now() };
        this.clients.set(clientId, client);

        this.logger.info({ clientId, source }, 'Event bridge client connected');

        request.raw.once('close', () => {
          this.clients.delete(clientId);
          this.logger.info({ clientId, source }, 'Event bridge client disconnected');
        });
      }
    );

    // Publish an event to all connected bridge clients
    app.post(
      '/api/v1/events/bridge/publish',
      async (
        request: FastifyRequest<{
          Body: { event: string; data: unknown; source?: string };
        }>
      ) => {
        const { event, data, source } = request.body;
        const sent = this.broadcast(event, data, source ?? 'secureyeoman');
        return { sent, clients: this.clients.size };
      }
    );

    // Get bridge status
    app.get('/api/v1/events/bridge/status', async () => {
      return {
        outbound: {
          clients: [...this.clients.values()].map((c) => ({
            id: c.id,
            source: c.source,
            connectedAt: c.connectedAt,
          })),
        },
        inbound: {
          subscriptions: [...this.subscriptionAborts.keys()],
        },
      };
    });
  }

  /**
   * Broadcast an event to all connected SSE clients.
   */
  broadcast(event: string, data: unknown, source = 'secureyeoman'): number {
    const payload = JSON.stringify({ event, data, source, timestamp: new Date().toISOString() });
    let sent = 0;

    for (const client of this.clients.values()) {
      try {
        client.reply.raw.write(`event: ${event}\ndata: ${payload}\n\n`);
        sent++;
      } catch {
        this.clients.delete(client.id);
      }
    }

    return sent;
  }

  /**
   * Subscribe to a remote SSE stream (AGNOSTIC or AGNOS).
   * Events received are dispatched to onRemoteEvent callback.
   */
  async subscribe(name: string, url: string, apiKey?: string): Promise<void> {
    if (this.subscriptionAborts.has(name)) {
      this.logger.warn({ name }, 'Subscription already active');
      return;
    }

    const baseDelay = this.config.reconnectDelayMs ?? 5000;
    const maxAttempts = this.config.maxReconnectAttempts ?? 0;
    let attempts = 0;
    let currentDelay = baseDelay;

    const connect = async () => {
      while (true) {
        const abort = new AbortController();
        this.subscriptionAborts.set(name, abort);

        try {
          const headers: Record<string, string> = { Accept: 'text/event-stream' };
          if (apiKey) headers['X-API-Key'] = apiKey;

          const res = await fetch(url, { headers, signal: abort.signal });

          if (!res.ok) {
            throw new Error(`SSE subscribe failed: HTTP ${res.status}`);
          }

          if (!res.body) {
            throw new Error('No response body for SSE stream');
          }

          this.logger.info({ name, url }, 'Event bridge subscribed');
          attempts = 0; // Reset on successful connection
          currentDelay = baseDelay; // Reset backoff

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let eventType = 'message';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              if (line.startsWith('event:')) {
                eventType = line.slice(6).trim();
              } else if (line.startsWith('data:')) {
                const rawData = line.slice(5).trim();
                try {
                  const parsed = JSON.parse(rawData);
                  this.onRemoteEvent?.(name, eventType, parsed);
                } catch {
                  this.onRemoteEvent?.(name, eventType, rawData);
                }
                eventType = 'message'; // Reset for next event
              }
            }
          }
        } catch (err) {
          if (abort.signal.aborted) return; // Intentional disconnect

          this.logger.warn(
            {
              name,
              error: errorToString(err),
            },
            'Event bridge connection lost'
          );
        }

        this.subscriptionAborts.delete(name);

        // Reconnect unless explicitly unsubscribed
        if (maxAttempts > 0 && ++attempts >= maxAttempts) {
          this.logger.warn({ name, attempts }, 'Event bridge max reconnect attempts reached');
          return;
        }

        this.logger.info({ name, delay: currentDelay }, 'Event bridge reconnecting');
        await new Promise((r) => setTimeout(r, currentDelay));
        currentDelay = Math.min(currentDelay * 2, MAX_BACKOFF_MS);
      }
    };

    connect();
  }

  /**
   * Start all configured inbound subscriptions.
   */
  startSubscriptions(): void {
    if (this.config.agnosticSseUrl) {
      void this.subscribe('agnostic', this.config.agnosticSseUrl, this.config.agnosticApiKey).catch(
        (err: unknown) => {
          this.logger.warn(
            { error: errorToString(err) },
            'Agnostic SSE subscription failed'
          );
        }
      );
    }
    if (this.config.agnosSseUrl) {
      void this.subscribe('agnos', this.config.agnosSseUrl, this.config.agnosApiKey).catch(
        (err: unknown) => {
          this.logger.warn(
            { error: errorToString(err) },
            'Agnos SSE subscription failed'
          );
        }
      );
    }
  }

  /**
   * Unsubscribe from a remote SSE stream.
   */
  unsubscribe(name: string): void {
    const abort = this.subscriptionAborts.get(name);
    if (abort) {
      abort.abort();
      this.subscriptionAborts.delete(name);
      this.logger.info({ name }, 'Event bridge unsubscribed');
    }
  }

  /**
   * Shutdown all connections.
   */
  shutdown(): void {
    for (const [name, abort] of this.subscriptionAborts) {
      abort.abort();
      this.logger.info({ name }, 'Event bridge subscription stopped');
    }
    this.subscriptionAborts.clear();

    for (const client of this.clients.values()) {
      try {
        client.reply.raw.end();
      } catch {
        /* client already gone */
      }
    }
    this.clients.clear();
  }
}
