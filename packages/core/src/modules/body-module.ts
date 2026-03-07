/**
 * BodyModule — owns heartbeat, heartbeat log storage, and heart manager.
 *
 * Extracted from SecureYeoman Step 6.6.
 */

import { BaseModule } from './types.js';
import { HeartbeatManager } from '../body/heartbeat.js';
import { HeartbeatLogStorage } from '../body/heartbeat-log-storage.js';
import { HeartManager } from '../body/heart.js';
import type { BrainManager } from '../brain/manager.js';
import type { AuditChain } from '../logging/audit-chain.js';
import type { IntegrationManager } from '../integrations/manager.js';
import type { NotificationManager } from '../notifications/notification-manager.js';
import type { SoulManager } from '../soul/manager.js';

/** Cross-module dependencies injected before init. */
export interface BodyModuleDeps {
  brainManager: BrainManager;
  auditChain: AuditChain;
  integrationManager?: IntegrationManager | null;
  notificationManager?: NotificationManager | null;
  soulManager: SoulManager;
}

export class BodyModule extends BaseModule {
  private heartbeatManager: HeartbeatManager | null = null;
  private heartbeatLogStorage: HeartbeatLogStorage | null = null;
  private heartManager: HeartManager | null = null;

  constructor(private readonly deps: BodyModuleDeps) {
    super();
  }

  protected async doInit(): Promise<void> {
    if (!this.config.heartbeat?.enabled) return;

    this.heartbeatLogStorage = new HeartbeatLogStorage();
    this.heartbeatManager = new HeartbeatManager(
      this.deps.brainManager,
      this.deps.auditChain,
      this.logger.child({ component: 'HeartbeatManager' }),
      this.config.heartbeat,
      this.deps.integrationManager ?? undefined,
      this.heartbeatLogStorage
    );
    this.heartManager = new HeartManager(this.heartbeatManager);
    this.deps.soulManager.setHeart(this.heartManager);
    if (this.deps.integrationManager) {
      this.deps.soulManager.setIntegrationManager(this.deps.integrationManager);
    }
    // Wire notification manager so heartbeat alerts create DB records
    if (this.deps.notificationManager) {
      this.heartbeatManager.setNotificationManager(this.deps.notificationManager);
    }
    await this.heartbeatManager.initialize();
    this.heartbeatManager.start();
    this.logger.debug({
      intervalMs: this.config.heartbeat.intervalMs,
    }, 'Heart manager started');

    // Seed personality roster (fire-and-forget)
    const hbmRef = this.heartbeatManager;
    const { soulManager } = this.deps;
    void Promise.all([
      soulManager.getActivePersonality(),
      soulManager.listPersonalities({ limit: 200 }),
    ])
      .then(([active, allResult]) => {
        if (active?.body?.activeHours) {
          hbmRef.setPersonalitySchedule(active.body.activeHours);
        }
        if (active?.id) {
          hbmRef.setActivePersonalityId(active.id);
        }
        hbmRef.setActivePersonalityIds(
          allResult.personalities.map((p) => ({
            id: p.id,
            name: p.name,
            omnipresentMind: p.body?.omnipresentMind ?? false,
          }))
        );
      })
      .catch((err: unknown) => {
        this.logger?.warn({
          error: err instanceof Error ? err.message : 'Unknown error',
        }, 'Failed to seed personality roster for heartbeat');
      });
  }

  async cleanup(): Promise<void> {
    if (this.heartbeatManager) {
      this.heartbeatManager.stop();
      this.heartbeatManager = null;
    }
    if (this.heartbeatLogStorage) {
      this.heartbeatLogStorage.close();
      this.heartbeatLogStorage = null;
    }
    this.heartManager = null;
  }

  // --- Getters ---

  getHeartbeatManager(): HeartbeatManager | null {
    return this.heartbeatManager;
  }

  getHeartbeatLogStorage(): HeartbeatLogStorage | null {
    return this.heartbeatLogStorage;
  }

  getHeartManager(): HeartManager | null {
    return this.heartManager;
  }
}
