/**
 * MCP Health Monitor — unit tests for periodic health checks.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpHealthMonitor } from './health-monitor.js';
import type { McpStorage } from './storage.js';
import type { SecureLogger } from '../logging/logger.js';

function createMockStorage(): McpStorage {
  return {
    listServers: vi.fn().mockResolvedValue([]),
    getServer: vi.fn().mockResolvedValue(null),
    getHealth: vi.fn().mockResolvedValue(null),
    saveHealth: vi.fn().mockResolvedValue(undefined),
    loadTools: vi.fn().mockResolvedValue([]),
    updateServer: vi.fn().mockResolvedValue(undefined),
  } as unknown as McpStorage;
}

function createMockLogger(): SecureLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as SecureLogger;
}

describe('McpHealthMonitor', () => {
  let storage: ReturnType<typeof createMockStorage>;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    storage = createMockStorage();
    logger = createMockLogger();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('uses default config when none provided', () => {
      const monitor = new McpHealthMonitor(storage, logger);
      // We can verify it constructed without error
      expect(monitor).toBeDefined();
    });

    it('merges custom config with defaults', () => {
      const monitor = new McpHealthMonitor(storage, logger, {
        checkIntervalMs: 30_000,
      });
      expect(monitor).toBeDefined();
    });
  });

  describe('start/stop lifecycle', () => {
    it('starts the interval timer', () => {
      const monitor = new McpHealthMonitor(storage, logger, { checkIntervalMs: 5000 });
      monitor.start();
      expect(logger.info).toHaveBeenCalledWith(
        'MCP health monitor started',
        expect.objectContaining({ intervalMs: 5000 })
      );
      monitor.stop();
    });

    it('stop clears the timer', () => {
      const monitor = new McpHealthMonitor(storage, logger);
      monitor.start();
      monitor.stop();
      expect(logger.info).toHaveBeenCalledWith('MCP health monitor stopped');
    });

    it('start is idempotent — calling twice does not create duplicate timers', () => {
      const monitor = new McpHealthMonitor(storage, logger);
      monitor.start();
      monitor.start();
      // info should only be called once for start
      const startCalls = (logger.info as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c: unknown[]) => c[0] === 'MCP health monitor started'
      );
      expect(startCalls).toHaveLength(1);
      monitor.stop();
    });

    it('stop is safe to call when not started', () => {
      const monitor = new McpHealthMonitor(storage, logger);
      // Should not throw
      monitor.stop();
      expect(logger.info).not.toHaveBeenCalledWith('MCP health monitor stopped');
    });
  });

  describe('checkServer', () => {
    it('returns unknown status for non-existent server', async () => {
      (storage.getServer as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const monitor = new McpHealthMonitor(storage, logger);

      const health = await monitor.checkServer('missing-id');

      expect(health.serverId).toBe('missing-id');
      expect(health.status).toBe('unknown');
      expect(health.lastError).toBe('Server not found');
      expect(health.consecutiveFailures).toBe(0);
    });

    it('returns healthy status for a stdio server with tools', async () => {
      (storage.getServer as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'srv-1',
        name: 'Test Server',
        transport: 'stdio',
        enabled: true,
      });
      (storage.loadTools as ReturnType<typeof vi.fn>).mockResolvedValue([
        { name: 'tool1', description: 'A tool' },
      ]);
      (storage.getHealth as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const monitor = new McpHealthMonitor(storage, logger);
      const health = await monitor.checkServer('srv-1');

      expect(health.status).toBe('healthy');
      expect(health.consecutiveFailures).toBe(0);
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
      expect(storage.saveHealth).toHaveBeenCalledWith(
        expect.objectContaining({ serverId: 'srv-1' })
      );
    });

    it('increments consecutiveFailures on failure', async () => {
      (storage.getServer as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'srv-1',
        name: 'Failing Server',
        transport: 'stdio',
        enabled: true,
      });
      // No tools means health check throws
      (storage.loadTools as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (storage.getHealth as ReturnType<typeof vi.fn>).mockResolvedValue({
        serverId: 'srv-1',
        consecutiveFailures: 2,
        lastSuccessAt: null,
      });

      const monitor = new McpHealthMonitor(storage, logger);
      const health = await monitor.checkServer('srv-1');

      expect(health.status).toBe('degraded');
      expect(health.consecutiveFailures).toBe(3);
      expect(health.lastError).toBe('No tools registered');
      expect(logger.warn).toHaveBeenCalled();
    });

    it('auto-disables server after reaching failure threshold', async () => {
      (storage.getServer as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'srv-1',
        name: 'Doomed Server',
        transport: 'stdio',
        enabled: true,
      });
      (storage.loadTools as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      // Already at threshold - 1 failures
      (storage.getHealth as ReturnType<typeof vi.fn>).mockResolvedValue({
        serverId: 'srv-1',
        consecutiveFailures: 4,
        lastSuccessAt: null,
      });

      const monitor = new McpHealthMonitor(storage, logger, { autoDisableThreshold: 5 });
      const health = await monitor.checkServer('srv-1');

      expect(health.status).toBe('unhealthy');
      expect(health.consecutiveFailures).toBe(5);
      expect(storage.updateServer).toHaveBeenCalledWith('srv-1', { enabled: false });
      expect(logger.error).toHaveBeenCalledWith(
        'MCP server auto-disabled due to consecutive failures',
        expect.objectContaining({ serverId: 'srv-1', failures: 5 })
      );
    });

    it('reports failure for remote server with no URL', async () => {
      (storage.getServer as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'srv-2',
        name: 'No URL Server',
        transport: 'streamable-http',
        enabled: true,
        url: undefined,
      });
      (storage.getHealth as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const monitor = new McpHealthMonitor(storage, logger);
      const health = await monitor.checkServer('srv-2');

      expect(health.status).toBe('degraded');
      expect(health.lastError).toBe('No URL configured for remote server');
    });
  });

  describe('checkAll', () => {
    it('skips disabled servers', async () => {
      (storage.listServers as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'srv-enabled', name: 'Enabled', enabled: true, transport: 'stdio' },
        { id: 'srv-disabled', name: 'Disabled', enabled: false, transport: 'stdio' },
      ]);
      (storage.getServer as ReturnType<typeof vi.fn>).mockImplementation(async (id: string) => {
        if (id === 'srv-enabled') {
          return { id: 'srv-enabled', name: 'Enabled', transport: 'stdio', enabled: true };
        }
        return null;
      });
      (storage.loadTools as ReturnType<typeof vi.fn>).mockResolvedValue([{ name: 'tool1' }]);
      (storage.getHealth as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const monitor = new McpHealthMonitor(storage, logger);
      const results = await monitor.checkAll();

      // Only the enabled server should be checked
      expect(results).toHaveLength(1);
      expect(results[0].serverId).toBe('srv-enabled');
      expect(storage.getServer).not.toHaveBeenCalledWith('srv-disabled');
    });

    it('returns empty array when no servers exist', async () => {
      (storage.listServers as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const monitor = new McpHealthMonitor(storage, logger);
      const results = await monitor.checkAll();

      expect(results).toEqual([]);
    });
  });
});
