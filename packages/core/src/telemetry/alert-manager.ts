/**
 * AlertManager (Phase 83 — Observability)
 *
 * Evaluates MetricsSnapshot values against stored alert rules, respects
 * cooldown windows, and dispatches to external channels (Slack, PagerDuty,
 * OpsGenie, generic webhook).
 *
 * Registered channels fire-and-forget; errors are logged but never thrown.
 */

import type {
  AlertStorage,
  AlertRule,
  AlertChannel,
  CreateAlertRuleData,
} from './alert-storage.js';
import type { NotificationManager } from '../notifications/notification-manager.js';
import type { SecureLogger } from '../logging/logger.js';
import { errorToString } from '../utils/errors.js';

export type { AlertRule, AlertChannel };

export class AlertManager {
  /** In-memory rule cache, invalidated on any CRUD mutation. */
  private _cachedRules: AlertRule[] | null = null;
  private _cacheExpiry = 0;
  private readonly CACHE_TTL_MS = 30_000;

  constructor(
    private readonly storage: AlertStorage,
    private readonly notificationManager: NotificationManager,
    private readonly logger: SecureLogger
  ) {}

  // ── CRUD ────────────────────────────────────────────────────────────────────

  async createRule(data: CreateAlertRuleData): Promise<AlertRule> {
    const rule = await this.storage.createRule(data);
    this._invalidateCache();
    return rule;
  }

  async updateRule(id: string, patch: Partial<AlertRule>): Promise<AlertRule | null> {
    const rule = await this.storage.updateRule(id, patch);
    this._invalidateCache();
    return rule;
  }

  async deleteRule(id: string): Promise<boolean> {
    const deleted = await this.storage.deleteRule(id);
    this._invalidateCache();
    return deleted;
  }

  async listRules(): Promise<AlertRule[]> {
    return this.storage.listRules();
  }

  async getRule(id: string): Promise<AlertRule | null> {
    return this.storage.getRule(id);
  }

  // ── Evaluation ──────────────────────────────────────────────────────────────

  /**
   * Evaluate a metrics snapshot against all enabled alert rules.
   * Called by the metrics broadcast loop every 5s.
   */
  async evaluate(snapshot: Record<string, unknown>): Promise<void> {
    const rules = await this._getEnabledRules();
    if (rules.length === 0) return;

    const now = Date.now();

    for (const rule of rules) {
      try {
        if (!rule.enabled) continue;

        const value = resolvePath(snapshot, rule.metricPath);
        if (value === undefined || value === null || typeof value !== 'number') continue;

        if (!compareOperator(value, rule.operator, rule.threshold)) continue;

        // Cooldown guard
        if (rule.lastFiredAt && now - rule.lastFiredAt < rule.cooldownSeconds * 1000) continue;

        // Fire!
        await this._fire(rule, value, now);
      } catch (err) {
        this.logger.error(
          {
            ruleId: rule.id,
            ruleName: rule.name,
            error: errorToString(err),
          },
          'Alert rule evaluation error'
        );
      }
    }
  }

