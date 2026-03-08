/**
 * HeartbeatManager — Periodic self-check system for SecureYeoman.
 *
 * Part of the Body module — the agent's vital signs and physical life-checks.
 *
 * Runs configurable checks on a per-task timer (system health, memory status,
 * log anomalies, integration health, reflective tasks) and records results as
 * episodic memories with source 'heartbeat'.
 *
 * PROACTIVE FEATURES (v2.0):
 * - Action triggers: Execute actions based on check results
 * - Webhook integration: Notify external systems
 * - Conditional scheduling: Day-of-week and active hours
 * - LLM-driven analysis: Complex pattern detection with cheap models
 */

import type { BrainManager } from '../brain/manager.js';
import type { AuditChain } from '../logging/audit-chain.js';
import type { IntegrationManager } from '../integrations/manager.js';
import type { SecureLogger } from '../logging/logger.js';
import type { HeartbeatLogStorage } from './heartbeat-log-storage.js';
import type { NotificationManager } from '../notifications/notification-manager.js';
import { runWithCorrelationId } from '../utils/correlation-context.js';
import { uuidv7 } from '../utils/crypto.js';
// Type definitions for proactive heartbeat features
// These extend the shared types with action and scheduling capabilities

type HeartbeatActionCondition = 'always' | 'on_warning' | 'on_error' | 'on_ok';
type HeartbeatActionType = 'webhook' | 'notify' | 'remember' | 'execute' | 'llm_analyze';

interface HeartbeatActionTrigger {
  condition: HeartbeatActionCondition;
  action: HeartbeatActionType;
  config: Record<string, unknown>;
}

interface HeartbeatSchedule {
  daysOfWeek?: ('mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun')[];
  activeHours?: {
    start: string; // "HH:mm" format
    end: string;
    timezone?: string;
  };
}

interface HeartbeatCheck {
  name: string;
  type:
    | 'system_health'
    | 'memory_status'
    | 'log_anomalies'
    | 'integration_health'
    | 'reflective_task'
    | 'llm_analysis'
    | 'proactive'
    | 'custom';
  enabled: boolean;
  intervalMs?: number;
  schedule?: HeartbeatSchedule;
  config: Record<string, unknown>;
  actions?: HeartbeatActionTrigger[];
}

interface HeartbeatConfig {
  enabled: boolean;
  intervalMs: number;
  defaultActions?: HeartbeatActionTrigger[];
  checks: HeartbeatCheck[];
}

export interface HeartbeatCheckResult {
  name: string;
  type: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
  data?: Record<string, unknown>;
}

export interface HeartbeatResult {
  timestamp: number;
  durationMs: number;
  checks: HeartbeatCheckResult[];
}

export class HeartbeatManager {
  private readonly brain: BrainManager;
  private readonly auditChain: AuditChain;
  private readonly integrationManager: IntegrationManager | null;
  private readonly logger: SecureLogger;
  private readonly config: HeartbeatConfig;
  private readonly logStorage: HeartbeatLogStorage | null;
  private notificationManager: NotificationManager | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private lastBeat: HeartbeatResult | null = null;
  private beatCount = 0;
  private running = false;
  private taskLastRun = new Map<string, number>();
  private actionHistory = new Map<string, number>(); // Track last action execution per check
  private activePersonalityIds: { id: string; name: string; omnipresentMind?: boolean }[] = [];
  private personalitySchedule: {
    enabled: boolean;
    start: string;
    end: string;
    daysOfWeek: string[];
    timezone: string;
  } | null = null;

  constructor(
    brain: BrainManager,
    auditChain: AuditChain,
    logger: SecureLogger,
    config: HeartbeatConfig,
    integrationManager?: IntegrationManager,
    logStorage?: HeartbeatLogStorage
  ) {
    this.brain = brain;
    this.auditChain = auditChain;
    this.logger = logger;
    this.config = config;
    this.integrationManager = integrationManager ?? null;
    this.logStorage = logStorage ?? null;
  }

  setNotificationManager(notificationManager: NotificationManager): void {
    this.notificationManager = notificationManager;
  }

