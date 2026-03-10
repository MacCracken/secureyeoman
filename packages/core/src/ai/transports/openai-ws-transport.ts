/**
 * OpenAI WebSocket Transport — Persistent connection manager for the Responses API.
 *
 * Maintains a pool of WebSocket connections to `wss://api.openai.com/v1/responses`.
 * Each connection supports incremental turn submission via `previous_response_id`,
 * avoiding full conversation replay on every request (~40% faster for tool-heavy
 * workloads with 20+ tool calls).
 *
 * Connection lifecycle:
 *   - Connections auto-close after `maxIdleMs` (default 5 min) of inactivity
 *   - OpenAI enforces a hard 60 min max connection lifetime
 *   - Automatic reconnection on transient failures (1006, 1011, 1013)
 *   - Health checks via ping/pong at `pingIntervalMs` (default 30s)
 *
 * Thread safety:
 *   Single-threaded Node.js — no mutex needed. The pool uses a Map keyed by
 *   a session identifier (conversation ID or "default") so multiple conversations
 *   can reuse their own persistent connection.
 */

import { WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import type { SecureLogger } from '../../logging/logger.js';
import { errorToString } from '../../utils/errors.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface WsTransportConfig {
  apiKey: string;
  /** WebSocket endpoint. Default: wss://api.openai.com/v1/responses */
  endpoint?: string;
  /** Max idle time before closing a connection (ms). Default: 300_000 (5 min). */
  maxIdleMs?: number;
  /** Hard max connection lifetime (ms). Default: 3_540_000 (59 min — below OpenAI's 60 min cap). */
  maxLifetimeMs?: number;
  /** Ping interval for keepalive (ms). Default: 30_000. */
  pingIntervalMs?: number;
  /** Max pool size (concurrent connections). Default: 3. */
  maxPoolSize?: number;
  /** Max reconnect attempts per connection. Default: 3. */
  maxReconnectAttempts?: number;
}

export interface WsConnection {
  id: string;
  ws: WebSocket;
  sessionKey: string;
  createdAt: number;
  lastUsedAt: number;
  lastResponseId: string | null;
  state: 'connecting' | 'open' | 'closing' | 'closed';
  reconnectAttempts: number;
  pingTimer: NodeJS.Timeout | null;
  idleTimer: NodeJS.Timeout | null;
  lifetimeTimer: NodeJS.Timeout | null;
}

export type WsMessageHandler = (data: WsServerEvent) => void;
export type WsErrorHandler = (error: Error) => void;

/** Server-sent event from OpenAI Responses WebSocket. */
export interface WsServerEvent {
  type: string;
  response?: {
    id?: string;
    status?: string;
    output?: {
      type: string;
      content?: {
        type: string;
        text?: string;
      }[];
      id?: string;
      name?: string;
      call_id?: string;
      arguments?: string;
    }[];
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
    };
  };
  /** Streaming content delta */
  delta?: string;
  /** Item reference for tool calls */
  item?: {
    type?: string;
    id?: string;
    call_id?: string;
    name?: string;
    arguments?: string;
  };
  item_id?: string;
  output_index?: number;
  content_index?: number;
  /** Error details */
  error?: {
    type?: string;
    code?: string;
    message?: string;
  };
}

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_ENDPOINT = 'wss://api.openai.com/v1/responses';
const DEFAULT_MAX_IDLE_MS = 300_000; // 5 min
const DEFAULT_MAX_LIFETIME_MS = 3_540_000; // 59 min
const DEFAULT_PING_INTERVAL_MS = 30_000;
const DEFAULT_MAX_POOL_SIZE = 3;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 3;

const TRANSIENT_CLOSE_CODES = new Set([1006, 1011, 1013]);

// ── Transport ────────────────────────────────────────────────────────────────

export class OpenAIWsTransport {
  private readonly pool = new Map<string, WsConnection>();
  private readonly config: Required<WsTransportConfig>;
  private readonly logger: SecureLogger | null;
  private disposed = false;

  constructor(config: WsTransportConfig, logger?: SecureLogger) {
    this.logger = logger ?? null;
    this.config = {
      apiKey: config.apiKey,
      endpoint: config.endpoint ?? DEFAULT_ENDPOINT,
      maxIdleMs: config.maxIdleMs ?? DEFAULT_MAX_IDLE_MS,
      maxLifetimeMs: config.maxLifetimeMs ?? DEFAULT_MAX_LIFETIME_MS,
      pingIntervalMs: config.pingIntervalMs ?? DEFAULT_PING_INTERVAL_MS,
      maxPoolSize: config.maxPoolSize ?? DEFAULT_MAX_POOL_SIZE,
      maxReconnectAttempts: config.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS,
    };
  }

