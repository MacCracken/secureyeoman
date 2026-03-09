/**
 * DriftDetectionManager — computes baseline from conversation_quality scores,
 * periodically checks for distribution drift, creates snapshots, alerts.
 */

import type { Pool } from 'pg';
import type { SecureLogger } from '../logging/logger.js';
import type { AlertManager } from '../telemetry/alert-manager.js';
import type { DriftBaseline, DriftSnapshot } from '@secureyeoman/shared';
import { errorToString } from '../utils/errors.js';

function rowToBaseline(row: Record<string, unknown>): DriftBaseline {
  return {
    id: row.id as string,
    personalityId: row.personality_id as string,
    baselineMean: row.baseline_mean as number,
    baselineStddev: row.baseline_stddev as number,
    sampleCount: row.sample_count as number,
    threshold: (row.threshold as number) ?? 0.15,
    computedAt:
      row.computed_at instanceof Date
        ? row.computed_at.toISOString()
        : String(row.computed_at ?? ''),
  };
}

function rowToSnapshot(row: Record<string, unknown>): DriftSnapshot {
  return {
    id: row.id as string,
    baselineId: row.baseline_id as string,
    currentMean: row.current_mean as number,
    currentStddev: row.current_stddev as number,
    sampleCount: row.sample_count as number,
    driftMagnitude: row.drift_magnitude as number,
    alertTriggered: (row.alert_triggered as boolean) ?? false,
    computedAt:
      row.computed_at instanceof Date
        ? row.computed_at.toISOString()
        : String(row.computed_at ?? ''),
  };
}

export interface DriftDetectionManagerDeps {
  pool: Pool;
  logger: SecureLogger;
  getAlertManager?: () => AlertManager | null;
}

export class DriftDetectionManager {
  private checkInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly deps: DriftDetectionManagerDeps) {}

  /**
   * Compute a baseline from recent conversation quality scores for a personality.
   */
  async computeBaseline(personalityId: string, threshold = 0.15): Promise<DriftBaseline> {
    const { rows: stats } = await this.deps.pool.query<{
      avg: number;
      stddev: number;
      count: string;
    }>(
      `SELECT
         AVG(cq.quality_score) AS avg,
         COALESCE(STDDEV(cq.quality_score), 0) AS stddev,
         COUNT(*)::text AS count
       FROM training.conversation_quality cq
       JOIN chat.conversations c ON c.id = cq.conversation_id
       JOIN chat.messages m ON m.conversation_id = c.id
       WHERE m.personality_id = $1
       GROUP BY true`,
      [personalityId]
    );

    const mean = stats[0]?.avg ?? 0.5;
    const stddev = stats[0]?.stddev ?? 0;
    const count = parseInt(stats[0]?.count ?? '0', 10);

    const { rows } = await this.deps.pool.query<Record<string, unknown>>(
      `INSERT INTO training.drift_baselines
         (personality_id, baseline_mean, baseline_stddev, sample_count, threshold)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [personalityId, mean, stddev, count, threshold]
    );

    this.deps.logger.info({ personalityId, mean, stddev, count }, 'Drift baseline computed');
    return rowToBaseline(rows[0]!);
  }

  async listBaselines(): Promise<DriftBaseline[]> {
    const { rows } = await this.deps.pool.query<Record<string, unknown>>(
      `SELECT * FROM training.drift_baselines ORDER BY computed_at DESC LIMIT 100`
    );
    return rows.map(rowToBaseline);
  }

  async getBaseline(id: string): Promise<DriftBaseline | null> {
    const { rows } = await this.deps.pool.query<Record<string, unknown>>(
      `SELECT * FROM training.drift_baselines WHERE id = $1`,
      [id]
    );
    return rows[0] ? rowToBaseline(rows[0]) : null;
  }

  async getSnapshots(baselineId: string): Promise<DriftSnapshot[]> {
    const { rows } = await this.deps.pool.query<Record<string, unknown>>(
      `SELECT * FROM training.drift_snapshots WHERE baseline_id = $1 ORDER BY computed_at DESC LIMIT 100`,
      [baselineId]
    );
    return rows.map(rowToSnapshot);
  }

  /**
   * Check drift for all baselines. Computes current distribution and
   * compares to baseline. Creates snapshot, alerts if drift exceeds threshold.
   */
  async checkAllDrift(): Promise<DriftSnapshot[]> {
    const baselines = await this.listBaselines();
    const snapshots: DriftSnapshot[] = [];

    for (const baseline of baselines) {
      try {
        const snapshot = await this.checkDrift(baseline);
        if (snapshot) snapshots.push(snapshot);
      } catch (err) {
        this.deps.logger.warn(
          {
            baselineId: baseline.id,
            error: errorToString(err),
          },
          'Drift check failed for baseline'
        );
      }
    }

    return snapshots;
  }

  /**
   * Check drift for a single baseline.
   */
  async checkDrift(baseline: DriftBaseline): Promise<DriftSnapshot | null> {
    // Get recent quality scores for this personality
    const { rows: stats } = await this.deps.pool.query<{
      avg: number;
      stddev: number;
      count: string;
    }>(
      `SELECT
         AVG(cq.quality_score) AS avg,
         COALESCE(STDDEV(cq.quality_score), 0) AS stddev,
         COUNT(*)::text AS count
       FROM training.conversation_quality cq
       JOIN chat.conversations c ON c.id = cq.conversation_id
       JOIN chat.messages m ON m.conversation_id = c.id
       WHERE m.personality_id = $1
         AND cq.scored_at > $2
       GROUP BY true`,
      [baseline.personalityId, baseline.computedAt]
    );

    if (!stats[0] || parseInt(stats[0].count, 10) < 5) return null;

    const currentMean = stats[0].avg;
    const currentStddev = stats[0].stddev;
    const sampleCount = parseInt(stats[0].count, 10);

    // Compute drift magnitude: normalized difference in means
    const driftMagnitude =
      baseline.baselineStddev > 0
        ? Math.abs(currentMean - baseline.baselineMean) / baseline.baselineStddev
        : Math.abs(currentMean - baseline.baselineMean);

    const alertTriggered = driftMagnitude > baseline.threshold;

    const { rows } = await this.deps.pool.query<Record<string, unknown>>(
      `INSERT INTO training.drift_snapshots
         (baseline_id, current_mean, current_stddev, sample_count, drift_magnitude, alert_triggered)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [baseline.id, currentMean, currentStddev, sampleCount, driftMagnitude, alertTriggered]
    );

    const snapshot = rowToSnapshot(rows[0]!);

    if (alertTriggered) {
      this.deps.logger.warn(
        {
          personalityId: baseline.personalityId,
          driftMagnitude,
          threshold: baseline.threshold,
        },
        'Quality drift detected'
      );
    }

    return snapshot;
  }

  startPeriodicCheck(intervalMs: number): void {
    if (this.checkInterval) return;
    this.checkInterval = setInterval(() => {
      void this.checkAllDrift().catch((err: unknown) => {
        this.deps.logger.error(
          {
            error: errorToString(err),
          },
          'Periodic drift check error'
        );
      });
    }, intervalMs);
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}
