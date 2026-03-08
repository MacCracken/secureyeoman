/**
 * CognitiveMemoryManager — Background worker for Hebbian decay and
 * cognitive memory statistics (Phase 124).
 */

import type { SecureLogger } from '../logging/logger.js';
import type { CognitiveMemoryStorage } from './cognitive-memory-store.js';
import type { CognitiveStats } from './types.js';

export interface CognitiveMemoryManagerOpts {
  storage: CognitiveMemoryStorage;
  logger: SecureLogger;
  /** Hebbian decay factor per maintenance cycle (default 0.9). */
  hebbianDecayFactor?: number;
  /** Maintenance interval in ms (default 1 hour). */
  maintenanceIntervalMs?: number;
}

export class CognitiveMemoryManager {
  private readonly storage: CognitiveMemoryStorage;
  private readonly logger: SecureLogger;
  private readonly hebbianDecayFactor: number;
  private readonly maintenanceIntervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: CognitiveMemoryManagerOpts) {
    this.storage = opts.storage;
    this.logger = opts.logger;
    this.hebbianDecayFactor = opts.hebbianDecayFactor ?? 0.9;
    this.maintenanceIntervalMs = opts.maintenanceIntervalMs ?? 3_600_000;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.runMaintenance().catch((err: unknown) => {
        this.logger.warn({ err: String(err) }, 'Cognitive memory maintenance failed');
      });
    }, this.maintenanceIntervalMs);
    this.timer.unref?.();
    this.logger.info(
      {
        intervalMs: this.maintenanceIntervalMs,
      },
      'Cognitive memory manager started'
    );
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Run a single maintenance cycle: decay Hebbian association weights
   * and prune near-zero entries.
   */
  async runMaintenance(): Promise<{ decayed: number }> {
    const deleted = await this.storage.decayAssociations(this.hebbianDecayFactor);
    this.logger.info(
      {
        deleted,
        decayFactor: this.hebbianDecayFactor,
      },
      'Cognitive maintenance done'
    );
    return { decayed: deleted };
  }

  /**
   * Get cognitive statistics for a personality (or global).
   */
  async getCognitiveStats(personalityId?: string): Promise<CognitiveStats> {
    return this.storage.getCognitiveStats(personalityId);
  }
}
