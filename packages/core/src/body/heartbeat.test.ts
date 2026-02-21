import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HeartbeatManager } from './heartbeat.js';
import type { BrainManager } from '../brain/manager.js';
import type { AuditChain } from '../logging/audit-chain.js';
import type { SecureLogger } from '../logging/logger.js';

// Test-specific config type with proactive features
interface TestHeartbeatConfig {
  enabled: boolean;
  intervalMs: number;
  defaultActions?: TestHeartbeatActionTrigger[];
  checks: TestHeartbeatCheck[];
}

interface TestHeartbeatCheck {
  name: string;
  type:
    | 'system_health'
    | 'memory_status'
    | 'log_anomalies'
    | 'integration_health'
    | 'reflective_task'
    | 'custom';
  enabled: boolean;
  intervalMs?: number;
  schedule?: {
    daysOfWeek?: ('mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun')[];
    activeHours?: {
      start: string;
      end: string;
      timezone?: string;
    };
  };
  config: Record<string, unknown>;
  actions?: TestHeartbeatActionTrigger[];
}

interface TestHeartbeatActionTrigger {
  condition: 'always' | 'on_ok' | 'on_warning' | 'on_error';
  action: 'webhook' | 'notify' | 'remember' | 'execute' | 'llm_analyze';
  config: Record<string, unknown>;
}

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
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    child: () => mockLogger(),
    level: 'silent',
  } as unknown as SecureLogger;
}

