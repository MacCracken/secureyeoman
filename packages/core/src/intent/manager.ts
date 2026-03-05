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

import type { IntentStorage, EnforcementLogQueryOpts, GoalSnapshotRecord } from './storage.js';
import type {
  OrgIntentRecord,
  Goal,
  Signal,
  HardBoundary,
  Policy,
  TradeoffProfile,
  SignalReadResult,
  SignalStatus,
  EnforcementLogEntry,
  AuthorizedAction,
} from './schema.js';
import { OpaClient } from './opa-client.js';
import { evalCel } from './cel-evaluator.js';

// ── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_SIGNAL_REFRESH_INTERVAL_MS = 300_000; // 5 min
const HTTP_SIGNAL_TIMEOUT_MS = 10_000;

export interface IntentManagerDeps {
  storage: IntentStorage;
  signalRefreshIntervalMs?: number;
  /** OPA address from config (intent.opaAddr). Passed to OpaClient.fromEnv() for centralized config. */
  opaAddr?: string;
  /**
   * Optional OPA client override (defaults to OpaClient.fromEnv()).
   * Pass null to explicitly disable OPA even if OPA_ADDR is set (useful in tests).
   */
  opaClient?: OpaClient | null;
  /**
   * Optional callback for dispatching MCP tool calls from signal data sources.
   * When provided, mcp_tool-typed data sources will invoke this to fetch signal values.
   * The callback receives the tool name (ds.connection) and an optional input object.
   * It should return a numeric value or null on failure.
   */
  callMcpTool?: (toolName: string, input?: Record<string, unknown>) => Promise<number | null>;
  /**
   * Lazy getter for DepartmentRiskManager. When provided, enforcement log entries
   * for boundary_violated / policy_block with a departmentId in metadata will
   * auto-create risk register entries. (Phase 111-C)
   */
  getDepartmentRiskManager?: () => {
    createRegisterEntry: (data: any, createdBy?: string, tenantId?: string) => Promise<any>;
  } | null;
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

// ─── Output compliance result (Phase 54) ─────────────────────────────────────

export interface OutputComplianceResult {
  compliant: boolean;
  reason?: string;
}

// ─── Action check result ──────────────────────────────────────────────────────

export interface ActionCheckResult {
  allowed: boolean;
  reason?: string;
  action?: AuthorizedAction;
}

// ─── Policy check result ──────────────────────────────────────────────────────

export interface PolicyCheckResult {
  action: 'allow' | 'warn' | 'block';
  violated?: Policy;
}

// ─── IntentManager ────────────────────────────────────────────────────────────

export class IntentManager {
  private readonly storage: IntentStorage;
  private readonly signalRefreshIntervalMs: number;
  private readonly opa: OpaClient | null;
  private readonly callMcpTool:
    | ((toolName: string, input?: Record<string, unknown>) => Promise<number | null>)
    | null;
  private readonly getDepartmentRiskManager: IntentManagerDeps['getDepartmentRiskManager'];

  private activeIntent: OrgIntentRecord | null = null;
  private signalCache = new Map<string, CachedSignal>();
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  /** In-memory snapshot of last-known goal active states. goalId → isActive */
  private goalSnapshot = new Map<string, boolean>();

  constructor(deps: IntentManagerDeps) {
    this.storage = deps.storage;
    this.signalRefreshIntervalMs =
      deps.signalRefreshIntervalMs ?? DEFAULT_SIGNAL_REFRESH_INTERVAL_MS;
    // opaClient: undefined → auto-detect from config/env; null → disabled; instance → use it
    this.opa =
      deps.opaClient === undefined ? OpaClient.fromEnv(deps.opaAddr) : (deps.opaClient ?? null);
    this.callMcpTool = deps.callMcpTool ?? null;
    this.getDepartmentRiskManager = deps.getDepartmentRiskManager;
  }

