/**
 * HeartbeatManager — Periodic self-check system for FRIDAY.
 *
 * Part of the Body module — the agent's vital signs and physical life-checks.
 *
 * Runs configurable checks on a per-task timer (system health, memory status,
 * log anomalies, integration health, reflective tasks) and records results as
 * episodic memories with source 'heartbeat'.
 */

import type { BrainManager } from '../brain/manager.js';
import type { AuditChain } from '../logging/audit-chain.js';
import type { IntegrationManager } from '../integrations/manager.js';
import type { SecureLogger } from '../logging/logger.js';
import type { HeartbeatConfig, HeartbeatCheck } from '@friday/shared';

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

  constructor(
    brain: BrainManager,
    auditChain: AuditChain,
    logger: SecureLogger,
    config: HeartbeatConfig,
    integrationManager?: IntegrationManager,
  ) {
    this.brain = brain;
    this.auditChain = auditChain;
    this.logger = logger;
    this.config = config;
    this.integrationManager = integrationManager ?? null;
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

    const enabledChecks = this.config.checks.filter(c => c.enabled);
    const dueChecks = enabledChecks.filter(c => {
      const interval = c.intervalMs ?? this.config.intervalMs;
      const lastRun = this.taskLastRun.get(c.name) ?? 0;
      return (start - lastRun) >= interval;
    });

    for (const check of dueChecks) {
      try {
        const result = await this.runCheck(check);
        checks.push(result);
        this.taskLastRun.set(check.name, start);
      } catch (err) {
        checks.push({
          name: check.name,
          type: check.type,
          status: 'error',
          message: err instanceof Error ? err.message : 'Check failed',
        });
        this.taskLastRun.set(check.name, start);
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
      const hasWarnings = checks.some(c => c.status === 'warning');
      const hasErrors = checks.some(c => c.status === 'error');
      const summary = checks.map(c => `${c.name}: ${c.status}`).join(', ');

      this.brain.remember(
        'episodic',
        `Heartbeat #${this.beatCount}: ${summary}`,
        'heartbeat',
        { beatCount: String(this.beatCount) },
        hasErrors ? 0.8 : hasWarnings ? 0.5 : 0.2,
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
      tasks: this.config.checks.map(c => ({
        name: c.name,
        type: c.type,
        enabled: c.enabled,
        intervalMs: c.intervalMs ?? this.config.intervalMs,
        lastRunAt: this.taskLastRun.get(c.name) ?? null,
        config: c.config,
      })),
    };
  }

  updateTask(name: string, data: { intervalMs?: number; enabled?: boolean; config?: Record<string, unknown> }): void {
    const check = this.config.checks.find(c => c.name === name);
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
    }
  }

  private runReflectiveTask(check: HeartbeatCheck): HeartbeatCheckResult {
    const prompt = (check.config.prompt as string) ?? 'reflect';

    this.brain.remember(
      'episodic',
      `Reflective task: ${prompt}`,
      'heartbeat',
      { task: check.name },
      0.4,
    );

    return {
      name: check.name,
      type: 'reflective_task',
      status: 'ok',
      message: `Reflection recorded: "${prompt}"`,
    };
  }

  private checkSystemHealth(check: HeartbeatCheck): HeartbeatCheckResult {
    const stats = this.brain.getStats();
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

  private checkMemoryStatus(check: HeartbeatCheck): HeartbeatCheckResult {
    const maintenance = this.brain.runMaintenance();

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
