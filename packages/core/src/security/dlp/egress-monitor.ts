/**
 * Egress Monitor — anomaly detection and statistics for DLP egress events.
 *
 * Phase 136-F — DLP Egress Monitoring
 */

import type { SecureLogger } from '../../logging/logger.js';
import type { EgressStore } from './egress-store.js';
import type { EgressStats, EgressAnomaly, EgressDestination } from './types.js';

export interface EgressMonitorDeps {
  egressStore: EgressStore;
  logger: SecureLogger;
}

export class EgressMonitor {
  private readonly egressStore: EgressStore;
  private readonly logger: SecureLogger;

  constructor(deps: EgressMonitorDeps) {
    this.egressStore = deps.egressStore;
    this.logger = deps.logger;
  }

  /**
   * Aggregate egress_log by destination, action, classification level.
   */
  async getStats(from: number, to: number): Promise<EgressStats> {
    const { events } = await this.egressStore.query({
      fromTime: from,
      toTime: to,
      limit: 10_000,
    });

    const byDestination: Record<string, number> = {};
    const byAction: Record<string, number> = {};
    const byClassification: Record<string, number> = {};

    for (const event of events) {
      const dest = event.destinationType || 'unknown';
      byDestination[dest] = (byDestination[dest] ?? 0) + 1;

      byAction[event.actionTaken] = (byAction[event.actionTaken] ?? 0) + 1;

      const cls = event.classificationLevel ?? 'unclassified';
      byClassification[cls] = (byClassification[cls] ?? 0) + 1;
    }

    this.logger.debug(
      { totalEvents: events.length, period: { from, to } },
      'Egress stats computed'
    );

    return {
      totalEvents: events.length,
      byDestination,
      byAction,
      byClassification,
      period: { from, to },
    };
  }

  /**
   * Z-score anomaly detection on hourly volumes.
   * Looks at the last 7 days of egress events and flags hours with z-score > 2.
   */
  async getAnomalies(): Promise<EgressAnomaly[]> {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    const { events } = await this.egressStore.query({
      fromTime: sevenDaysAgo,
      toTime: now,
      limit: 50_000,
    });

    // Bucket events by hour
    const hourBuckets = new Map<string, number>();
    for (const event of events) {
      const date = new Date(event.createdAt);
      const hourKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:00`;
      hourBuckets.set(hourKey, (hourBuckets.get(hourKey) ?? 0) + 1);
    }

    if (hourBuckets.size < 3) return [];

    const volumes = [...hourBuckets.values()];
    const mean = volumes.reduce((s, v) => s + v, 0) / volumes.length;
    const variance = volumes.reduce((s, v) => s + (v - mean) ** 2, 0) / volumes.length;
    const stddev = Math.sqrt(variance);

    if (stddev === 0) return [];

    const anomalies: EgressAnomaly[] = [];
    for (const [hour, volume] of hourBuckets) {
      const zScore = (volume - mean) / stddev;
      if (zScore > 2) {
        anomalies.push({
          hour,
          volume,
          mean: Math.round(mean * 100) / 100,
          stddev: Math.round(stddev * 100) / 100,
          zScore: Math.round(zScore * 100) / 100,
          type: 'volume_spike',
        });
      }
    }

    // Check for new destinations (seen only in last 24h)
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const recentDests = new Set<string>();
    const olderDests = new Set<string>();
    for (const event of events) {
      if (event.createdAt >= oneDayAgo) {
        recentDests.add(event.destinationType);
      } else {
        olderDests.add(event.destinationType);
      }
    }
    for (const dest of recentDests) {
      if (!olderDests.has(dest)) {
        anomalies.push({
          hour: new Date(oneDayAgo).toISOString().slice(0, 13) + ':00',
          volume: 1,
          mean: 0,
          stddev: 0,
          zScore: 0,
          type: 'new_destination',
        });
      }
    }

    // Check for restricted egress in last 24h
    for (const event of events) {
      if (
        event.createdAt >= oneDayAgo &&
        event.classificationLevel === 'restricted' &&
        event.actionTaken === 'allowed'
      ) {
        anomalies.push({
          hour: new Date(event.createdAt).toISOString().slice(0, 13) + ':00',
          volume: 1,
          mean: 0,
          stddev: 0,
          zScore: 0,
          type: 'restricted_egress',
        });
        break; // one anomaly per type is enough
      }
    }

    this.logger.debug(
      { anomalyCount: anomalies.length },
      'Egress anomaly detection completed'
    );

    return anomalies;
  }

  /**
   * List known egress destinations with last-seen timestamps.
   */
  async getDestinations(): Promise<EgressDestination[]> {
    const { events } = await this.egressStore.query({ limit: 10_000 });

    const destMap = new Map<string, EgressDestination>();
    for (const event of events) {
      const key = event.destinationType;
      const existing = destMap.get(key);
      if (!existing) {
        destMap.set(key, {
          destination: key,
          destinationType: event.destinationType,
          eventCount: 1,
          lastSeen: event.createdAt,
        });
      } else {
        existing.eventCount += 1;
        if (event.createdAt > existing.lastSeen) {
          existing.lastSeen = event.createdAt;
        }
      }
    }

    return [...destMap.values()].sort((a, b) => b.lastSeen - a.lastSeen);
  }
}
