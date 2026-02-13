import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HeartbeatManager } from './heartbeat.js';
import type { HeartbeatConfig } from '@friday/shared';
import type { BrainManager } from '../brain/manager.js';
import type { AuditChain } from '../logging/audit-chain.js';
import type { SecureLogger } from '../logging/logger.js';

function mockBrain(): BrainManager {
  return {
    remember: vi.fn(),
    getStats: vi.fn().mockReturnValue({
      memories: { total: 10 },
      knowledge: { total: 5 },
      skills: { total: 2 },
    }),
    runMaintenance: vi.fn().mockReturnValue({ decayed: 0, pruned: 0 }),
    hasAuditStorage: vi.fn().mockReturnValue(false),
    queryAuditLogs: vi.fn(),
  } as unknown as BrainManager;
}

function mockAuditChain(): AuditChain {
  return {
    record: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditChain;
}

function mockLogger(): SecureLogger {
  const noop = vi.fn();
  return {
    trace: noop, debug: noop, info: noop, warn: noop, error: noop, fatal: noop,
    child: () => mockLogger(),
    level: 'silent',
  } as unknown as SecureLogger;
}

function defaultConfig(overrides?: Partial<HeartbeatConfig>): HeartbeatConfig {
  return {
    enabled: true,
    intervalMs: 30_000,
    checks: [
      { name: 'system_health', type: 'system_health', enabled: true, intervalMs: 300_000, config: {} },
      { name: 'memory_status', type: 'memory_status', enabled: true, intervalMs: 600_000, config: {} },
      { name: 'self_reflection', type: 'reflective_task', enabled: true, intervalMs: 1_800_000, config: { prompt: 'how can I help' } },
    ],
    ...overrides,
  };
}

describe('HeartbeatManager', () => {
  let brain: BrainManager;
  let audit: AuditChain;
  let logger: SecureLogger;

  beforeEach(() => {
    brain = mockBrain();
    audit = mockAuditChain();
    logger = mockLogger();
  });

  describe('per-task scheduling', () => {
    it('should run all tasks on first beat (all are due since lastRunAt=0)', async () => {
      const hb = new HeartbeatManager(brain, audit, logger, defaultConfig());
      const result = await hb.beat();

      // All 3 checks should run on first beat
      expect(result.checks).toHaveLength(3);
      expect(result.checks.map(c => c.name)).toEqual(['system_health', 'memory_status', 'self_reflection']);
    });

    it('should skip tasks that are not yet due', async () => {
      const config = defaultConfig({
        checks: [
          { name: 'fast_check', type: 'system_health', enabled: true, intervalMs: 100, config: {} },
          { name: 'slow_check', type: 'memory_status', enabled: true, intervalMs: 10_000_000, config: {} },
        ],
      });
      const hb = new HeartbeatManager(brain, audit, logger, config);

      // First beat: both run
      const result1 = await hb.beat();
      expect(result1.checks).toHaveLength(2);

      // Wait a tiny bit so fast_check is due again but slow_check is not
      await new Promise(r => setTimeout(r, 150));

      const result2 = await hb.beat();
      expect(result2.checks).toHaveLength(1);
      expect(result2.checks[0].name).toBe('fast_check');
    });

    it('should fall back to top-level intervalMs when check has no per-task intervalMs', async () => {
      const config: HeartbeatConfig = {
        enabled: true,
        intervalMs: 30_000,
        checks: [
          { name: 'no_interval', type: 'system_health', enabled: true, config: {} },
        ],
      };
      const hb = new HeartbeatManager(brain, audit, logger, config);

      const result = await hb.beat();
      expect(result.checks).toHaveLength(1);

      const status = hb.getStatus();
      expect(status.tasks[0].intervalMs).toBe(30_000);
    });
  });

  describe('reflective_task handler', () => {
    it('should record an episodic memory with the prompt text', async () => {
      const config = defaultConfig({
        checks: [
          { name: 'reflect', type: 'reflective_task', enabled: true, intervalMs: 30_000, config: { prompt: 'think deeply' } },
        ],
      });
      const hb = new HeartbeatManager(brain, audit, logger, config);
      const result = await hb.beat();

      expect(result.checks).toHaveLength(1);
      expect(result.checks[0]).toMatchObject({
        name: 'reflect',
        type: 'reflective_task',
        status: 'ok',
        message: 'Reflection recorded: "think deeply"',
      });

      // Should have called remember twice: once for the reflective task, once for the heartbeat summary
      expect(brain.remember).toHaveBeenCalledWith(
        'episodic',
        'Reflective task: think deeply',
        'heartbeat',
        { task: 'reflect' },
        0.4,
      );
    });

    it('should default prompt to "reflect" when not specified', async () => {
      const config = defaultConfig({
        checks: [
          { name: 'reflect', type: 'reflective_task', enabled: true, intervalMs: 30_000, config: {} },
        ],
      });
      const hb = new HeartbeatManager(brain, audit, logger, config);
      const result = await hb.beat();

      expect(result.checks[0].message).toContain('Reflection recorded: "reflect"');
    });
  });

  describe('updateTask()', () => {
    it('should update interval for existing task', () => {
      const hb = new HeartbeatManager(brain, audit, logger, defaultConfig());
      hb.updateTask('system_health', { intervalMs: 120_000 });

      const status = hb.getStatus();
      const task = status.tasks.find(t => t.name === 'system_health');
      expect(task?.intervalMs).toBe(120_000);
    });

    it('should update enabled flag', () => {
      const hb = new HeartbeatManager(brain, audit, logger, defaultConfig());
      hb.updateTask('self_reflection', { enabled: false });

      const status = hb.getStatus();
      const task = status.tasks.find(t => t.name === 'self_reflection');
      expect(task?.enabled).toBe(false);
    });

    it('should update config', () => {
      const hb = new HeartbeatManager(brain, audit, logger, defaultConfig());
      hb.updateTask('self_reflection', { config: { prompt: 'new prompt' } });

      const status = hb.getStatus();
      const task = status.tasks.find(t => t.name === 'self_reflection');
      expect(task?.config).toEqual({ prompt: 'new prompt' });
    });

    it('should throw for unknown task name', () => {
      const hb = new HeartbeatManager(brain, audit, logger, defaultConfig());
      expect(() => hb.updateTask('nonexistent', { enabled: false })).toThrow('Task "nonexistent" not found');
    });
  });

  describe('getStatus()', () => {
    it('should include tasks with lastRunAt', async () => {
      const hb = new HeartbeatManager(brain, audit, logger, defaultConfig());
      await hb.beat();

      const status = hb.getStatus();
      expect(status.tasks).toHaveLength(3);
      expect(status.tasks[0].lastRunAt).toBeTypeOf('number');
      expect(status.tasks[0].lastRunAt).toBeGreaterThan(0);
    });

    it('should show null lastRunAt before any beat', () => {
      const hb = new HeartbeatManager(brain, audit, logger, defaultConfig());
      const status = hb.getStatus();
      expect(status.tasks[0].lastRunAt).toBeNull();
    });
  });

  describe('disabled checks', () => {
    it('should not run disabled checks', async () => {
      const config = defaultConfig({
        checks: [
          { name: 'enabled_check', type: 'system_health', enabled: true, intervalMs: 30_000, config: {} },
          { name: 'disabled_check', type: 'memory_status', enabled: false, intervalMs: 30_000, config: {} },
        ],
      });
      const hb = new HeartbeatManager(brain, audit, logger, config);
      const result = await hb.beat();

      expect(result.checks).toHaveLength(1);
      expect(result.checks[0].name).toBe('enabled_check');
    });
  });

  describe('no-op beat when no checks are due', () => {
    it('should not record memory when no checks run', async () => {
      const config = defaultConfig({
        checks: [
          { name: 'slow', type: 'system_health', enabled: true, intervalMs: 10_000_000, config: {} },
        ],
      });
      const hb = new HeartbeatManager(brain, audit, logger, config);

      // First beat runs the check
      await hb.beat();
      vi.mocked(brain.remember).mockClear();
      vi.mocked(audit.record).mockClear();

      // Second beat — task not due, should skip memory recording
      const result = await hb.beat();
      expect(result.checks).toHaveLength(0);
      // Only the reflective task remember, not the heartbeat summary
      expect(brain.remember).not.toHaveBeenCalledWith(
        'episodic',
        expect.stringContaining('Heartbeat'),
        'heartbeat',
        expect.any(Object),
        expect.any(Number),
      );
    });
  });
});