  /**
   * Check if a check should run based on conditional scheduling
   */
  private shouldRunAccordingToSchedule(check: HeartbeatCheck): boolean {
    if (!check.schedule) return true;

    const now = new Date();

    // Check day of week
    if (check.schedule.daysOfWeek && check.schedule.daysOfWeek.length > 0) {
      const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
      const currentDay = days[now.getDay()];
      if (!check.schedule.daysOfWeek.includes(currentDay as any)) {
        return false;
      }
    }

    // Check active hours
    if (check.schedule.activeHours) {
      const { start, end, timezone = 'UTC' } = check.schedule.activeHours;

      // Convert to timezone (simple implementation - uses UTC for now)
      // For production, use a library like date-fns-tz
      const currentHour = now.getUTCHours();
      const currentMinute = now.getUTCMinutes();
      const startParts = start.split(':').map(Number);
      const endParts = end.split(':').map(Number);
      const startHour = startParts[0] ?? 0;
      const startMinute = startParts[1] ?? 0;
      const endHour = endParts[0] ?? 23;
      const endMinute = endParts[1] ?? 59;

      const currentTime = currentHour * 60 + currentMinute;
      const startTime = startHour * 60 + startMinute;
      const endTime = endHour * 60 + endMinute;

      if (endTime > startTime) {
        // Normal range (e.g., 09:00-17:00)
        if (currentTime < startTime || currentTime > endTime) {
          return false;
        }
      } else {
        // Overnight range (e.g., 22:00-06:00)
        if (currentTime < startTime && currentTime > endTime) {
          return false;
        }
      }
    }

    return true;
  }

  private isWithinPersonalityActiveHours(): boolean {
    if (!this.personalitySchedule?.enabled) return true;
    const { start, end, daysOfWeek } = this.personalitySchedule;
    const now = new Date();
    if (daysOfWeek.length > 0) {
      const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
      if (!daysOfWeek.includes(days[now.getUTCDay()]!)) return false;
    }
    const cur = now.getUTCHours() * 60 + now.getUTCMinutes();
    const [sh = 0, sm = 0] = start.split(':').map(Number);
    const [eh = 23, em = 59] = end.split(':').map(Number);
    const s = sh * 60 + sm;
    const e = eh * 60 + em;
    return e > s ? cur >= s && cur <= e : cur >= s || cur <= e; // overnight range
  }

  /**
   * Execute action triggers based on check result
   */
  private async executeActions(check: HeartbeatCheck, result: HeartbeatCheckResult): Promise<void> {
    // Merge check-specific actions with default actions
    const defaultActions = this.config.defaultActions || [];
    const checkActions = check.actions || [];
    const allActions = [...defaultActions, ...checkActions];

    if (allActions.length === 0) return;

    for (const trigger of allActions) {
      // Check if condition matches
      if (!this.conditionMatches(trigger.condition, result.status)) {
        continue;
      }

      // Execute the action
      try {
        await this.executeAction(trigger, check, result);
      } catch (err) {
        this.logger.error(
          {
            check: check.name,
            action: trigger.action,
            error: err instanceof Error ? err.message : 'Unknown error',
          },
          'Action execution failed'
        );
      }
    }
  }

  /**
   * Check if trigger condition matches the result status
   */
  private conditionMatches(
    condition: HeartbeatActionCondition,
    status: 'ok' | 'warning' | 'error'
  ): boolean {
    switch (condition) {
      case 'always':
        return true;
      case 'on_ok':
        return status === 'ok';
      case 'on_warning':
        return status === 'warning';
      case 'on_error':
        return status === 'error';
      default:
        return false;
    }
  }

  /**
   * Execute a single action based on its type
   */
  private async executeAction(
    trigger: HeartbeatActionTrigger,
    check: HeartbeatCheck,
    result: HeartbeatCheckResult
  ): Promise<void> {
    const config = trigger.config;

    switch (trigger.action) {
      case 'webhook':
        await this.executeWebhookAction(config, check, result);
        break;
      case 'notify':
        await this.executeNotifyAction(config, check, result);
        break;
      case 'remember':
        await this.executeRememberAction(config, check, result);
        break;
      case 'execute':
        await this.executeCommandAction(config, check, result);
        break;
      case 'llm_analyze':
        await this.executeLLMAnalyzeAction(config, check, result);
        break;
      default:
        this.logger.warn({ action: trigger.action }, 'Unknown action type');
    }
  }

