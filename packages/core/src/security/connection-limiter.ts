/**
 * Connection Limiter — Application-level defense against Slowloris, SYN floods,
 * and connection exhaustion attacks.
 *
 * Operates on raw TCP sockets (Node `http.Server` 'connection' event) so limits
 * are enforced before any HTTP parsing. This protects users who run SecureYeoman
 * without a reverse proxy in front.
 *
 * Defenses:
 *   - Per-IP concurrent connection cap
 *   - Global concurrent connection cap
 *   - Per-IP connection rate limiting (connections/sec)
 *   - Headers timeout (Slowloris mitigation)
 *   - Request timeout, keep-alive timeout, max requests per socket
 */

import type { Server as HttpServer } from 'node:http';
import type { Server as HttpsServer } from 'node:https';
import type { Socket } from 'node:net';
import type { ConnectionLimitsConfig } from '@secureyeoman/shared';
import { getLogger, createNoopLogger, type SecureLogger } from '../logging/logger.js';
import { normalizeIp } from '../utils/ip.js';

interface IpState {
  /** Active connections from this IP. */
  connections: Set<Socket>;
  /** Timestamps of recent connection attempts (sliding window). */
  recentConnections: number[];
}

export class ConnectionLimiter {
  private readonly ipState = new Map<string, IpState>();
  private totalConnections = 0;
  private readonly config: ConnectionLimitsConfig;
  private logger: SecureLogger;
  private cleanupInterval: NodeJS.Timeout | null = null;

  // Stats
  private rejectedByIpLimit = 0;
  private rejectedByGlobalLimit = 0;
  private rejectedByRateLimit = 0;

  constructor(config: ConnectionLimitsConfig) {
    this.config = config;
    try {
      this.logger = getLogger().child({ component: 'ConnectionLimiter' });
    } catch {
      this.logger = createNoopLogger();
    }
  }

  /**
   * Attach to a Node HTTP/HTTPS server. Must be called after Fastify listen()
   * exposes the underlying server via `app.server`.
   */
  attach(server: HttpServer | HttpsServer): void {
    // Set Node-level timeouts on the server itself
    server.headersTimeout = this.config.headersTimeoutMs;
    server.requestTimeout = this.config.requestTimeoutMs;
    server.keepAliveTimeout = this.config.keepAliveTimeoutMs;
    if (this.config.maxRequestsPerSocket > 0) {
      server.maxRequestsPerSocket = this.config.maxRequestsPerSocket;
    }

    server.on('connection', (socket: Socket) => {
      this.onConnection(socket);
    });

    // Periodic cleanup of stale IP entries (no active connections, rate window expired)
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 30_000);
    this.cleanupInterval.unref();

    this.logger.info(
      {
        maxPerIp: this.config.maxConnectionsPerIp,
        maxTotal: this.config.maxTotalConnections,
        ratePerSec: this.config.connectionRatePerIpPerSec,
        headersTimeoutMs: this.config.headersTimeoutMs,
        requestTimeoutMs: this.config.requestTimeoutMs,
        keepAliveTimeoutMs: this.config.keepAliveTimeoutMs,
        maxRequestsPerSocket: this.config.maxRequestsPerSocket,
      },
      'Connection limiter attached'
    );
  }

  private onConnection(socket: Socket): void {
    const ip = normalizeIp(socket.remoteAddress);

    // ── Global connection limit ──────────────────────────────────────
    if (
      this.config.maxTotalConnections > 0 &&
      this.totalConnections >= this.config.maxTotalConnections
    ) {
      this.rejectedByGlobalLimit++;
      this.logger.warn(
        { ip, total: this.totalConnections },
        'Connection rejected: global limit reached'
      );
      socket.destroy();
      return;
    }

    // ── Per-IP state ─────────────────────────────────────────────────
    let state = this.ipState.get(ip);
    if (!state) {
      state = { connections: new Set(), recentConnections: [] };
      this.ipState.set(ip, state);
    }

    // ── Per-IP concurrent connection limit ────────────────────────────
    if (
      this.config.maxConnectionsPerIp > 0 &&
      state.connections.size >= this.config.maxConnectionsPerIp
    ) {
      this.rejectedByIpLimit++;
      this.logger.warn(
        { ip, count: state.connections.size, limit: this.config.maxConnectionsPerIp },
        'Connection rejected: per-IP limit reached'
      );
      socket.destroy();
      return;
    }

    // ── Per-IP connection rate limit ──────────────────────────────────
    if (this.config.connectionRatePerIpPerSec > 0) {
      const now = Date.now();
      const windowStart = now - 1000;
      // Prune entries older than 1 second
      state.recentConnections = state.recentConnections.filter((t) => t > windowStart);

      if (state.recentConnections.length >= this.config.connectionRatePerIpPerSec) {
        this.rejectedByRateLimit++;
        this.logger.warn(
          {
            ip,
            rate: state.recentConnections.length,
            limit: this.config.connectionRatePerIpPerSec,
          },
          'Connection rejected: rate limit exceeded'
        );
        socket.destroy();
        return;
      }
      state.recentConnections.push(now);
    }

    // ── Accept connection ────────────────────────────────────────────
    state.connections.add(socket);
    this.totalConnections++;

    const s = state;
    const onClose = () => {
      s.connections.delete(socket);
      this.totalConnections--;
      if (s.connections.size === 0 && s.recentConnections.length === 0) {
        this.ipState.delete(ip);
      }
    };

    socket.once('close', onClose);
    socket.once('error', onClose);
  }

  /** Remove stale IP entries with no active connections and no recent rate window. */
  private cleanup(): void {
    const now = Date.now();
    const windowStart = now - 1000;

    for (const [ip, state] of this.ipState) {
      state.recentConnections = state.recentConnections.filter((t) => t > windowStart);
      if (state.connections.size === 0 && state.recentConnections.length === 0) {
        this.ipState.delete(ip);
      }
    }
  }

  getStats(): {
    totalConnections: number;
    uniqueIps: number;
    rejectedByIpLimit: number;
    rejectedByGlobalLimit: number;
    rejectedByRateLimit: number;
  } {
    return {
      totalConnections: this.totalConnections,
      uniqueIps: this.ipState.size,
      rejectedByIpLimit: this.rejectedByIpLimit,
      rejectedByGlobalLimit: this.rejectedByGlobalLimit,
      rejectedByRateLimit: this.rejectedByRateLimit,
    };
  }

  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.ipState.clear();
    this.totalConnections = 0;
  }
}
