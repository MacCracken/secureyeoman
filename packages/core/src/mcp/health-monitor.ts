/**
 * MCP Health Monitor — periodic health checks for external MCP servers.
 */

import type { McpServerHealth } from '@secureyeoman/shared';
import type { McpStorage } from './storage.js';
import type { SecureLogger } from '../logging/logger.js';

export interface McpHealthMonitorConfig {
  checkIntervalMs: number;
  autoDisableThreshold: number;
  timeoutMs: number;
}

const DEFAULT_CONFIG: McpHealthMonitorConfig = {
  checkIntervalMs: 60_000,
  autoDisableThreshold: 5,
  timeoutMs: 10_000,
};

export class McpHealthMonitor {
  private storage: McpStorage;
  private logger: SecureLogger;
  private config: McpHealthMonitorConfig;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(storage: McpStorage, logger: SecureLogger, config?: Partial<McpHealthMonitorConfig>) {
    this.storage = storage;
    this.logger = logger;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.checkAll().catch((err: unknown) => {
        this.logger.error({ error: String(err) }, 'Health check cycle failed');
      });
    }, this.config.checkIntervalMs);
    this.logger.info({ intervalMs: this.config.checkIntervalMs }, 'MCP health monitor started');
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.logger.info('MCP health monitor stopped');
    }
  }

  async checkAll(): Promise<McpServerHealth[]> {
    const { servers } = await this.storage.listServers();
    const enabled = servers.filter((s) => s.enabled);
    const settled = await Promise.allSettled(enabled.map((s) => this.checkServer(s.id)));
    for (const result of settled) {
      if (result.status === 'rejected') {
        this.logger.warn(
          { error: result.reason instanceof Error ? result.reason.message : String(result.reason) },
          'MCP health check rejected'
        );
      }
    }
    return settled
      .filter((r): r is PromiseFulfilledResult<McpServerHealth> => r.status === 'fulfilled')
      .map((r) => r.value);
  }

  async checkServer(serverId: string): Promise<McpServerHealth> {
    const server = await this.storage.getServer(serverId);
    if (!server) {
      return {
        serverId,
        status: 'unknown',
        latencyMs: null,
        consecutiveFailures: 0,
        lastCheckedAt: Date.now(),
        lastSuccessAt: null,
        lastError: 'Server not found',
      };
    }

    const existing = await this.storage.getHealth(serverId);
    const now = Date.now();
    let health: McpServerHealth;

    try {
      const startTime = performance.now();

      if (server.transport === 'stdio') {
        // For stdio servers, attempt tool discovery as a health check
        const tools = await this.storage.loadTools(serverId);
        if (tools.length === 0) {
          throw new Error('No tools registered');
        }
      } else if (server.url) {
        // For HTTP-based servers, ping the endpoint
        const response = await fetch(server.url, {
          method: 'GET',
          signal: AbortSignal.timeout(this.config.timeoutMs),
          headers: { 'User-Agent': 'SecureYeoman-HealthCheck/1.0' },
        });
        if (!response.ok && response.status !== 405) {
          throw new Error(`HTTP ${response.status}`);
        }
      } else {
        throw new Error('No URL configured for remote server');
      }

      const latencyMs = Math.round(performance.now() - startTime);

      health = {
        serverId,
        status: 'healthy',
        latencyMs,
        consecutiveFailures: 0,
        lastCheckedAt: now,
        lastSuccessAt: now,
        lastError: null,
      };
    } catch (err) {
      const failures = (existing?.consecutiveFailures ?? 0) + 1;
      const errorMsg = err instanceof Error ? err.message : String(err);

      health = {
        serverId,
        status: failures >= this.config.autoDisableThreshold ? 'unhealthy' : 'degraded',
        latencyMs: null,
        consecutiveFailures: failures,
        lastCheckedAt: now,
        lastSuccessAt: existing?.lastSuccessAt ?? null,
        lastError: errorMsg,
      };

      this.logger.warn(
        {
          serverId,
          serverName: server.name,
          failures,
          error: errorMsg,
        },
        'MCP server health check failed'
      );

      // Auto-disable after threshold
      if (failures >= this.config.autoDisableThreshold) {
        this.logger.error(
          {
            serverId,
            serverName: server.name,
            failures,
          },
          'MCP server auto-disabled due to consecutive failures'
        );
        await this.storage.updateServer(serverId, { enabled: false });
      }
    }

    await this.storage.saveHealth(health);
    return health;
  }
}