  /** Load active intent and start background signal refresh. */
  async initialize(): Promise<void> {
    this.activeIntent = await this.storage.getActiveIntent();
    await this._seedGoalSnapshot();
    this._startSignalRefresh();
  }

  /** Reload the active intent from the DB (called after activation changes). */
  async reloadActiveIntent(): Promise<void> {
    // Clear cached signals so stale data from the previous intent doesn't linger
    this.signalCache.clear();
    this.activeIntent = await this.storage.getActiveIntent();
    await this._diffGoals();
  }

  /**
   * Seeds the in-memory goal snapshot from the DB without firing any events.
   * Called once during initialize() so that the first refresh cycle sees the
   * correct prior state rather than treating all goals as newly activated.
   */
  private async _seedGoalSnapshot(): Promise<void> {
    const intent = this.activeIntent;
    if (!intent) return;

    const dbSnapshot = await this.storage.getGoalSnapshots(intent.id);
    const currentGoals = this.resolveActiveGoals();
    const currentActive = new Set(currentGoals.map((g) => g.id));

    // Prefer DB snapshot for goals that already have a record; fall back to
    // current evaluation for goals we have never seen before.
    for (const goal of intent.goals ?? []) {
      const dbRecord = dbSnapshot.get(goal.id);
      if (dbRecord) {
        this.goalSnapshot.set(goal.id, dbRecord.isActive);
      } else {
        // First time we've seen this goal — seed from current eval, no event.
        const isActive = currentActive.has(goal.id);
        this.goalSnapshot.set(goal.id, isActive);
        await this.storage.upsertGoalSnapshot(
          intent.id,
          goal.id,
          isActive,
          Date.now(),
          /* setActivatedAt */ isActive,
          /* setCompletedAt */ false
        );
      }
    }
  }

  /**
   * Diffs current goal evaluation against the in-memory snapshot.
   * Emits `goal_activated` or `goal_completed` enforcement log entries on
   * transitions, then updates both the in-memory snapshot and the DB record.
   */
  private async _diffGoals(ctx: Record<string, string> = {}): Promise<void> {
    const intent = this.activeIntent;
    if (!intent) return;

    const currentGoals = this.resolveActiveGoals(ctx);
    const currentActive = new Set(currentGoals.map((g) => g.id));
    const now = Date.now();

    for (const goal of intent.goals ?? []) {
      const wasActive = this.goalSnapshot.get(goal.id) ?? false;
      const isActive = currentActive.has(goal.id);

      if (wasActive === isActive) continue;

      if (!wasActive && isActive) {
        // inactive → active
        await this.storage.logEnforcement({
          eventType: 'goal_activated',
          itemId: goal.id,
          rule: goal.activeWhen ?? 'unconditional',
          rationale: goal.description || goal.name,
          metadata: { intentId: intent.id, goalName: goal.name, priority: goal.priority },
        });
        await this.storage.upsertGoalSnapshot(
          intent.id,
          goal.id,
          true,
          now,
          /* setActivatedAt */ true,
          /* setCompletedAt */ false
        );
      } else {
        // active → inactive
        const eventType = goal.completionCondition ? 'goal_completed' : undefined;
        if (eventType) {
          await this.storage.logEnforcement({
            eventType,
            itemId: goal.id,
            rule: goal.completionCondition!,
            rationale: goal.successCriteria || goal.description || goal.name,
            metadata: { intentId: intent.id, goalName: goal.name, priority: goal.priority },
          });
        }
        await this.storage.upsertGoalSnapshot(
          intent.id,
          goal.id,
          false,
          now,
          /* setActivatedAt */ false,
          /* setCompletedAt */ !!goal.completionCondition
        );
      }

      this.goalSnapshot.set(goal.id, isActive);
    }
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
   * Evaluates an `activeWhen` CEL expression against ctx.
   * Supports full CEL subset (comparisons, logical ops, grouping) plus the
   * legacy "key=value AND key=value" format for backward compatibility.
   * An undefined/empty expression always returns true (unconditional goal).
   */
  private _evalActiveWhen(expr: string | undefined, ctx: Record<string, string>): boolean {
    return evalCel(expr, ctx);
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
      if (ds) {
        if (ds.type === 'http') {
          value = await this._fetchHttpSignal(ds.connection);
        } else if (ds.type === 'mcp_tool') {
          value = await this._fetchMcpToolSignal(ds.connection, ds.schema);
        }
      }
    }

    return this._buildSignalResult(signal, value);
  }