function defaultConfig(overrides?: Partial<TestHeartbeatConfig>): TestHeartbeatConfig {
  return {
    enabled: true,
    intervalMs: 30_000,
    checks: [
      {
        name: 'system_health',
        type: 'system_health',
        enabled: true,
        intervalMs: 300_000,
        config: {},
      },
      {
        name: 'memory_status',
        type: 'memory_status',
        enabled: true,
        intervalMs: 600_000,
        config: {},
      },
      {
        name: 'self_reflection',
        type: 'reflective_task',
        enabled: true,
        intervalMs: 1_800_000,
        config: { prompt: 'how can I help' },
      },
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
      expect(result.checks.map((c) => c.name)).toEqual([
        'system_health',
        'memory_status',
        'self_reflection',
      ]);
    });

    it('should skip tasks that are not yet due', async () => {
      const config = defaultConfig({
        checks: [
          { name: 'fast_check', type: 'system_health', enabled: true, intervalMs: 100, config: {} },
          {
            name: 'slow_check',
            type: 'memory_status',
            enabled: true,
            intervalMs: 10_000_000,
            config: {},
          },
        ],
      });
      const hb = new HeartbeatManager(brain, audit, logger, config);

      // First beat: both run
      const result1 = await hb.beat();
      expect(result1.checks).toHaveLength(2);

      // Wait a tiny bit so fast_check is due again but slow_check is not
      await new Promise((r) => setTimeout(r, 150));

      const result2 = await hb.beat();
      expect(result2.checks).toHaveLength(1);
      expect(result2.checks[0].name).toBe('fast_check');
    });

    it('should fall back to top-level intervalMs when check has no per-task intervalMs', async () => {
      const config: TestHeartbeatConfig = {
        enabled: true,
        intervalMs: 30_000,
        checks: [{ name: 'no_interval', type: 'system_health', enabled: true, config: {} }],
      };
      const hb = new HeartbeatManager(brain, audit, logger, config as any);

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
          {
            name: 'reflect',
            type: 'reflective_task',
            enabled: true,
            intervalMs: 30_000,
            config: { prompt: 'think deeply' },
          },
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
        0.4
      );
    });

    it('should default prompt to "reflect" when not specified', async () => {
      const config = defaultConfig({
        checks: [
          {
            name: 'reflect',
            type: 'reflective_task',
            enabled: true,
            intervalMs: 30_000,
            config: {},
          },
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
      const task = status.tasks.find((t) => t.name === 'system_health');
      expect(task?.intervalMs).toBe(120_000);
    });

    it('should update enabled flag', () => {
      const hb = new HeartbeatManager(brain, audit, logger, defaultConfig());
      hb.updateTask('self_reflection', { enabled: false });

      const status = hb.getStatus();
      const task = status.tasks.find((t) => t.name === 'self_reflection');
      expect(task?.enabled).toBe(false);
    });

    it('should update config', () => {
      const hb = new HeartbeatManager(brain, audit, logger, defaultConfig());
      hb.updateTask('self_reflection', { config: { prompt: 'new prompt' } });

      const status = hb.getStatus();
      const task = status.tasks.find((t) => t.name === 'self_reflection');
      expect(task?.config).toEqual({ prompt: 'new prompt' });
    });

    it('should throw for unknown task name', () => {
      const hb = new HeartbeatManager(brain, audit, logger, defaultConfig());
      expect(() => hb.updateTask('nonexistent', { enabled: false })).toThrow(
        'Task "nonexistent" not found'
      );
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
          {
            name: 'enabled_check',
            type: 'system_health',
            enabled: true,
            intervalMs: 30_000,
            config: {},
          },
          {
            name: 'disabled_check',
            type: 'memory_status',
            enabled: false,
            intervalMs: 30_000,
            config: {},
          },
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
          {
            name: 'slow',
            type: 'system_health',
            enabled: true,
            intervalMs: 10_000_000,
            config: {},
          },
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
        expect.any(Number)
      );
    });
  });

  // ============================================
  // PROACTIVE HEARTBEAT FEATURES (ADR 018)
  // ============================================

  describe('conditional scheduling', () => {
    it('should skip check when not in daysOfWeek', async () => {
      // Mock Sunday
      const originalDate = Date;
      global.Date = class extends Date {
        constructor(...args: unknown[]) {
          if (args.length === 0) {
            super('2024-01-07T12:00:00Z'); // Sunday
          } else {
            super(args[0] as string | number | Date);
          }
        }
        getDay() {
          return 0;
        } // Sunday
      } as any;

      const config = defaultConfig({
        checks: [
          {
            name: 'weekday_check',
            type: 'system_health',
            enabled: true,
            intervalMs: 100,
            schedule: {
              daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri'],
            },
            config: {},
          },
        ],
      });
      const hb = new HeartbeatManager(brain, audit, logger, config);
      const result = await hb.beat();

      expect(result.checks).toHaveLength(0);

      global.Date = originalDate;
    });

    it('should run check when in daysOfWeek', async () => {
      // Mock Monday
      global.Date = class extends Date {
        constructor(...args: unknown[]) {
          if (args.length === 0) {
            super('2024-01-01T12:00:00Z'); // Monday
          } else {
            super(args[0] as string | number | Date);
          }
        }
        getDay() {
          return 1;
        } // Monday
      } as any;

      const config = defaultConfig({
        checks: [
          {
            name: 'weekday_check',
            type: 'system_health',
            enabled: true,
            intervalMs: 100,
            schedule: {
              daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri'],
            },
            config: {},
          },
        ],
      });
      const hb = new HeartbeatManager(brain, audit, logger, config);
      const result = await hb.beat();

      expect(result.checks).toHaveLength(1);
    });

    it('should skip check outside activeHours', async () => {
      // Mock 3 AM UTC
      global.Date = class extends Date {
        constructor(...args: unknown[]) {
          if (args.length === 0) {
            super('2024-01-01T03:00:00Z');
          } else {
            super(args[0] as string | number | Date);
          }
        }
        getUTCHours() {
          return 3;
        }
        getUTCMinutes() {
          return 0;
        }
      } as any;

      const config = defaultConfig({
        checks: [
          {
            name: 'business_hours',
            type: 'system_health',
            enabled: true,
            intervalMs: 100,
            schedule: {
              activeHours: {
                start: '09:00',
                end: '17:00',
                timezone: 'UTC',
              },
            },
            config: {},
          },
        ],
      });
      const hb = new HeartbeatManager(brain, audit, logger, config);
      const result = await hb.beat();

      expect(result.checks).toHaveLength(0);
    });

    it('should run check within activeHours', async () => {
      // Mock 12 PM UTC
      global.Date = class extends Date {
        constructor(...args: unknown[]) {
          if (args.length === 0) {
            super('2024-01-01T12:00:00Z');
          } else {
            super(args[0] as string | number | Date);
          }
        }
        getUTCHours() {
          return 12;
        }
        getUTCMinutes() {
          return 0;
        }
      } as any;

      const config = defaultConfig({
        checks: [
          {
            name: 'business_hours',
            type: 'system_health',
            enabled: true,
            intervalMs: 100,
            schedule: {
              activeHours: {
                start: '09:00',
                end: '17:00',
                timezone: 'UTC',
              },
            },
            config: {},
          },
        ],
      });
      const hb = new HeartbeatManager(brain, audit, logger, config);
      const result = await hb.beat();

      expect(result.checks).toHaveLength(1);
    });
  });

  describe('action triggers', () => {
    it('should trigger action on_error condition', async () => {
      const config = defaultConfig({
        checks: [
          {
            name: 'failing_check',
            type: 'custom', // Custom checks return ok by default, but we'll simulate error
            enabled: true,
            intervalMs: 100,
            config: {},
            actions: [
              {
                condition: 'on_error',
                action: 'notify',
                config: {
                  channel: 'console',
                  messageTemplate: 'Error: {{check.name}}',
                },
              },
            ],
          },
        ],
      });

      const hb = new HeartbeatManager(brain, audit, logger, config);

      // Override the check to simulate error
      vi.spyOn(hb as any, 'runCheck').mockResolvedValue({
        name: 'failing_check',
        type: 'custom',
        status: 'error',
        message: 'Simulated error',
      });

      await hb.beat();

      expect(logger.info).toHaveBeenCalledWith(
        '[HEARTBEAT ALERT]',
        expect.objectContaining({ message: expect.stringContaining('Error: failing_check') })
      );
    });

    it('should not trigger action when condition does not match', async () => {
      const config = defaultConfig({
        checks: [
          {
            name: 'ok_check',
            type: 'system_health',
            enabled: true,
            intervalMs: 100,
            config: {},
            actions: [
              {
                condition: 'on_error',
                action: 'notify',
                config: {
                  channel: 'console',
                  messageTemplate: 'Should not see this',
                },
              },
            ],
          },
        ],
      });

      const hb = new HeartbeatManager(brain, audit, logger, config);
      await hb.beat();

      expect(logger.info).not.toHaveBeenCalledWith(
        '[HEARTBEAT ALERT]',
        expect.objectContaining({ message: expect.stringContaining('Should not see this') })
      );
    });

    it('should trigger always condition regardless of status', async () => {
      const config = defaultConfig({
        checks: [
          {
            name: 'any_check',
            type: 'system_health',
            enabled: true,
            intervalMs: 100,
            config: {},
            actions: [
              {
                condition: 'always',
                action: 'notify',
                config: {
                  channel: 'console',
                  messageTemplate: 'Always triggered',
                },
              },
            ],
          },
        ],
      });

      const hb = new HeartbeatManager(brain, audit, logger, config);
      await hb.beat();

      expect(logger.info).toHaveBeenCalledWith(
        '[HEARTBEAT ALERT]',
        expect.objectContaining({ message: expect.stringContaining('Always triggered') })
      );
    });
  });

  describe('remember action', () => {
    it('should record memory with remember action', async () => {
      const config = defaultConfig({
        checks: [
          {
            name: 'memory_check',
            type: 'system_health',
            enabled: true,
            intervalMs: 100,
            config: {},
            actions: [
              {
                condition: 'always',
                action: 'remember',
                config: {
                  importance: 0.9,
                  category: 'test_alert',
                  memoryType: 'episodic',
                },
              },
            ],
          },
        ],
      });

      const hb = new HeartbeatManager(brain, audit, logger, config);
      await hb.beat();

      expect(brain.remember).toHaveBeenCalledWith(
        'episodic',
        expect.stringContaining('Heartbeat alert from "memory_check"'),
        'test_alert',
        expect.objectContaining({
          checkName: 'memory_check',
          checkType: 'system_health',
        }),
        0.9
      );
    });
  });

  describe('default actions', () => {
    it('should run default actions for all checks', async () => {
      const config = defaultConfig({
        defaultActions: [
          {
            condition: 'always',
            action: 'notify',
            config: {
              channel: 'console',
              messageTemplate: 'Default action: {{check.name}}',
            },
          },
        ],
        checks: [
          { name: 'check1', type: 'system_health', enabled: true, intervalMs: 100, config: {} },
          { name: 'check2', type: 'memory_status', enabled: true, intervalMs: 100, config: {} },
        ],
      });

      const hb = new HeartbeatManager(brain, audit, logger, config);
      await hb.beat();

      expect(logger.info).toHaveBeenCalledWith(
        '[HEARTBEAT ALERT]',
        expect.objectContaining({ message: expect.stringContaining('Default action: check1') })
      );
      expect(logger.info).toHaveBeenCalledWith(
        '[HEARTBEAT ALERT]',
        expect.objectContaining({ message: expect.stringContaining('Default action: check2') })
      );
    });

    it('should merge default and check-specific actions', async () => {
      const config = defaultConfig({
        defaultActions: [
          {
            condition: 'always',
            action: 'notify',
            config: {
              channel: 'console',
              messageTemplate: 'Default',
            },
          },
        ],
        checks: [
          {
            name: 'check_with_actions',
            type: 'system_health',
            enabled: true,
            intervalMs: 100,
            config: {},
            actions: [
              {
                condition: 'always',
                action: 'notify',
                config: {
                  channel: 'console',
                  messageTemplate: 'Specific',
                },
              },
            ],
          },
        ],
      });

      const hb = new HeartbeatManager(brain, audit, logger, config);
      await hb.beat();

      expect(logger.info).toHaveBeenCalledWith(
        '[HEARTBEAT ALERT]',
        expect.objectContaining({ message: expect.stringContaining('Default') })
      );
      expect(logger.info).toHaveBeenCalledWith(
        '[HEARTBEAT ALERT]',
        expect.objectContaining({ message: expect.stringContaining('Specific') })
      );
    });
  });

  describe('webhook action', () => {
    it('should send webhook on matching condition', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
      } as Response);

      const config = defaultConfig({
        checks: [
          {
            name: 'webhook_check',
            type: 'system_health',
            enabled: true,
            intervalMs: 100,
            config: {},
            actions: [
              {
                condition: 'always',
                action: 'webhook',
                config: {
                  url: 'https://example.com/webhook',
                  method: 'POST',
                  headers: { 'X-Custom': 'value' },
                  timeoutMs: 5000,
                  retryCount: 0,
                },
              },
            ],
          },
        ],
      });

      const hb = new HeartbeatManager(brain, audit, logger, config);
      await hb.beat();

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Custom': 'value',
          }),
        })
      );

      fetchSpy.mockRestore();
    });

    it('should include correct payload in webhook', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
      } as Response);

      const config = defaultConfig({
        checks: [
          {
            name: 'webhook_check',
            type: 'system_health',
            enabled: true,
            intervalMs: 100,
            config: {},
            actions: [
              {
                condition: 'always',
                action: 'webhook',
                config: {
                  url: 'https://example.com/webhook',
                  retryCount: 0,
                },
              },
            ],
          },
        ],
      });

      const hb = new HeartbeatManager(brain, audit, logger, config);
      await hb.beat();

      const callArgs = fetchSpy.mock.calls[0];
      const requestBody = callArgs[1]?.body;
      if (!requestBody || typeof requestBody !== 'string') {
        throw new Error('Expected request body to be a string');
      }
      const body = JSON.parse(requestBody);

      expect(body).toMatchObject({
        check: {
          name: 'webhook_check',
          type: 'system_health',
        },
        result: {
          status: expect.any(String),
          message: expect.any(String),
        },
        source: 'friday-heartbeat',
      });

      fetchSpy.mockRestore();
    });

    it('should retry failed webhooks', async () => {
      const fetchSpy = vi
        .spyOn(global, 'fetch')
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ ok: true, status: 200 } as Response);

      const config = defaultConfig({
        checks: [
          {
            name: 'retry_check',
            type: 'system_health',
            enabled: true,
            intervalMs: 100,
            config: {},
            actions: [
              {
                condition: 'always',
                action: 'webhook',
                config: {
                  url: 'https://example.com/webhook',
                  retryCount: 2,
                  retryDelayMs: 10,
                },
              },
            ],
          },
        ],
      });

      const hb = new HeartbeatManager(brain, audit, logger, config);
      await hb.beat();

      expect(fetchSpy).toHaveBeenCalledTimes(3);
      fetchSpy.mockRestore();
    });
  });

  describe('action execution error handling', () => {
    it('should continue other actions if one fails', async () => {
      const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

      // Mock fetch to fail immediately
      const fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));

      const config = defaultConfig({
        checks: [
          {
            name: 'multi_action_check',
            type: 'system_health',
            enabled: true,
            intervalMs: 100,
            config: {},
            actions: [
              {
                condition: 'always',
                action: 'webhook',
                config: {
                  url: 'https://example.com/fail',
                  retryCount: 0,
                  timeoutMs: 100, // Short timeout for faster test
                },
              },
              {
                condition: 'always',
                action: 'notify',
                config: {
                  channel: 'console',
                  messageTemplate: 'Second action should still run',
                },
              },
            ],
          },
        ],
      });

      const hb = new HeartbeatManager(brain, audit, logger, config);
      await hb.beat();

      // Second action should still have been called
      expect(logger.info).toHaveBeenCalledWith(
        '[HEARTBEAT ALERT]',
        expect.objectContaining({
          message: expect.stringContaining('Second action should still run'),
        })
      );

      errorSpy.mockRestore();
      fetchSpy.mockRestore();
    });
  });

  // ── Heartbeat log storage integration ────────────────────────────────────────
  describe('heartbeat log storage', () => {
    function mockLogStorage() {
      return {
        persist: vi.fn().mockResolvedValue({ id: 'log-id-1' }),
        list: vi.fn().mockResolvedValue({ entries: [], total: 0 }),
      };
    }

    it('persists a log entry for each check that runs', async () => {
      const logStorage = mockLogStorage();
      const config = defaultConfig({
        checks: [
          {
            name: 'system_health',
            type: 'system_health',
            enabled: true,
            intervalMs: 0,
            config: {},
          },
          {
            name: 'memory_status',
            type: 'memory_status',
            enabled: true,
            intervalMs: 0,
            config: {},
          },
        ],
      });
      const hb = new HeartbeatManager(
        brain,
        audit,
        logger,
        config as any,
        undefined,
        logStorage as any
      );
      await hb.beat();

      expect(logStorage.persist).toHaveBeenCalledTimes(2);
      expect(logStorage.persist).toHaveBeenCalledWith(
        expect.objectContaining({
          checkName: 'system_health',
          status: expect.stringMatching(/^(ok|warning|error)$/),
          durationMs: expect.any(Number),
        })
      );
    });

    it('persists error status and errorDetail when a check throws', async () => {
      const logStorage = mockLogStorage();
      const config = defaultConfig({
        checks: [
          { name: 'broken_check', type: 'custom', enabled: true, intervalMs: 0, config: {} },
        ],
      });
      const hb = new HeartbeatManager(
        brain,
        audit,
        logger,
        config as any,
        undefined,
        logStorage as any
      );
      // Override runCheck to throw
      (hb as any).runCheck = vi.fn().mockRejectedValue(new Error('Simulated failure'));

      await hb.beat();

      expect(logStorage.persist).toHaveBeenCalledTimes(1);
      expect(logStorage.persist).toHaveBeenCalledWith(
        expect.objectContaining({
          checkName: 'broken_check',
          status: 'error',
          message: 'Simulated failure',
          errorDetail: expect.stringContaining('Simulated failure'),
        })
      );
    });

    it('does not throw when logStorage.persist fails', async () => {
      const logStorage = mockLogStorage();
      logStorage.persist.mockRejectedValue(new Error('DB unavailable'));
      const config = defaultConfig({
        checks: [
          {
            name: 'system_health',
            type: 'system_health',
            enabled: true,
            intervalMs: 0,
            config: {},
          },
        ],
      });
      const hb = new HeartbeatManager(
        brain,
        audit,
        logger,
        config as any,
        undefined,
        logStorage as any
      );

      // Should not throw — warns and continues
      await expect(hb.beat()).resolves.toBeDefined();
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to persist heartbeat log entry',
        expect.objectContaining({ check: 'system_health' })
      );
    });

    it('works normally without a logStorage (backward compat)', async () => {
      const hb = new HeartbeatManager(brain, audit, logger, defaultConfig());
      const result = await hb.beat();
      expect(result.checks).toHaveLength(3);
    });
  });
});
