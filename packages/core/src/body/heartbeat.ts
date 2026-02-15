/**
 * HeartbeatManager — Periodic self-check system for FRIDAY.
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
  private interval: ReturnType<typeof setInterval> | null = null;
  private lastBeat: HeartbeatResult | null = null;
  private beatCount = 0;
  private running = false;
  private taskLastRun: Map<string, number> = new Map();
  private actionHistory: Map<string, number> = new Map(); // Track last action execution per check

  constructor(
    brain: BrainManager,
    auditChain: AuditChain,
    logger: SecureLogger,
    config: HeartbeatConfig,
    integrationManager?: IntegrationManager
  ) {
    this.brain = brain;
    this.auditChain = auditChain;
    this.logger = logger;
    this.config = config;
    this.integrationManager = integrationManager ?? null;
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
        this.logger.error('Action execution failed', {
          check: check.name,
          action: trigger.action,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
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
    const config = trigger.config as Record<string, unknown>;

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
        this.logger.warn('Unknown action type', { action: trigger.action });
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
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

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

        this.logger.info('Webhook executed successfully', {
          check: check.name,
          url,
          attempt: attempt + 1,
        });
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt < retryCount) {
          this.logger.warn('Webhook failed, retrying', {
            check: check.name,
            attempt: attempt + 1,
            error: lastError.message,
          });
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

    // Console notification (always available)
    if (channel === 'console') {
      console.log(`[HEARTBEAT ALERT] ${message}`);
      return;
    }

    // Integration-based notifications
    if (!this.integrationManager) {
      this.logger.warn('Integration manager not available for notification', {
        channel,
        check: check.name,
      });
      return;
    }

    // Route to appropriate integration
    switch (channel) {
      case 'slack':
        // TODO: Implement Slack integration
        this.logger.info('Slack notification would be sent', { message, recipients });
        break;
      case 'telegram':
        // TODO: Implement Telegram integration
        this.logger.info('Telegram notification would be sent', { message, recipients });
        break;
      case 'discord':
        // TODO: Implement Discord integration
        this.logger.info('Discord notification would be sent', { message, recipients });
        break;
      case 'email':
        // TODO: Implement email integration
        this.logger.info('Email notification would be sent', { message, recipients });
        break;
      default:
        this.logger.warn('Unknown notification channel', { channel });
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

    this.logger.info('Memory recorded from heartbeat action', {
      check: check.name,
      category,
      importance,
    });
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

    this.logger.info('Command execution requested (requires security review)', {
      check: check.name,
      command,
      args,
      result: result.status,
    });

    // TODO: Implement secure command execution with sandboxing
    throw new Error('Command execution not yet implemented - requires security review');
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

    this.logger.info('LLM analysis requested', {
      check: check.name,
      model: model || 'default',
      maxTokens,
      promptLength: prompt?.length,
    });

    // TODO: Implement LLM analysis with cheap model defaults
    // This would integrate with the AI provider system
    throw new Error('LLM analysis action not yet implemented');
  }

  /**
   * Utility: Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  start(): void {
    if (!this.config.enabled || this.running) return;

    this.running = true;
    this.interval = setInterval(() => {
      void this.beat().catch((err: unknown) => {
        this.logger.error('Heartbeat failed', {
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      });
    }, this.config.intervalMs);

    this.logger.info('Heartbeat started', { intervalMs: this.config.intervalMs });
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.running = false;
    this.logger.info('Heartbeat stopped');
  }

  async beat(): Promise<HeartbeatResult> {
    const start = Date.now();
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
      let result: HeartbeatCheckResult;
      try {
        result = await this.runCheck(check);
        checks.push(result);
        this.taskLastRun.set(check.name, start);
      } catch (err) {
        result = {
          name: check.name,
          type: check.type,
          status: 'error',
          message: err instanceof Error ? err.message : 'Check failed',
        };
        checks.push(result);
        this.taskLastRun.set(check.name, start);
      }

      // Execute any configured actions based on result
      try {
        await this.executeActions(check, result);
      } catch (err) {
        this.logger.error('Action execution failed for check', {
          check: check.name,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
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
    tasks: Array<{
      name: string;
      type: string;
      enabled: boolean;
      intervalMs: number;
      lastRunAt: number | null;
      config: Record<string, unknown>;
    }>;
  } {
    return {
      running: this.running,
      enabled: this.config.enabled,
      intervalMs: this.config.intervalMs,
      beatCount: this.beatCount,
      lastBeat: this.lastBeat,
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

  private async runCheck(check: HeartbeatCheck): Promise<HeartbeatCheckResult> {
    switch (check.type) {
      case 'system_health':
        return this.checkSystemHealth(check);
      case 'memory_status':
        return this.checkMemoryStatus(check);
      case 'log_anomalies':
        return this.checkLogAnomalies(check);
      case 'integration_health':
        return this.checkIntegrationHealth(check);
      case 'reflective_task':
        return this.runReflectiveTask(check);
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

  private async checkSystemHealth(check: HeartbeatCheck): Promise<HeartbeatCheckResult> {
    const stats = await this.brain.getStats();
    const memUsage = process.memoryUsage();

    const heapUsedMb = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMb = Math.round(memUsage.heapTotal / 1024 / 1024);

    let status: HeartbeatCheckResult['status'] = 'ok';
    let message = `Memories: ${stats.memories.total}, Knowledge: ${stats.knowledge.total}, Heap: ${heapUsedMb}/${heapTotalMb}MB`;

    if (heapUsedMb > heapTotalMb * 0.9) {
      status = 'warning';
      message = `High memory usage: ${heapUsedMb}/${heapTotalMb}MB. ` + message;
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
