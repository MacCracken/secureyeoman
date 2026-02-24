/**
 * IntentManager — Phase 48: Machine Readable Organizational Intent
 *
 * Sub-systems:
 *   GoalResolver           — resolveActiveGoals(ctx)
 *   SignalMonitor          — readSignal(signalId), background refresh
 *   TradeoffResolver       — resolveTradeoffProfile(overrides?)
 *   DelegationFrameworkResolver — getDecisionBoundaries()
 *   HardBoundaryEnforcer   — checkHardBoundaries(action, mcpTool?)
 *   AuthorizedActionChecker — checkAuthorizedAction(actionId, ctx)
 *
 * Public composition:
 *   composeSoulContext()   — markdown block for prompt injection
 */

import type { IntentStorage, EnforcementLogQueryOpts } from './storage.js';
import type {
  OrgIntentRecord,
  Goal,
  Signal,
  HardBoundary,
  TradeoffProfile,
  SignalReadResult,
  SignalStatus,
  EnforcementLogEntry,
  AuthorizedAction,
} from './schema.js';

export interface IntentManagerDeps {
  storage: IntentStorage;
  signalRefreshIntervalMs?: number;
}

// ─── Signal cache ─────────────────────────────────────────────────────────────

interface CachedSignal {
  result: SignalReadResult;
  fetchedAt: number;
}

// ─── Boundary check result ────────────────────────────────────────────────────

export interface BoundaryCheckResult {
  allowed: boolean;
  violated?: HardBoundary;
}

// ─── Action check result ──────────────────────────────────────────────────────

export interface ActionCheckResult {
  allowed: boolean;
  reason?: string;
  action?: AuthorizedAction;
}

// ─── IntentManager ────────────────────────────────────────────────────────────

export class IntentManager {
  private readonly storage: IntentStorage;
  private readonly signalRefreshIntervalMs: number;

  private activeIntent: OrgIntentRecord | null = null;
  private signalCache = new Map<string, CachedSignal>();
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(deps: IntentManagerDeps) {
    this.storage = deps.storage;
    this.signalRefreshIntervalMs = deps.signalRefreshIntervalMs ?? 300_000; // 5 min default
  }

  /** Load active intent and start background signal refresh. */
  async initialize(): Promise<void> {
    this.activeIntent = await this.storage.getActiveIntent();
    this._startSignalRefresh();
  }

  /** Reload the active intent from the DB (called after activation changes). */
  async reloadActiveIntent(): Promise<void> {
    this.activeIntent = await this.storage.getActiveIntent();
  }

  // ── GoalResolver ─────────────────────────────────────────────────────────────