  /**
   * Test a specific rule against a snapshot bypassing cooldown.
   * Returns whether the rule would fire and what the current metric value is.
   */
  async testRule(
    id: string,
    snapshot: Record<string, unknown>
  ): Promise<{ fired: boolean; value: number | null }> {
    const rule = await this.storage.getRule(id);
    if (!rule) throw new Error('Alert rule not found');

    const value = resolvePath(snapshot, rule.metricPath);
    if (value === undefined || value === null || typeof value !== 'number') {
      return { fired: false, value: null };
    }

    const fired = compareOperator(value, rule.operator, rule.threshold);
    if (fired) {
      await this._fire(rule, value, Date.now());
    }
    return { fired, value };
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  private async _getEnabledRules(): Promise<AlertRule[]> {
    const now = Date.now();
    if (this._cachedRules && now < this._cacheExpiry) return this._cachedRules;

    this._cachedRules = await this.storage.listRules(true);
    this._cacheExpiry = now + this.CACHE_TTL_MS;
    return this._cachedRules;
  }

  private _invalidateCache(): void {
    this._cachedRules = null;
    this._cacheExpiry = 0;
  }

  private async _fire(rule: AlertRule, value: number, firedAt: number): Promise<void> {
    // Persist fired-at
    await this.storage.markFired(rule.id, firedAt);
    // Invalidate cache so lastFiredAt is refreshed
    this._invalidateCache();

    const body =
      `Alert "${rule.name}" fired: metric "${rule.metricPath}" = ${value} ` +
      `(${rule.operator} ${rule.threshold})`;

    // In-app notification
    try {
      await this.notificationManager.notify({
        type: 'alert',
        title: rule.name,
        body,
        level: 'error',
        source: 'alert-manager',
        metadata: {
          ruleId: rule.id,
          metricPath: rule.metricPath,
          value,
          threshold: rule.threshold,
        },
      });
    } catch (err) {
      this.logger.error(
        {
          ruleId: rule.id,
          error: errorToString(err),
        },
        'Failed to create alert notification'
      );
    }

    // External channel fan-out (fire-and-forget)
    for (const channel of rule.channels) {
      void this._dispatchChannel(channel, rule, value).catch((err: unknown) => {
        this.logger.error(
          {
            ruleId: rule.id,
            channelType: channel.type,
            error: errorToString(err),
          },
          'Alert channel dispatch error'
        );
      });
    }
  }

  private async _dispatchChannel(
    channel: AlertChannel,
    rule: AlertRule,
    value: number
  ): Promise<void> {
    const text = `🚨 Alert: ${rule.name} — value=${value} threshold=${rule.threshold}`;

    switch (channel.type) {
      case 'slack': {
        if (!channel.url) return;
        await fetch(channel.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
          signal: AbortSignal.timeout(5000),
        });
        break;
      }

      case 'pagerduty': {
        if (!channel.routingKey) return;
        await fetch('https://events.pagerduty.com/v2/enqueue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            routing_key: channel.routingKey,
            event_action: 'trigger',
            payload: {
              summary: text,
              severity: 'critical',
              source: 'secureyeoman',
              custom_details: {
                rule_id: rule.id,
                metric_path: rule.metricPath,
                value,
                threshold: rule.threshold,
                operator: rule.operator,
              },
            },
          }),
          signal: AbortSignal.timeout(5000),
        });
        break;
      }

      case 'opsgenie': {
        if (!channel.routingKey) return;
        await fetch('https://api.opsgenie.com/v2/alerts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `GenieKey ${channel.routingKey}`,
          },
          body: JSON.stringify({
            message: text,
            description: `Rule: ${rule.name} | Path: ${rule.metricPath} | Value: ${value} | Threshold: ${rule.threshold}`,
            source: 'secureyeoman',
            priority: 'P1',
          }),
          signal: AbortSignal.timeout(5000),
        });
        break;
      }

      case 'webhook': {
        if (!channel.url) return;
        await fetch(channel.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rule: {
              id: rule.id,
              name: rule.name,
              metricPath: rule.metricPath,
              operator: rule.operator,
              threshold: rule.threshold,
            },
            value,
            snapshot_timestamp: Date.now(),
          }),
          signal: AbortSignal.timeout(5000),
        });
        break;
      }

      case 'ntfy': {
        if (!channel.url) return;
        const headers: Record<string, string> = {
          Title: `Alert: ${rule.name}`,
          Priority: 'high',
          Tags: 'warning',
        };
        if (channel.routingKey) {
          headers.Authorization = `Bearer ${channel.routingKey}`;
        }
        await fetch(channel.url, {
          method: 'POST',
          headers,
          body: text,
          signal: AbortSignal.timeout(5000),
        });
        break;
      }
    }
  }
}

// ── Utility functions ────────────────────────────────────────────────────────

/**
 * Resolve a dot-notation path (e.g. "security.rateLimitHitsTotal") into a
 * nested object. Returns undefined when any key is missing.
 */
export function resolvePath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function compareOperator(
  value: number,
  operator: AlertRule['operator'],
  threshold: number
): boolean {
  switch (operator) {
    case 'gt':
      return value > threshold;
    case 'lt':
      return value < threshold;
    case 'gte':
      return value >= threshold;
    case 'lte':
      return value <= threshold;
    case 'eq':
      return value === threshold;
    default:
      return false;
  }
}