  /**
   * Acquire a connection for a session. Reuses an existing open connection
   * or creates a new one. The sessionKey groups related turns so they can
   * share a `previous_response_id` chain.
   */
  async acquire(sessionKey = 'default'): Promise<WsConnection> {
    if (this.disposed) throw new Error('Transport is disposed');

    const existing = this.pool.get(sessionKey);
    if (existing?.state === 'open') {
      this.resetIdleTimer(existing);
      return existing;
    }

    // Evict stale entry
    if (existing) {
      this.destroyConnection(existing);
    }

    // Enforce pool size limit — evict LRU
    if (this.pool.size >= this.config.maxPoolSize) {
      this.evictLru();
    }

    return this.createConnection(sessionKey);
  }

  /**
   * Send a request through the WebSocket and return an async iterator of server events.
   * The caller is responsible for parsing event types (response.created, response.output_item.delta, etc.).
   */
  async *send(
    conn: WsConnection,
    payload: Record<string, unknown>
  ): AsyncGenerator<WsServerEvent, void, unknown> {
    if (conn.state !== 'open') {
      throw new Error(`Connection ${conn.id} is not open (state: ${conn.state})`);
    }

    // Create a message queue for this request
    const queue: WsServerEvent[] = [];
    let resolve: (() => void) | null = null;
    let done = false;
    let pendingError: Error | undefined;

    const waiter = () =>
      new Promise<void>((r) => {
        resolve = r;
      });

    const onMessage = (data: Buffer | string) => {
      try {
        const event = JSON.parse(data.toString()) as WsServerEvent;
        queue.push(event);
        resolve?.();

        // Terminal events
        if (
          event.type === 'response.completed' ||
          event.type === 'response.failed' ||
          event.type === 'response.cancelled' ||
          event.type === 'error'
        ) {
          done = true;

          // Capture last response ID for incremental turns
          if (event.type === 'response.completed' && event.response?.id) {
            conn.lastResponseId = event.response.id;
          }
        }
      } catch (e) {
        pendingError = e instanceof Error ? e : new Error(String(e));
        resolve?.();
      }
    };

    const onError = (err: Error) => {
      pendingError = err;
      done = true;
      resolve?.();
    };

    const onClose = () => {
      done = true;
      resolve?.();
    };

    conn.ws.on('message', onMessage);
    conn.ws.on('error', onError);
    conn.ws.on('close', onClose);

    try {
      // Send the request
      conn.ws.send(JSON.stringify(payload));
      conn.lastUsedAt = Date.now();

      // Yield events as they arrive
      while (!done || queue.length > 0) {
        if (queue.length > 0) {
          yield queue.shift()!;
        } else if (!done) {
          await waiter();
        }

        if (pendingError) throw pendingError;
      }
    } finally {
      conn.ws.off('message', onMessage);
      conn.ws.off('error', onError);
      conn.ws.off('close', onClose);
    }
  }

  /**
   * Get the last response ID for a session (used for incremental turns).
   */
  getLastResponseId(sessionKey = 'default'): string | null {
    return this.pool.get(sessionKey)?.lastResponseId ?? null;
  }

  /**
   * Release a connection back to the pool (reset idle timer).
   */
  release(conn: WsConnection): void {
    if (this.pool.has(conn.sessionKey)) {
      this.resetIdleTimer(conn);
    }
  }

  /**
   * Get pool statistics for monitoring.
   */
  getPoolStats(): {
    size: number;
    maxSize: number;
    connections: { sessionKey: string; state: string; age: number; idle: number }[];
  } {
    const now = Date.now();
    return {
      size: this.pool.size,
      maxSize: this.config.maxPoolSize,
      connections: Array.from(this.pool.values()).map((c) => ({
        sessionKey: c.sessionKey,
        state: c.state,
        age: now - c.createdAt,
        idle: now - c.lastUsedAt,
      })),
    };
  }

