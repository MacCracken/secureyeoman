/**
 * ProactiveManager — Core orchestrator for the proactive assistance system.
 *
 * Manages triggers, evaluates conditions, queues suggestions, and executes actions.
 */

import type {
  ProactiveTrigger,
  ProactiveTriggerCreate,
  Suggestion,
  ProactiveAction,
  ProactiveConfig,
} from '@friday/shared';
import type { ProactiveManagerDeps, ActionResult } from './types.js';
import type { ProactiveStorage } from './storage.js';
import type { PatternLearner } from './pattern-learner.js';
import { BUILTIN_TRIGGERS } from './builtin-triggers.js';
import {
  executeMessageAction,
  executeWebhookAction,
  executeRemindAction,
  executeExecuteAction,
  executeLearnAction,
} from './action-handlers.js';

export class ProactiveManager {
  private readonly storage: ProactiveStorage;
  private readonly deps: ProactiveManagerDeps;
  private readonly config: ProactiveConfig;
  private readonly patternLearner: PatternLearner;
  private scheduleTimers = new Map<string, NodeJS.Timeout>();
  private expiryTimer: NodeJS.Timeout | null = null;
  private initialized = false;

  constructor(
    storage: ProactiveStorage,
    deps: ProactiveManagerDeps,
    config: ProactiveConfig,
    patternLearner: PatternLearner
  ) {
    this.storage = storage;
    this.deps = deps;
    this.config = config;
    this.patternLearner = patternLearner;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.storage.ensureTables();

    // Register built-in triggers
    for (const builtin of BUILTIN_TRIGGERS) {
      await this.storage.createBuiltinTrigger(builtin);
    }

    // Load and wire up enabled triggers
    const triggers = await this.storage.listTriggers({ enabled: true });
    for (const trigger of triggers) {
      this.wireScheduleTrigger(trigger);
    }

    // Start expired suggestion cleanup
    this.expiryTimer = setInterval(() => {
      void this.storage.deleteExpiredSuggestions().catch((err: unknown) => {
        this.deps.logger.warn('Failed to clean expired suggestions', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, 60000);
    this.expiryTimer.unref();

    this.initialized = true;
    this.deps.logger.info('ProactiveManager initialized', {
      triggers: triggers.length,
      builtins: BUILTIN_TRIGGERS.length,
    });
  }

  // ── Trigger CRUD ────────────────────────────────────────────────

  async listTriggers(filter?: { type?: string; enabled?: boolean }): Promise<ProactiveTrigger[]> {
    return this.storage.listTriggers(filter);
  }

  async getTrigger(id: string): Promise<ProactiveTrigger | null> {
    return this.storage.getTrigger(id);
  }

  async createTrigger(data: ProactiveTriggerCreate): Promise<ProactiveTrigger> {
    const count = (await this.storage.listTriggers()).length;
    if (count >= this.config.limits.maxTriggers) {
      throw new Error(`Maximum trigger limit (${this.config.limits.maxTriggers}) reached`);
    }

    const trigger = await this.storage.createTrigger(data);
    if (trigger.enabled) {
      this.wireScheduleTrigger(trigger);
    }
    return trigger;
  }

  async updateTrigger(
    id: string,
    data: Partial<ProactiveTriggerCreate>
  ): Promise<ProactiveTrigger | null> {
    const trigger = await this.storage.updateTrigger(id, data);
    if (trigger) {
      this.unwireScheduleTrigger(id);
      if (trigger.enabled) {
        this.wireScheduleTrigger(trigger);
      }
    }
    return trigger;
  }

  async deleteTrigger(id: string): Promise<boolean> {
    this.unwireScheduleTrigger(id);
    return this.storage.deleteTrigger(id);
  }

  async enableTrigger(id: string): Promise<ProactiveTrigger | null> {
    const trigger = await this.storage.setTriggerEnabled(id, true);
    if (trigger) this.wireScheduleTrigger(trigger);
    return trigger;
  }

  async disableTrigger(id: string): Promise<ProactiveTrigger | null> {
    this.unwireScheduleTrigger(id);
    return this.storage.setTriggerEnabled(id, false);
  }

  // ── Built-in triggers ───────────────────────────────────────────

  getBuiltinTriggers(): ProactiveTrigger[] {
    return [...BUILTIN_TRIGGERS];
  }

  async enableBuiltinTrigger(id: string): Promise<ProactiveTrigger | null> {
    return this.enableTrigger(id);
  }

  // ── Trigger firing ──────────────────────────────────────────────

  async fireTrigger(
    triggerId: string,
    context?: Record<string, unknown>
  ): Promise<{ suggestion?: Suggestion; result?: ActionResult }> {
    const trigger = await this.storage.getTrigger(triggerId);
    if (!trigger || !trigger.enabled) {
      return {};
    }

    // Cooldown check
    if (trigger.cooldownMs > 0 && (trigger as any).lastFiredAt) {
      const elapsed = Date.now() - (trigger as any).lastFiredAt;
      if (elapsed < trigger.cooldownMs) {
        this.deps.logger.debug('Trigger skipped (cooldown)', {
          triggerId,
          elapsed,
          cooldownMs: trigger.cooldownMs,
        });
        return {};
      }
    }

    // Daily limit check
    if (trigger.limitPerDay > 0) {
      const dailyCount = await this.storage.getDailyFiringCount(triggerId);
      if (dailyCount >= trigger.limitPerDay) {
        this.deps.logger.debug('Trigger skipped (daily limit)', {
          triggerId,
          dailyCount,
          limitPerDay: trigger.limitPerDay,
        });
        return {};
      }
    }

    // Record firing
    await this.storage.recordFiring(triggerId);

    const approvalMode = trigger.approvalMode ?? this.config.defaultApprovalMode;

    if (approvalMode === 'auto') {
      const result = await this.executeAction(trigger.action);
      return { result };
    }

    // Queue as suggestion
    const suggestion = await this.queueSuggestion(trigger, context);
    return { suggestion };
  }

  async testTrigger(triggerId: string): Promise<ActionResult> {
    const trigger = await this.storage.getTrigger(triggerId);
    if (!trigger) {
      return { success: false, message: 'Trigger not found' };
    }
    return this.executeAction(trigger.action);
  }

  // ── Suggestion lifecycle ────────────────────────────────────────

  async listSuggestions(filter?: {
    status?: 'pending' | 'approved' | 'dismissed' | 'executed' | 'expired';
    triggerId?: string;
    limit?: number;
    offset?: number;
  }) {
    return this.storage.listSuggestions(filter);
  }

  async approveSuggestion(id: string): Promise<ActionResult> {
    const suggestion = await this.storage.getSuggestion(id);
    if (suggestion?.status !== 'pending') {
      return { success: false, message: 'Suggestion not found or not pending' };
    }

    await this.storage.updateSuggestionStatus(id, 'approved');
    const result = await this.executeAction(suggestion.action);
    await this.storage.updateSuggestionStatus(id, 'executed', { actionResult: result });
    return result;
  }

  async dismissSuggestion(id: string): Promise<boolean> {
    const suggestion = await this.storage.getSuggestion(id);
    if (suggestion?.status !== 'pending') return false;
    await this.storage.updateSuggestionStatus(id, 'dismissed');
    return true;
  }

  async clearExpiredSuggestions(): Promise<number> {
    return this.storage.deleteExpiredSuggestions();
  }

  // ── Pattern learning ────────────────────────────────────────────

  async detectPatterns() {
    return this.patternLearner.detectPatterns(this.config.learning.lookbackDays);
  }

  async convertPatternToTrigger(patternId: string): Promise<ProactiveTrigger | null> {
    const patterns = await this.patternLearner.detectPatterns();
    const pattern = patterns.find((p) => p.id === patternId);
    if (!pattern) return null;

    const triggerData = this.patternLearner.convertToTrigger(pattern);
    return this.createTrigger(triggerData);
  }

  // ── Status ──────────────────────────────────────────────────────

  async getStatus() {
    const triggers = await this.storage.listTriggers();
    const { total: pendingSuggestions } = await this.storage.listSuggestions({
      status: 'pending',
      limit: 0,
    });
    const patterns = await this.patternLearner.detectPatterns(this.config.learning.lookbackDays);

    return {
      initialized: this.initialized,
      enabled: this.config.enabled,
      triggers: {
        total: triggers.length,
        enabled: triggers.filter((t) => t.enabled).length,
        byType: {
          schedule: triggers.filter((t) => t.type === 'schedule').length,
          event: triggers.filter((t) => t.type === 'event').length,
          pattern: triggers.filter((t) => t.type === 'pattern').length,
          webhook: triggers.filter((t) => t.type === 'webhook').length,
          llm: triggers.filter((t) => t.type === 'llm').length,
        },
      },
      suggestions: { pending: pendingSuggestions },
      patterns: { detected: patterns.length },
      config: {
        defaultApprovalMode: this.config.defaultApprovalMode,
        maxQueueSize: this.config.maxQueueSize,
        learningEnabled: this.config.learning.enabled,
      },
    };
  }

  // ── Cleanup ─────────────────────────────────────────────────────

  close(): void {
    for (const timer of this.scheduleTimers.values()) {
      clearInterval(timer);
    }
    this.scheduleTimers.clear();

    if (this.expiryTimer) {
      clearInterval(this.expiryTimer);
      this.expiryTimer = null;
    }

    this.initialized = false;
    this.deps.logger.info('ProactiveManager closed');
  }

  // ── Private helpers ─────────────────────────────────────────────

  private async executeAction(action: ProactiveAction): Promise<ActionResult> {
    switch (action.type) {
      case 'message':
        return executeMessageAction(action, this.deps);
      case 'webhook':
        return executeWebhookAction(action, this.deps);
      case 'remind':
        return executeRemindAction(action, this.deps);
      case 'execute':
        return executeExecuteAction(action, this.deps);
      case 'learn':
        return executeLearnAction(action, this.deps);
      default:
        return { success: false, message: `Unknown action type: ${(action as any).type}` };
    }
  }

  private async queueSuggestion(
    trigger: ProactiveTrigger,
    context?: Record<string, unknown>
  ): Promise<Suggestion> {
    const expiresAt = new Date(Date.now() + this.config.autoDismissAfterMs);

    const suggestion = await this.storage.createSuggestion({
      triggerId: trigger.id,
      triggerName: trigger.name,
      action: trigger.action,
      context,
      confidence: 1,
      expiresAt,
    });

    // Broadcast to WebSocket subscribers
    this.deps.broadcast?.('proactive', {
      type: 'new_suggestion',
      suggestion,
    });

    return suggestion;
  }

  private wireScheduleTrigger(trigger: ProactiveTrigger): void {
    if (trigger.type !== 'schedule') return;

    // Parse cron to determine interval (simplified — real cron parsing would use a library)
    // For now, use a 60-second check interval and evaluate at each tick
    const timer = setInterval(() => {
      void this.evaluateScheduleTrigger(trigger).catch((err: unknown) => {
        this.deps.logger.warn('Schedule trigger evaluation failed', {
          triggerId: trigger.id,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, 60000);
    timer.unref();

    this.scheduleTimers.set(trigger.id, timer);
  }

  private unwireScheduleTrigger(id: string): void {
    const timer = this.scheduleTimers.get(id);
    if (timer) {
      clearInterval(timer);
      this.scheduleTimers.delete(id);
    }
  }

  private async evaluateScheduleTrigger(trigger: ProactiveTrigger): Promise<void> {
    if (trigger.condition.type !== 'schedule') return;

    const now = new Date();
    const cron = trigger.condition.cron;

    // Simple cron matching: "minute hour dayOfMonth month dayOfWeek"
    const parts = cron.split(/\s+/);
    if (parts.length < 5) return;

    const [minute, hour, , , dayOfWeek] = parts;

    const matchesMinute = minute === '*' || parseInt(minute!) === now.getMinutes();
    const matchesHour = hour === '*' || parseInt(hour!) === now.getHours();
    const matchesDow =
      dayOfWeek === '*' ||
      dayOfWeek!.split(',').some((d) => {
        if (d.includes('-')) {
          const [start, end] = d.split('-').map(Number);
          const dow = now.getDay() === 0 ? 7 : now.getDay();
          return dow >= start! && dow <= end!;
        }
        return parseInt(d) === (now.getDay() === 0 ? 7 : now.getDay());
      });

    if (matchesMinute && matchesHour && matchesDow) {
      await this.fireTrigger(trigger.id, { scheduledAt: now.toISOString() });
    }
  }
}
