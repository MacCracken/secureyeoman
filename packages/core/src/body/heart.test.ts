import { describe, it, expect } from 'vitest';
import { HeartManager } from './heart.js';
import type { HeartbeatManager } from './heartbeat.js';

function mockHeartbeatManager(
  overrides?: Partial<ReturnType<HeartbeatManager['getStatus']>>
): HeartbeatManager {
  const defaults = {
    running: true,
    enabled: true,
    intervalMs: 30000,
    beatCount: 0,
    lastBeat: null,
    tasks: [],
    ...overrides,
  };
  return {
    getStatus: () => defaults,
    getLastBeat: () => defaults.lastBeat,
    start: () => {},
    stop: () => {},
    beat: async () => ({ timestamp: 0, durationMs: 0, checks: [] }),
  } as unknown as HeartbeatManager;
}

describe('HeartManager', () => {
  it('should wrap a HeartbeatManager', () => {
    const hb = mockHeartbeatManager();
    const heart = new HeartManager(hb);
    expect(heart.getHeartbeat()).toBe(hb);
  });

  it('should return empty string when no beat has fired', () => {
    const heart = new HeartManager(mockHeartbeatManager());
    expect(heart.composeHeartPrompt()).toBe('');
  });

  it('should compose heart prompt with vital signs', () => {
    const heart = new HeartManager(
      mockHeartbeatManager({
        beatCount: 3,
        lastBeat: {
          timestamp: 1700000000000,
          durationMs: 12,
          checks: [
            {
              name: 'system_health',
              type: 'system_health',
              status: 'ok',
              message: 'All systems nominal',
            },
            {
              name: 'memory_status',
              type: 'memory_status',
              status: 'warning',
              message: 'High pruning count',
            },
          ],
        },
      })
    );

    const prompt = heart.composeHeartPrompt();
    expect(prompt).toContain('### Heart');
    expect(prompt).toContain('Your Heart is your pulse');
    expect(prompt).toContain('Heartbeat #3');
    expect(prompt).toContain('system_health: [ok] All systems nominal');
    expect(prompt).toContain('memory_status: [WARN] High pruning count');
  });

  it('should render error status with ERR tag', () => {
    const heart = new HeartManager(
      mockHeartbeatManager({
        beatCount: 1,
        lastBeat: {
          timestamp: 1700000000000,
          durationMs: 5,
          checks: [
            {
              name: 'log_anomalies',
              type: 'log_anomalies',
              status: 'error',
              message: 'High error rate',
            },
          ],
        },
      })
    );

    const prompt = heart.composeHeartPrompt();
    expect(prompt).toContain('log_anomalies: [ERR] High error rate');
  });

  it('should include task schedule with frequency and last run info', () => {
    const now = Date.now();
    const heart = new HeartManager(
      mockHeartbeatManager({
        beatCount: 5,
        lastBeat: {
          timestamp: now,
          durationMs: 8,
          checks: [{ name: 'system_health', type: 'system_health', status: 'ok', message: 'OK' }],
        },
        tasks: [
          {
            name: 'system_health',
            type: 'system_health',
            enabled: true,
            intervalMs: 300_000,
            lastRunAt: now - 60_000,
            config: {},
          },
          {
            name: 'memory_status',
            type: 'memory_status',
            enabled: true,
            intervalMs: 600_000,
            lastRunAt: null,
            config: {},
          },
          {
            name: 'self_reflection',
            type: 'reflective_task',
            enabled: false,
            intervalMs: 1_800_000,
            lastRunAt: null,
            config: { prompt: 'reflect' },
          },
        ],
      })
    );

    const prompt = heart.composeHeartPrompt();
    expect(prompt).toContain('Task schedule:');
    expect(prompt).toContain('system_health: every 5m, last run:');
    expect(prompt).toContain('memory_status: every 10m, last run: never');
    expect(prompt).toContain('self_reflection: every 30m, last run: never [disabled]');
  });

  it('should delegate start/stop to HeartbeatManager', () => {
    let started = false;
    let stopped = false;
    const hb = {
      ...mockHeartbeatManager(),
      start: () => {
        started = true;
      },
      stop: () => {
        stopped = true;
      },
    } as unknown as HeartbeatManager;

    const heart = new HeartManager(hb);
    heart.start();
    expect(started).toBe(true);
    heart.stop();
    expect(stopped).toBe(true);
  });

  it('should delegate getStatus to HeartbeatManager', () => {
    const heart = new HeartManager(mockHeartbeatManager({ beatCount: 42 }));
    expect(heart.getStatus().beatCount).toBe(42);
  });
});