  /**
   * Close all connections and prevent new ones.
   */
  async dispose(): Promise<void> {
    this.disposed = true;
    for (const conn of this.pool.values()) {
      this.destroyConnection(conn);
    }
    this.pool.clear();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private createConnection(sessionKey: string): Promise<WsConnection> {
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const ws = new WebSocket(this.config.endpoint, {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'OpenAI-Beta': 'responses.stream',
        },
      });

      const conn: WsConnection = {
        id,
        ws,
        sessionKey,
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
        lastResponseId: null,
        state: 'connecting',
        reconnectAttempts: 0,
        pingTimer: null,
        idleTimer: null,
        lifetimeTimer: null,
      };

      const timeout = setTimeout(() => {
        ws.terminate();
        reject(new Error('WebSocket connection to OpenAI timed out (15s)'));
      }, 15_000);

      ws.on('open', () => {
        clearTimeout(timeout);
        conn.state = 'open';
        this.pool.set(sessionKey, conn);

        // Start keepalive pings
        conn.pingTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
          }
        }, this.config.pingIntervalMs);

        // Start idle timer
        this.resetIdleTimer(conn);

        // Start lifetime timer
        conn.lifetimeTimer = setTimeout(() => {
          this.logger?.debug({ connId: id, sessionKey }, 'WS connection reached max lifetime');
          this.destroyConnection(conn);
          this.pool.delete(sessionKey);
        }, this.config.maxLifetimeMs);

        this.logger?.debug(
          { connId: id, sessionKey, endpoint: this.config.endpoint },
          'OpenAI WS connection established'
        );

        resolve(conn);
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        this.logger?.warn(
          { connId: id, sessionKey, error: errorToString(err) },
          'OpenAI WS connection error'
        );
        if (conn.state === 'connecting') {
          reject(err);
        }
      });

      ws.on('close', (code, reason) => {
        conn.state = 'closed';
        this.clearTimers(conn);

        this.logger?.debug(
          { connId: id, sessionKey, code, reason: reason.toString() },
          'OpenAI WS connection closed'
        );

        // Auto-reconnect on transient failures
        if (
          TRANSIENT_CLOSE_CODES.has(code) &&
          conn.reconnectAttempts < this.config.maxReconnectAttempts &&
          !this.disposed
        ) {
          conn.reconnectAttempts++;
          this.pool.delete(sessionKey);
          this.logger?.info(
            { connId: id, sessionKey, attempt: conn.reconnectAttempts },
            'Reconnecting OpenAI WS after transient close'
          );
          // Don't await — reconnect is best-effort for future requests
          void this.createConnection(sessionKey).catch((e: unknown) => {
            this.logger?.warn(
              { sessionKey, error: errorToString(e) },
              'OpenAI WS reconnection failed'
            );
          });
        } else {
          this.pool.delete(sessionKey);
        }
      });
    });
  }

  private resetIdleTimer(conn: WsConnection): void {
    if (conn.idleTimer) clearTimeout(conn.idleTimer);
    conn.idleTimer = setTimeout(() => {
      this.logger?.debug(
        { connId: conn.id, sessionKey: conn.sessionKey },
        'WS connection idle timeout'
      );
      this.destroyConnection(conn);
      this.pool.delete(conn.sessionKey);
    }, this.config.maxIdleMs);
  }

  private evictLru(): void {
    let oldest: WsConnection | null = null;
    for (const conn of this.pool.values()) {
      if (!oldest || conn.lastUsedAt < oldest.lastUsedAt) {
        oldest = conn;
      }
    }
    if (oldest) {
      this.logger?.debug(
        { connId: oldest.id, sessionKey: oldest.sessionKey },
        'Evicting LRU WS connection'
      );
      this.destroyConnection(oldest);
      this.pool.delete(oldest.sessionKey);
    }
  }

  private destroyConnection(conn: WsConnection): void {
    this.clearTimers(conn);
    conn.state = 'closing';
    try {
      if (conn.ws.readyState === WebSocket.OPEN || conn.ws.readyState === WebSocket.CONNECTING) {
        conn.ws.close(1000, 'Pool cleanup');
      }
    } catch {
      conn.ws.terminate();
    }
    conn.state = 'closed';
  }

  private clearTimers(conn: WsConnection): void {
    if (conn.pingTimer) {
      clearInterval(conn.pingTimer);
      conn.pingTimer = null;
    }
    if (conn.idleTimer) {
      clearTimeout(conn.idleTimer);
      conn.idleTimer = null;
    }
    if (conn.lifetimeTimer) {
      clearTimeout(conn.lifetimeTimer);
      conn.lifetimeTimer = null;
    }
  }
}