  /**
   * Execute webhook action
   */
  private async executeWebhookAction(
    config: Record<string, unknown>,
    check: HeartbeatCheck,
    result: HeartbeatCheckResult
  ): Promise<void> {
    const url = config.url as string;
    const method = (config.method as string) || 'POST';
    const headers = (config.headers as Record<string, string>) || {};
    const timeoutMs = (config.timeoutMs as number) || 30000;
    const retryCount = (config.retryCount as number) || 2;
    const retryDelayMs = (config.retryDelayMs as number) || 1000;

    const payload = {
      check: {
        name: check.name,
        type: check.type,
      },
      result: {
        status: result.status,
        message: result.message,
        data: result.data,
        timestamp: Date.now(),
      },
      source: 'friday-heartbeat',
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retryCount; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          controller.abort();
        }, timeoutMs);

        const response = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        this.logger.info(
          {
            check: check.name,
            url,
            attempt: attempt + 1,
          },
          'Webhook executed successfully'
        );
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt < retryCount) {
          this.logger.warn(
            {
              check: check.name,
              attempt: attempt + 1,
              error: lastError.message,
            },
            'Webhook failed, retrying'
          );
          await this.sleep(retryDelayMs * (attempt + 1)); // Exponential backoff
        }
      }
    }

    throw lastError || new Error('Webhook failed after retries');
  }

  /**
   * Execute notification action
   */
  private async executeNotifyAction(
    config: Record<string, unknown>,
    check: HeartbeatCheck,
    result: HeartbeatCheckResult
  ): Promise<void> {
    const channel = config.channel as string;
    const recipients = (config.recipients as string[]) || [];
    const messageTemplate =
      (config.messageTemplate as string) ||
      `Heartbeat check "${check.name}" returned ${result.status}: ${result.message}`;

    const message = messageTemplate
      .replace('{{check.name}}', check.name)
      .replace('{{check.type}}', check.type)
      .replace('{{result.status}}', result.status)
      .replace('{{result.message}}', result.message);

    // Always persist as an in-app notification (creates a DB record + WS broadcast)
    const notifLevel =
      result.status === 'error' ? 'error' : result.status === 'warning' ? 'warn' : 'info';
    void this.notificationManager
      ?.notify({
        type: 'heartbeat_alert',
        title: check.name,
        body: message,
        level: notifLevel,
        source: 'heartbeat',
        metadata: { checkType: check.type, status: result.status },
      })
      .catch((err: unknown) => {
        this.logger.warn(
          {
            check: check.name,
            error: err instanceof Error ? err.message : 'Unknown error',
          },
          'Failed to persist heartbeat notification'
        );
      });

    // Console notification (always available)
    if (channel === 'console') {
      this.logger.info({ message, check: check.name, result: result.status }, '[HEARTBEAT ALERT]');
      return;
    }

    // Integration-based notifications
    if (!this.integrationManager) {
      this.logger.warn(
        {
          channel,
          check: check.name,
        },
        'Integration manager not available for notification'
      );
      return;
    }

    // Route to appropriate integration via real adapter dispatch (Phase 55)
    const integrationId = config.integrationId as string | undefined;
    const metadata: Record<string, unknown> = channel === 'email' ? { subject: check.name } : {};

    let adapters: import('../integrations/types.js').Integration[];
    if (integrationId) {
      const adapter = this.integrationManager.getAdapter(integrationId);
      adapters = adapter ? [adapter] : [];
    } else {
      adapters = this.integrationManager.getAdaptersByPlatform(channel);
    }

    if (adapters.length === 0) {
      this.logger.warn(
        {
          channel,
          integrationId,
          check: check.name,
        },
        'No running adapters found for notification channel'
      );
      return;
    }

    for (const adapter of adapters) {
      for (const recipient of recipients) {
        try {
          await adapter.sendMessage(recipient, message, metadata);
          await this.auditChain.record({
            event: 'notification_dispatched',
            level: 'info',
            message: `Heartbeat notification dispatched via ${channel}`,
            metadata: { check: check.name, channel, recipient },
          });
        } catch (err) {
          this.logger.warn(
            {
              check: check.name,
              channel,
              recipient,
              error: err instanceof Error ? err.message : String(err),
            },
            'Heartbeat notification dispatch failed'
          );
          await this.auditChain.record({
            event: 'notification_dispatch_failed',
            level: 'warn',
            message: `Heartbeat notification dispatch failed via ${channel}`,
            metadata: {
              check: check.name,
              channel,
              recipient,
              error: err instanceof Error ? err.message : String(err),
            },
          });
        }
      }
    }
  }

  /**
   * Execute remember action
   */
  private async executeRememberAction(
    config: Record<string, unknown>,
    check: HeartbeatCheck,
    result: HeartbeatCheckResult
  ): Promise<void> {
    const importance = (config.importance as number) || 0.5;
    const category = (config.category as string) || 'heartbeat_alert';
    const memoryType = (config.memoryType as 'episodic' | 'semantic') || 'episodic';

    const content = `Heartbeat alert from "${check.name}": ${result.status} - ${result.message}`;

    await this.brain.remember(
      memoryType,
      content,
      category,
      {
        checkName: check.name,
        checkType: check.type,
        resultStatus: result.status,
        resultData: result.data ? JSON.stringify(result.data) : '',
      },
      importance
    );

    this.logger.info(
      {
        check: check.name,
        category,
        importance,
      },
      'Memory recorded from heartbeat action'
    );
  }

  /**
   * Execute command action
   */
  private async executeCommandAction(
    config: Record<string, unknown>,
    check: HeartbeatCheck,
    result: HeartbeatCheckResult
  ): Promise<void> {
    // Command execution would require careful security review
    // For now, log that it would be executed
    const command = config.command as string;
    const args = (config.args as string[]) || [];

    this.logger.warn(
      {
        check: check.name,
        command,
        args,
        result: result.status,
      },
      'Command execution action is not implemented'
    );
    throw new Error(
      'Command execution action is not implemented — enable sandbox execution via the execution config'
    );
  }

  /**
   * Execute LLM analysis action
   */
  private async executeLLMAnalyzeAction(
    config: Record<string, unknown>,
    check: HeartbeatCheck,
    result: HeartbeatCheckResult
  ): Promise<void> {
    // LLM analysis requires AI provider integration
    // For now, log that it would be executed
    const prompt = (config?.prompt as string) ?? '';
    const model = config?.model as string | undefined;
    const maxTokens = (config?.maxTokens as number) || 500;

    this.logger.warn(
      {
        check: check.name,
        model: model || 'default',
        maxTokens,
        promptLength: prompt?.length,
      },
      'LLM analysis action is not implemented'
    );
    throw new Error(
      'LLM analysis action is not implemented — heartbeat LLM actions require an AI client integration'
    );
  }

  /**
   * Utility: Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Hydrate taskLastRun from persisted log entries so that "last run" timestamps
   * survive process restarts. Should be awaited before calling start().
   */
  async initialize(): Promise<void> {
    if (!this.logStorage) return;
    for (const check of this.config.checks) {
      try {
        const { entries } = await this.logStorage.list({ checkName: check.name, limit: 1 });
        if (entries[0]) {
          this.taskLastRun.set(check.name, entries[0].ranAt);
        }
      } catch {
        // Non-fatal — taskLastRun stays empty for this check
      }
    }
    this.logger.debug(
      {
        checks: this.config.checks.length,
      },
      'Heartbeat task times hydrated from log'
    );
  }

  start(): void {
    if (!this.config.enabled || this.running) return;

    this.running = true;
    this.interval = setInterval(() => {
      runWithCorrelationId(uuidv7(), () => {
        void this.beat().catch((err: unknown) => {
          this.logger.error(
            {
              error: err instanceof Error ? err.message : 'Unknown error',
            },
            'Heartbeat failed'
          );
        });
      });
    }, this.config.intervalMs);

    this.logger.info({ intervalMs: this.config.intervalMs }, 'Heartbeat started');
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.running = false;
    this.logger.info('Heartbeat stopped');
  }

  setActivePersonalityId(id: string | null): void {
    this.activePersonalityIds = id ? [{ id, name: '', omnipresentMind: false }] : [];
    this.logger.debug({ personalityId: id }, 'Active personality ID updated');
  }

  setActivePersonalityIds(
    personalities: { id: string; name: string; omnipresentMind?: boolean }[]
  ): void {
    this.activePersonalityIds = personalities;
    this.logger.debug({ count: personalities.length }, 'Active personality roster updated');
  }

  setPersonalitySchedule(
    schedule: {
      enabled: boolean;
      start: string;
      end: string;
      daysOfWeek: string[];
      timezone: string;
    } | null
  ): void {
    this.personalitySchedule = schedule;
    this.logger.debug({ schedule }, 'Personality active hours updated');
  }

  async beat(): Promise<HeartbeatResult> {
    const start = Date.now();

    if (!this.isWithinPersonalityActiveHours()) {
      this.logger.debug('Heartbeat suppressed — personality is at rest (outside active hours)');
      return { timestamp: start, durationMs: Date.now() - start, checks: [] };
    }

    const checks: HeartbeatCheckResult[] = [];

    const enabledChecks = this.config.checks.filter((c) => c.enabled);
    const dueChecks = enabledChecks.filter((c) => {
      // Check if enough time has passed
      const interval = c.intervalMs ?? this.config.intervalMs;
      const lastRun = this.taskLastRun.get(c.name) ?? 0;
      const timeDue = start - lastRun >= interval;

      // Check schedule constraints (day of week, active hours)
      const scheduleOk = this.shouldRunAccordingToSchedule(c);

      return timeDue && scheduleOk;
    });

    for (const check of dueChecks) {
      const checkStart = Date.now();
      let result: HeartbeatCheckResult;
      let errorDetail: string | null = null;
      try {
        result = await this.runCheck(check);
        checks.push(result);
        this.taskLastRun.set(check.name, start);
      } catch (err) {
        errorDetail = err instanceof Error ? (err.stack ?? err.message) : String(err);
        result = {
          name: check.name,
          type: check.type,
          status: 'error',
          message: err instanceof Error ? err.message : 'Check failed',
        };
        checks.push(result);
        this.taskLastRun.set(check.name, start);
      }

      const checkDurationMs = Date.now() - checkStart;

      // Persist execution result to heartbeat log — one entry per active personality.
      if (this.logStorage) {
        const logPersonalities =
          this.activePersonalityIds.length > 0
            ? this.activePersonalityIds
            : [{ id: null as unknown as string, name: '', omnipresentMind: false }];
        for (const p of logPersonalities) {
          // For system_health, compute scoped stats per personality so each entry
          // shows accurate per-personality memory/knowledge counts rather than
          // system-wide aggregates. Omnipresent personalities use unscoped stats.
          let persistStatus = result.status;
          let persistMessage = result.message;
          if (check.type === 'system_health') {
            const effectivePid = (p.omnipresentMind ?? false) ? undefined : (p.id ?? undefined);
            try {
              const scopedResult = await this.checkSystemHealth(check, effectivePid);
              persistStatus = scopedResult.status;
              persistMessage = scopedResult.message;
            } catch {
              // Fall back to the already-computed system-wide result
            }
          }
          try {
            await this.logStorage.persist({
              checkName: check.name,
              personalityId: p.id ?? null,
              ranAt: checkStart,
              status: persistStatus,
              message: persistMessage,
              durationMs: checkDurationMs,
              errorDetail,
            });
          } catch (logErr) {
            this.logger.warn(
              {
                check: check.name,
                personalityId: p.id,
                error: logErr instanceof Error ? logErr.message : 'Unknown error',
              },
              'Failed to persist heartbeat log entry'
            );
          }
        }
      }

      // Execute any configured actions based on result
      try {
        await this.executeActions(check, result);
      } catch (err) {
        this.logger.error(
          {
            check: check.name,
            error: err instanceof Error ? err.message : 'Unknown error',
          },
          'Action execution failed for check'
        );
      }
    }

    const result: HeartbeatResult = {
      timestamp: start,
      durationMs: Date.now() - start,
      checks,
    };

    this.lastBeat = result;
    this.beatCount++;

    if (checks.length > 0) {
      // Record as episodic memory
      const hasWarnings = checks.some((c) => c.status === 'warning');
      const hasErrors = checks.some((c) => c.status === 'error');
      const summary = checks.map((c) => `${c.name}: ${c.status}`).join(', ');

      await this.brain.remember(
        'episodic',
        `Heartbeat #${this.beatCount}: ${summary}`,
        'heartbeat',
        { beatCount: String(this.beatCount) },
        hasErrors ? 0.8 : hasWarnings ? 0.5 : 0.2
      );

      // Log to audit chain
      await this.auditChain.record({
        event: 'heartbeat',
        level: hasErrors ? 'warn' : 'info',
        message: `Heartbeat #${this.beatCount} completed in ${result.durationMs}ms`,
        metadata: {
          beatCount: this.beatCount,
          checksRun: checks.length,
          hasWarnings,
          hasErrors,
          activePersonalities: this.activePersonalityIds.map((p) => p.name || p.id).filter(Boolean),
        },
      });
    }

    return result;
  }

  getLastBeat(): HeartbeatResult | null {
    return this.lastBeat;
  }

  getStatus(): {
    running: boolean;
    enabled: boolean;
    intervalMs: number;
    beatCount: number;
    lastBeat: HeartbeatResult | null;
    personalityAtRest: boolean;
    personalitySchedule: {
      enabled: boolean;
      start: string;
      end: string;
      daysOfWeek: string[];
      timezone: string;
    } | null;
    tasks: {
      name: string;
      type: string;
      enabled: boolean;
      intervalMs: number;
      lastRunAt: number | null;
      config: Record<string, unknown>;
    }[];
  } {
    return {
      running: this.running,
      enabled: this.config.enabled,
      intervalMs: this.config.intervalMs,
      beatCount: this.beatCount,
      lastBeat: this.lastBeat,
      personalityAtRest: !this.isWithinPersonalityActiveHours(),
      personalitySchedule: this.personalitySchedule,
      tasks: this.config.checks.map((c) => ({
        name: c.name,
        type: c.type,
        enabled: c.enabled,
        intervalMs: c.intervalMs ?? this.config.intervalMs,
        lastRunAt: this.taskLastRun.get(c.name) ?? null,
        config: c.config,
      })),
    };
  }

  updateTask(
    name: string,
    data: { intervalMs?: number; enabled?: boolean; config?: Record<string, unknown> }
  ): void {
    const check = this.config.checks.find((c) => c.name === name);
    if (!check) {
      throw new Error(`Task "${name}" not found`);
    }
    if (data.intervalMs !== undefined) check.intervalMs = data.intervalMs;
    if (data.enabled !== undefined) check.enabled = data.enabled;
    if (data.config !== undefined) check.config = data.config;
  }

  private async runCheck(
    check: HeartbeatCheck,
    personalityId?: string
  ): Promise<HeartbeatCheckResult> {
    switch (check.type) {
      case 'system_health':
        return this.checkSystemHealth(check, personalityId);
      case 'memory_status':
        return this.checkMemoryStatus(check);
      case 'log_anomalies':
        return this.checkLogAnomalies(check);
      case 'integration_health':
        return this.checkIntegrationHealth(check);
      case 'reflective_task':
        return this.runReflectiveTask(check);
      case 'proactive':
        return {
          name: check.name,
          type: 'proactive',
          status: 'ok',
          message: 'Proactive check executed',
          data: check.config,
        };
      case 'custom':
        return {
          name: check.name,
          type: 'custom',
          status: 'ok',
          message: 'Custom check placeholder',
          data: check.config,
        };
      default:
        return {
          name: check.name,
          type: check.type,
          status: 'error',
          message: `Unknown check type: ${check.type}`,
        };
    }
  }

  private async runReflectiveTask(check: HeartbeatCheck): Promise<HeartbeatCheckResult> {
    const prompt = (check.config.prompt as string) ?? 'reflect';

    await this.brain.remember(
      'episodic',
      `Reflective task: ${prompt}`,
      'heartbeat',
      { task: check.name },
      0.4
    );

    return {
      name: check.name,
      type: 'reflective_task',
      status: 'ok',
      message: `Reflection recorded: "${prompt}"`,
    };
  }

  private async checkSystemHealth(
    check: HeartbeatCheck,
    personalityId?: string
  ): Promise<HeartbeatCheckResult> {
    const stats = await this.brain.getStats(personalityId);
    const mem = process.memoryUsage();

    const heapUsedMb = Math.round(mem.heapUsed / 1024 / 1024);
    const heapTotalMb = Math.round(mem.heapTotal / 1024 / 1024);
    const rssMb = Math.round(mem.rss / 1024 / 1024);
    const externalMb = Math.round((mem.external + mem.arrayBuffers) / 1024 / 1024);

    // V8's heapTotal tracks close to heapUsed by design — ratio-based checks on
    // heapTotal produce near-constant false warnings. Use RSS (total process
    // footprint) against a configurable absolute threshold instead.
    const warnRssMb = (check.config.warnRssMb as number | undefined) ?? 512;

    let status: HeartbeatCheckResult['status'] = 'ok';
    let message =
      `Memories: ${stats.memories.total}, Knowledge: ${stats.knowledge.total}, ` +
      `RSS: ${rssMb}MB, Heap: ${heapUsedMb}/${heapTotalMb}MB`;

    if (rssMb > warnRssMb) {
      status = 'warning';
      message = `High RSS memory: ${rssMb}MB (threshold: ${warnRssMb}MB). ` + message;
    }

    return {
      name: check.name,
      type: 'system_health',
      status,
      message,
      data: {
        memories: stats.memories.total,
        knowledge: stats.knowledge.total,
        skills: stats.skills.total,
        heapUsedMb,
        heapTotalMb,
        rssMb,
        externalMb,
      },
    };
  }

  private async checkMemoryStatus(check: HeartbeatCheck): Promise<HeartbeatCheckResult> {
    const maintenance = await this.brain.runMaintenance();

    let status: HeartbeatCheckResult['status'] = 'ok';
    let message = `Maintenance: ${maintenance.decayed} decayed, ${maintenance.pruned} pruned`;

    if (maintenance.pruned > 10) {
      status = 'warning';
      message = `High pruning count. ` + message;
    }

    return {
      name: check.name,
      type: 'memory_status',
      status,
      message,
      data: maintenance,
    };
  }

  private async checkLogAnomalies(check: HeartbeatCheck): Promise<HeartbeatCheckResult> {
    if (!this.brain.hasAuditStorage()) {
      return {
        name: check.name,
        type: 'log_anomalies',
        status: 'ok',
        message: 'Audit storage not available for log analysis',
      };
    }

    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const result = await this.brain.queryAuditLogs({
      level: ['error', 'critical'],
      from: fiveMinutesAgo,
      limit: 20,
    });

    let status: HeartbeatCheckResult['status'] = 'ok';
    let message = `${result.total} error/critical entries in last 5 minutes`;

    if (result.total > 10) {
      status = 'error';
      message = `High error rate! ` + message;
    } else if (result.total > 0) {
      status = 'warning';
    }

    return {
      name: check.name,
      type: 'log_anomalies',
      status,
      message,
      data: { errorCount: result.total },
    };
  }

  private checkIntegrationHealth(check: HeartbeatCheck): HeartbeatCheckResult {
    if (!this.integrationManager) {
      return {
        name: check.name,
        type: 'integration_health',
        status: 'ok',
        message: 'Integration manager not available',
      };
    }

    const runningCount = this.integrationManager.getRunningCount();

    return {
      name: check.name,
      type: 'integration_health',
      status: 'ok',
      message: `${runningCount} integrations running`,
      data: { runningCount },
    };
  }
}