  /**
   * Returns goals from the active intent that are currently active.
   * Filtered by `activeWhen` expression against ctx (simple key=value matching).
   * Ordered by priority ascending (1 = highest priority).
   */
  resolveActiveGoals(ctx: Record<string, string> = {}): Goal[] {
    if (!this.activeIntent) return [];
    const goals = this.activeIntent.goals ?? [];
    return goals
      .filter((g) => this._evalActiveWhen(g.activeWhen, ctx))
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Evaluates an `activeWhen` expression against ctx.
   * Supports simple "key=value" conjunctions separated by " AND ".
   * An undefined/empty expression always returns true.
   */
  private _evalActiveWhen(expr: string | undefined, ctx: Record<string, string>): boolean {
    if (!expr || expr.trim() === '') return true;
    const clauses = expr.split(/\s+AND\s+/i);
    return clauses.every((clause) => {
      const [key, val] = clause.split('=').map((s) => s.trim());
      if (!key) return true;
      if (!val) return key in ctx;
      return ctx[key] === val;
    });
  }

  // ── SignalMonitor ─────────────────────────────────────────────────────────────

  /**
   * Returns the cached signal read result, refreshing if stale.
   * Value resolution delegates to the data source connection string.
   * For this phase we attempt an HTTP GET to the connection URL and parse a
   * JSON numeric field; MCP tool dispatch is a future enhancement.
   */
  async readSignal(signalId: string): Promise<SignalReadResult | null> {
    const intent = this.activeIntent;
    if (!intent) return null;

    const signal = intent.signals?.find((s) => s.id === signalId);
    if (!signal) return null;

    const cached = this.signalCache.get(signalId);
    if (cached && Date.now() - cached.fetchedAt < this.signalRefreshIntervalMs) {
      return cached.result;
    }

    const result = await this._fetchSignalValue(signal, intent);
    this.signalCache.set(signalId, { result, fetchedAt: Date.now() });
    return result;
  }

  /** Fetch a numeric value for the signal from its first data source. */
  private async _fetchSignalValue(
    signal: Signal,
    intent: OrgIntentRecord
  ): Promise<SignalReadResult> {
    let value: number | null = null;

    const sourceId = signal.dataSources?.[0];
    if (sourceId) {
      const ds = intent.dataSources?.find((d) => d.id === sourceId);
      if (ds && ds.type === 'http') {
        try {
          const resp = await fetch(ds.connection, { signal: AbortSignal.timeout(10_000) });
          if (resp.ok) {
            const body = await resp.json() as unknown;
            // Accept numeric root value or { value: number }
            if (typeof body === 'number') {
              value = body;
            } else if (
              typeof body === 'object' &&
              body !== null &&
              'value' in body &&
              typeof (body as Record<string, unknown>).value === 'number'
            ) {
              value = (body as { value: number }).value;
            }
          }
        } catch {
          // Network error — leave value null
        }
      }
    }

    return this._buildSignalResult(signal, value);
  }

  private _buildSignalResult(signal: Signal, value: number | null): SignalReadResult {
    let status: SignalStatus = 'healthy';
    let message = '';

    if (value !== null) {
      const isBad =
        signal.direction === 'above' ? value > signal.threshold : value < signal.threshold;
      const isWarning =
        signal.warningThreshold !== undefined
          ? signal.direction === 'above'
            ? value > signal.warningThreshold
            : value < signal.warningThreshold
          : false;

      if (isBad) {
        status = 'critical';
        message = `${signal.name} is ${signal.direction === 'above' ? 'above' : 'below'} threshold (${value} vs ${signal.threshold})`;
      } else if (isWarning) {
        status = 'warning';
        message = `${signal.name} is approaching threshold (${value} vs ${signal.warningThreshold})`;
      } else {
        message = `${signal.name} is healthy (${value})`;
      }
    } else {
      message = `${signal.name} value unavailable`;
    }

    return {
      signalId: signal.id,
      value,
      threshold: signal.threshold,
      direction: signal.direction,
      status,
      message,
    };
  }

  private _startSignalRefresh(): void {
    if (this.refreshTimer) return;
    this.refreshTimer = setInterval(async () => {
      const intent = this.activeIntent;
      if (!intent?.signals?.length) return;
      for (const signal of intent.signals) {
        try {
          const result = await this._fetchSignalValue(signal, intent);
          this.signalCache.set(signal.id, { result, fetchedAt: Date.now() });
        } catch {
          // Non-fatal
        }
      }
    }, this.signalRefreshIntervalMs);
    this.refreshTimer.unref?.();
  }

  // ── TradeoffResolver ──────────────────────────────────────────────────────────

  resolveTradeoffProfile(overrides?: Partial<TradeoffProfile>): TradeoffProfile | null {
    if (!this.activeIntent) return null;
    const profiles = this.activeIntent.tradeoffProfiles ?? [];
    const def = profiles.find((p) => p.isDefault) ?? profiles[0];
    if (!def) return null;
    if (!overrides) return def;
    return { ...def, ...overrides };
  }

  // ── DelegationFrameworkResolver ───────────────────────────────────────────────

  getDecisionBoundaries(): string[] {
    if (!this.activeIntent) return [];
    const tenants = this.activeIntent.delegationFramework?.tenants ?? [];
    const boundaries: string[] = [];
    for (const tenant of tenants) {
      boundaries.push(`[${tenant.id}] ${tenant.principle}`);
      for (const b of tenant.decisionBoundaries) {
        boundaries.push(`  - ${b}`);
      }
    }
    return boundaries;
  }

  // ── HardBoundaryEnforcer ──────────────────────────────────────────────────────

  async checkHardBoundaries(
    actionDescription: string,
    mcpTool?: string
  ): Promise<BoundaryCheckResult> {
    if (!this.activeIntent) return { allowed: true };

    const boundaries = this.activeIntent.hardBoundaries ?? [];
    for (const boundary of boundaries) {
      const violated = this._matchesBoundary(boundary.rule, actionDescription, mcpTool);
      if (violated) {
        await this.storage.logEnforcement({
          eventType: 'boundary_violated',
          itemId: boundary.id,
          rule: boundary.rule,
          rationale: boundary.rationale,
          actionAttempted: actionDescription,
        });
        return { allowed: false, violated: boundary };
      }
    }
    return { allowed: true };
  }

  /**
   * Simple substring matching for hard boundary rules.
   * Rules prefixed with "deny:" match if the action description contains the rest.
   * Rules prefixed with "tool:" match if the mcpTool name contains the rest.
   */
  private _matchesBoundary(
    rule: string,
    actionDescription: string,
    mcpTool?: string
  ): boolean {
    const lower = rule.toLowerCase().trim();
    if (lower.startsWith('deny:')) {
      const term = lower.slice(5).trim();
      return actionDescription.toLowerCase().includes(term);
    }
    if (lower.startsWith('tool:') && mcpTool) {
      const term = lower.slice(5).trim();
      return mcpTool.toLowerCase().includes(term);
    }
    // Bare rule: substring match against action description
    return actionDescription.toLowerCase().includes(lower);
  }

  // ── AuthorizedActionChecker ───────────────────────────────────────────────────

  async checkAuthorizedAction(
    actionId: string,
    ctx: { role?: string; goalId?: string } = {}
  ): Promise<ActionCheckResult> {
    if (!this.activeIntent) return { allowed: true };

    const actions = this.activeIntent.authorizedActions ?? [];
    const action = actions.find((a) => a.id === actionId);

    if (!action) {
      return { allowed: false, reason: `Action '${actionId}' is not in the authorized actions list` };
    }

    if (action.requiredRole && ctx.role && action.requiredRole !== ctx.role) {
      await this.storage.logEnforcement({
        eventType: 'action_blocked',
        itemId: actionId,
        rule: `requiredRole:${action.requiredRole}`,
        rationale: `Role '${ctx.role}' is not authorized; requires '${action.requiredRole}'`,
        actionAttempted: actionId,
      });
      return {
        allowed: false,
        reason: `Requires role '${action.requiredRole}'`,
        action,
      };
    }

    if (ctx.goalId && action.appliesToGoals.length > 0) {
      if (!action.appliesToGoals.includes(ctx.goalId)) {
        return {
          allowed: false,
          reason: `Action '${actionId}' does not apply to goal '${ctx.goalId}'`,
          action,
        };
      }
    }

    return { allowed: true, action };
  }

  // ── Enforcement log passthrough ───────────────────────────────────────────────

  async logEnforcement(entry: EnforcementLogEntry): Promise<void> {
    await this.storage.logEnforcement(entry);
  }

  async queryEnforcementLog(opts: EnforcementLogQueryOpts): Promise<EnforcementLogEntry[]> {
    return this.storage.queryEnforcementLog(opts);
  }

  // ── composeSoulContext ────────────────────────────────────────────────────────

  /**
   * Assembles the intent blocks for prompt injection into the soul prompt.
   * Returns null when no active intent is configured.
   */
  async composeSoulContext(): Promise<string | null> {
    const intent = this.activeIntent;
    if (!intent) return null;

    const sections: string[] = [];

    // Organizational Goals
    const goals = this.resolveActiveGoals();
    if (goals.length > 0) {
      const lines = ['## Organizational Goals'];
      for (const goal of goals) {
        lines.push(`\n### ${goal.name} (priority ${goal.priority})`);
        if (goal.description) lines.push(goal.description);
        if (goal.successCriteria) lines.push(`Success criteria: ${goal.successCriteria}`);

        // Signal status summary for this goal
        const signalIds = goal.signals ?? [];
        if (signalIds.length > 0) {
          const signalLines: string[] = [];
          for (const sigId of signalIds) {
            const result = await this.readSignal(sigId);
            if (result) {
              signalLines.push(`  - ${result.message} [${result.status}]`);
            }
          }
          if (signalLines.length > 0) {
            lines.push('Signals:');
            lines.push(...signalLines);
          }
        }
      }
      sections.push(lines.join('\n'));
    }

    // Organizational Context (flat KV)
    const ctxItems = intent.context ?? [];
    if (ctxItems.length > 0) {
      const lines = ['## Organizational Context'];
      for (const item of ctxItems) {
        lines.push(`${item.key}: ${item.value}`);
      }
      sections.push(lines.join('\n'));
    }

    // Trade-off Profile
    const profile = this.resolveTradeoffProfile();
    if (profile) {
      const speed = Math.round(profile.speedVsThoroughness * 100);
      const quality = Math.round(profile.costVsQuality * 100);
      const confirmation = Math.round(profile.autonomyVsConfirmation * 100);
      const lines = [
        '## Trade-off Profile',
        `Active profile: **${profile.name}**`,
        `- Speed vs Thoroughness: ${speed}% thoroughness preference`,
        `- Cost vs Quality: ${quality}% quality preference`,
        `- Autonomy vs Confirmation: ${confirmation}% confirmation preference`,
      ];
      if (profile.notes) lines.push(profile.notes);
      sections.push(lines.join('\n'));
    }

    // Decision Boundaries
    const boundaries = this.getDecisionBoundaries();
    if (boundaries.length > 0) {
      sections.push('## Decision Boundaries\n' + boundaries.join('\n'));
    }

    if (sections.length === 0) return null;
    return sections.join('\n\n');
  }

  // ── Storage passthrough ───────────────────────────────────────────────────────

  getStorage(): IntentStorage {
    return this.storage;
  }

  getActiveIntent(): OrgIntentRecord | null {
    return this.activeIntent;
  }

  /** Stop background timers (called on shutdown). */
  destroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
}
