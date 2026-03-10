/**
 * AGNOS Lifecycle Manager — handles agent registration, heartbeats, and shutdown.
 */

import type { AgnosClient, AgnosAgentProfile } from './agnos-client.js';
import type { SecureLogger } from '../../logging/logger.js';

export interface AgnosLifecycleConfig {
  heartbeatIntervalMs?: number;
}

export class AgnosLifecycleManager {
  private readonly client: AgnosClient;
  private readonly logger: SecureLogger;
  private readonly heartbeatIntervalMs: number;
  private registeredAgentIds: string[] = [];
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(client: AgnosClient, logger: SecureLogger, config?: AgnosLifecycleConfig) {
    this.client = client;
    this.logger = logger.child({ component: 'agnos-lifecycle' });
    this.heartbeatIntervalMs = config?.heartbeatIntervalMs ?? 30_000;
  }

  /** Register agent profiles with AGNOS and start heartbeats. */
  async start(profiles: AgnosAgentProfile[]): Promise<void> {
    if (profiles.length === 0) {
      this.logger.debug('No agent profiles to register with AGNOS');
      return;
    }

    try {
      const result = await this.client.registerAgentsBatch(profiles);
      this.registeredAgentIds = profiles.map((p) => p.id);
      this.logger.info(
        { registered: result.registered, total: profiles.length },
        'Agent profiles registered with AGNOS'
      );

      // Start heartbeat timer
      this.heartbeatTimer = setInterval(() => {
        this.sendHeartbeat().catch((err: unknown) => {
          this.logger.debug(
            { error: err instanceof Error ? err.message : String(err) },
            'AGNOS heartbeat failed'
          );
        });
      }, this.heartbeatIntervalMs);
      // Unref so heartbeat doesn't prevent Node.js from exiting
      if (this.heartbeatTimer.unref) this.heartbeatTimer.unref();
    } catch (err) {
      this.logger.warn(
        { error: err instanceof Error ? err.message : String(err) },
        'Failed to register agents with AGNOS (non-fatal)'
      );
    }
  }

  /** Stop heartbeats and deregister from AGNOS. */
  async stop(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    for (const id of this.registeredAgentIds) {
      try {
        await this.client.deregisterAgent(id);
      } catch {
        // Best-effort deregistration
      }
    }

    if (this.registeredAgentIds.length > 0) {
      this.logger.info({ count: this.registeredAgentIds.length }, 'Deregistered agents from AGNOS');
    }
    this.registeredAgentIds = [];
  }

  private async sendHeartbeat(): Promise<void> {
    if (this.registeredAgentIds.length === 0) return;
    await this.client.heartbeat(this.registeredAgentIds);
  }
}