  /** Fetch a numeric signal value via HTTP GET. */
  private async _fetchHttpSignal(url: string): Promise<number | null> {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(HTTP_SIGNAL_TIMEOUT_MS) });
      if (!resp.ok) return null;
      const body = await resp.json();
      if (typeof body === 'number') return body;
      if (
        typeof body === 'object' &&
        body !== null &&
        'value' in body &&
        typeof (body as Record<string, unknown>).value === 'number'
      ) {
        return (body as { value: number }).value;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Fetch a numeric signal value by dispatching an MCP tool call.
   * Uses the `callMcpTool` callback injected into the constructor.
   * The `schema` hint (optional) is passed as `{ schema }` in the tool input
   * so the MCP tool knows how to parse its response.
   */
  private async _fetchMcpToolSignal(toolName: string, schema?: string): Promise<number | null> {
    if (!this.callMcpTool) return null;
    try {
      const input: Record<string, unknown> = {};
      if (schema) input.schema = schema;
      return await this.callMcpTool(toolName, input);
    } catch {
      return null;
    }
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
      if (!intent) return;

      // 50 — Diff goal active states once per refresh cycle
      try {
        await this._diffGoals();
      } catch {
        // Non-fatal
      }

      // 48.2 — Refresh signal values and log degradation transitions
      for (const signal of intent.signals ?? []) {
        try {
          const prevStatus = this.signalCache.get(signal.id)?.result.status;
          const result = await this._fetchSignalValue(signal, intent);
          this.signalCache.set(signal.id, { result, fetchedAt: Date.now() });

          const isDegraded =
            (prevStatus === 'healthy' &&
              (result.status === 'warning' || result.status === 'critical')) ||
            (prevStatus === 'warning' && result.status === 'critical');
          if (isDegraded) {
            await this.storage.logEnforcement({
              eventType: 'intent_signal_degraded',
              itemId: signal.id,
              rule: `signal:${signal.id}`,
              rationale: result.message,
              metadata: { from: prevStatus, to: result.status },
            });
          }
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
      const violated = await this._matchesBoundaryWithOpa(boundary, actionDescription, mcpTool);
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
   * Checks whether a hard boundary is violated.
   * When OPA is available and the boundary has a `rego` field, evaluates via
   * OPA (`boundary_{id}/allow`). Falls back to natural-language substring
   * matching on OPA error or when OPA is not configured.
   */
  private async _matchesBoundaryWithOpa(
    boundary: HardBoundary,
    actionDescription: string,
    mcpTool?: string
  ): Promise<boolean> {
    if (this.opa && boundary.rego) {
      try {
        const result = await this.opa.evaluate(`boundary_${boundary.id}/allow`, {
          action: actionDescription,
          tool: mcpTool ?? null,
        });
        // OPA allow=false means the boundary is violated
        if (result !== null) return !result;
      } catch {
        // Fall through to natural-language matching on OPA error
      }
    }
    return this._matchesBoundary(boundary.rule, actionDescription, mcpTool);
  }

  /**
   * Simple substring matching for hard boundary rules.
   * Rules prefixed with "deny:" match if the action description contains the rest.
   * Rules prefixed with "tool:" match if the mcpTool name contains the rest.
   */
  private _matchesBoundary(rule: string, actionDescription: string, mcpTool?: string): boolean {
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
      return {
        allowed: false,
        reason: `Action '${actionId}' is not in the authorized actions list`,
      };
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

  // ── getPermittedMcpTools (48.3) ───────────────────────────────────────────────

  /**
   * Returns a Set of permitted MCP tool names derived from authorizedActions that
   * explicitly list mcpTools. Returns null when no authorized actions restrict tools
   * (i.e. no restriction mode — all tools are permitted).
   */
  getPermittedMcpTools(): Set<string> | null {
    if (!this.activeIntent) return null;
    const actions = this.activeIntent.authorizedActions ?? [];
    const restricted = actions.filter((a) => a.mcpTools && a.mcpTools.length > 0);
    if (restricted.length === 0) return null;
    const permitted = new Set<string>();
    for (const action of restricted) {
      for (const tool of action.mcpTools) {
        permitted.add(tool);
      }
    }
    return permitted;
  }

  // ── getGoalSkillSlugs (48.3) ──────────────────────────────────────────────────

  /**
   * Returns a Set of skill slugs from all currently active goals' `skills[]` arrays.
   * Used by soul/manager.ts to elevate goal-linked skills in prompt injection.
   */
  getGoalSkillSlugs(): Set<string> {
    const goals = this.resolveActiveGoals();
    const slugs = new Set<string>();
    for (const goal of goals) {
      for (const slug of goal.skills ?? []) {
        slugs.add(slug);
      }
    }
    return slugs;
  }

  // ── checkPolicies (48.5) ──────────────────────────────────────────────────────

  /**
   * Checks the action description against the active intent's `policies[]`.
   * Same natural-language matching as `checkHardBoundaries()`.
   * When OPA_ADDR env is set and the policy has a `rego` field, evaluates via OPA;
   * falls back to natural-language rule on fetch error.
   */
  async checkPolicies(actionDescription: string, mcpTool?: string): Promise<PolicyCheckResult> {
    if (!this.activeIntent) return { action: 'allow' };

    const policies = this.activeIntent.policies ?? [];
    for (const policy of policies) {
      const violated = await this._matchesPolicy(policy, actionDescription, mcpTool);
      if (!violated) continue;

      if (policy.enforcement === 'warn') {
        await this.storage.logEnforcement({
          eventType: 'policy_warn',
          itemId: policy.id,
          rule: policy.rule,
          rationale: policy.rationale,
          actionAttempted: actionDescription,
        });
        return { action: 'warn', violated: policy };
      } else {
        await this.storage.logEnforcement({
          eventType: 'policy_block',
          itemId: policy.id,
          rule: policy.rule,
          rationale: policy.rationale,
          actionAttempted: actionDescription,
        });
        return { action: 'block', violated: policy };
      }
    }
    return { action: 'allow' };
  }

  /**
   * Returns true if the policy matches the given action/tool.
   * Tries OPA first (if configured and policy has rego), then falls back to
   * the same deny:/tool: prefix substring matching as hard boundaries.
   */
  private async _matchesPolicy(
    policy: Policy,
    actionDescription: string,
    mcpTool?: string
  ): Promise<boolean> {
    if (this.opa && policy.rego) {
      try {
        const result = await this.opa.evaluate(`policy_${policy.id}/allow`, {
          action: actionDescription,
          tool: mcpTool ?? null,
        });
        // OPA allow=false means the policy matches (is violated)
        if (result !== null) return !result;
      } catch {
        // Fall through to natural-language rule on OPA error
      }
    }
    return this._matchesBoundary(policy.rule, actionDescription, mcpTool);
  }

  // ── OPA policy sync ───────────────────────────────────────────────────────────

  /**
   * Synchronises the `hardBoundaries[]` and `policies[]` from the given intent
   * record with the OPA sidecar service.
   *
   * - Any boundary/policy with a `rego` field is uploaded via `PUT /v1/policies/{id}`.
   * - Any previously-known ID that is no longer in the document is deleted via
   *   `DELETE /v1/policies/{id}`.
   *
   * No-op if OPA is not configured. Safe to call on every intent save.
   */
  async syncPoliciesWithOpa(record: OrgIntentRecord): Promise<void> {
    if (!this.opa) return;

    const toUpload: { id: string; rego: string }[] = [];

    for (const b of record.hardBoundaries ?? []) {
      if (b.rego) toUpload.push({ id: `boundary_${b.id}`, rego: b.rego });
    }
    for (const p of record.policies ?? []) {
      if (p.rego) toUpload.push({ id: `policy_${p.id}`, rego: p.rego });
    }

    // Upload output_compliance package (Phase 54)
    const outputComplianceRego = `package output_compliance
import future.keywords.if
import future.keywords.in

default allow := true
deny contains reason if {
  boundary := input.hard_boundaries[_]
  contains(lower(input.response), lower(boundary.description))
  reason := concat("", ["Response may reference restricted boundary: ", boundary.id])
}
allow := false if count(deny) > 0
`;
    toUpload.push({ id: 'output_compliance', rego: outputComplianceRego });

    // Upload all policies with rego (errors are non-fatal — logged to stderr)
    await Promise.all(
      toUpload.map(({ id, rego }) =>
        this.opa!.uploadPolicy(id, rego).catch((err: unknown) => {
          process.stderr.write(`[intent] OPA uploadPolicy(${id}) error: ${String(err)}\n`);
        })
      )
    );
  }

  /**
   * Check whether the given LLM response complies with output-side OPA policy.
   *
   * Evaluates OPA path `output_compliance/allow` with the response text and
   * active hard boundaries as input. Returns compliant:true when:
   *   - OPA is not configured
   *   - no active intent / no boundaries
   *   - OPA throws
   * Callers treat non-compliant as warn-only (never blocking).
   */
  async checkOutputCompliance(responseText: string): Promise<OutputComplianceResult> {
    if (!this.opa || !this.activeIntent) return { compliant: true };

    const hardBoundaries = (this.activeIntent.hardBoundaries ?? []).map((b) => ({
      id: b.id,
      description: b.rule,
    }));

    if (hardBoundaries.length === 0) return { compliant: true };

    try {
      const result = await this.opa.evaluate('output_compliance/allow', {
        response: responseText,
        hard_boundaries: hardBoundaries,
      });
      if (result === false) {
        return { compliant: false, reason: 'Response failed output_compliance OPA policy' };
      }
      return { compliant: true };
    } catch {
      // Fail open — OPA errors are non-fatal
      return { compliant: true };
    }
  }

  // ── Enforcement log passthrough ───────────────────────────────────────────────

  async logEnforcement(entry: EnforcementLogEntry): Promise<void> {
    await this.storage.logEnforcement(entry);

    // Phase 111-C: Auto-create risk register entry from policy violations
    if (
      (entry.eventType === 'boundary_violated' || entry.eventType === 'policy_block') &&
      entry.metadata?.departmentId &&
      this.getDepartmentRiskManager
    ) {
      const drm = this.getDepartmentRiskManager();
      if (drm) {
        drm
          .createRegisterEntry({
            departmentId: entry.metadata.departmentId as string,
            title: `[Auto] ${entry.eventType}: ${entry.rationale ?? 'Policy violation detected'}`,
            category: 'compliance',
            severity: 'medium',
            likelihood: 3,
            impact: 3,
            source: 'audit',
            sourceRef: entry.id ?? undefined,
          })
          .catch(() => {
            // fire-and-forget — logged by DepartmentRiskManager
          });
      }
    }
  }

  async queryEnforcementLog(opts: EnforcementLogQueryOpts): Promise<EnforcementLogEntry[]> {
    return this.storage.queryEnforcementLog(opts);
  }

  /**
   * Returns the lifecycle event timeline (goal_activated + goal_completed) for
   * a specific goal within an intent doc. Used by the dashboard signals tab.
   */
  async getGoalTimeline(intentId: string, goalId: string): Promise<EnforcementLogEntry[]> {
    return this.storage.getGoalTimeline(intentId, goalId);
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
