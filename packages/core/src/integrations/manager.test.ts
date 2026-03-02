import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { IntegrationManager } from './manager.js';

const makeLogger = () => ({
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn().mockReturnThis(),
  level: 'info',
});

const CONFIG = {
  id: 'int-1',
  platform: 'slack',
  displayName: 'Slack',
  enabled: true,
  config: {},
  createdAt: 1000,
  updatedAt: 1000,
  status: 'disconnected',
};

function makeStorage(overrides: any = {}) {
  return {
    createIntegration: vi.fn().mockResolvedValue(CONFIG),
    getIntegration: vi.fn().mockResolvedValue(CONFIG),
    listIntegrations: vi.fn().mockResolvedValue([CONFIG]),
    updateIntegration: vi.fn().mockResolvedValue(CONFIG),
    deleteIntegration: vi.fn().mockResolvedValue(true),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    storeMessage: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
    ...overrides,
  };
}

function makeIntegration(overrides: any = {}) {
  return {
    init: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    isHealthy: vi.fn().mockReturnValue(true),
    sendMessage: vi.fn().mockResolvedValue('msg-id-1'),
    platformRateLimit: null,
    ...overrides,
  };
}

function makeManager(storageOverrides: any = {}, reconnectConfig?: any) {
  const storage = makeStorage(storageOverrides);
  const logger = makeLogger();
  const onMessage = vi.fn();
  const deps = { logger: logger as any, onMessage };
  const manager = new IntegrationManager(storage as any, deps, reconnectConfig);
  return { manager, storage, logger, onMessage };
}

describe('IntegrationManager', () => {
  describe('registerPlatform / getAvailablePlatforms', () => {
    it('registers a platform and returns it in available list', () => {
      const { manager } = makeManager();
      const factory = () => makeIntegration() as any;
      manager.registerPlatform('slack' as any, factory);
      expect(manager.getAvailablePlatforms()).toContain('slack');
    });

    it('starts with empty available platforms', () => {
      const { manager } = makeManager();
      expect(manager.getAvailablePlatforms()).toHaveLength(0);
    });
  });

  describe('createIntegration', () => {
    it('throws when platform not registered', async () => {
      const { manager } = makeManager();
      await expect(
        manager.createIntegration({ platform: 'slack', displayName: 'S', config: {} } as any)
      ).rejects.toThrow('Platform "slack" is not registered');
    });

    it('creates integration when platform is registered', async () => {
      const { manager, storage } = makeManager();
      manager.registerPlatform('slack' as any, () => makeIntegration() as any);
      await manager.createIntegration({ platform: 'slack', displayName: 'S', config: {} } as any);
      expect(storage.createIntegration).toHaveBeenCalled();
    });

    it('validates config against schema when registered', async () => {
      const { manager } = makeManager();
      const schema = {
        safeParse: vi.fn().mockReturnValue({
          success: false,
          error: { errors: [{ path: ['token'], message: 'Required' }] },
        }),
      };
      manager.registerPlatform('slack' as any, () => makeIntegration() as any, schema as any);
      await expect(
        manager.createIntegration({ platform: 'slack', displayName: 'S', config: {} } as any)
      ).rejects.toThrow('Invalid config for platform "slack"');
    });
  });

  describe('getIntegration / listIntegrations / updateIntegration', () => {
    it('getIntegration delegates to storage', async () => {
      const { manager } = makeManager();
      const config = await manager.getIntegration('int-1');
      expect(config?.id).toBe('int-1');
    });

    it('listIntegrations delegates to storage', async () => {
      const { manager } = makeManager();
      const configs = await manager.listIntegrations();
      expect(configs).toHaveLength(1);
    });

    it('updateIntegration delegates to storage', async () => {
      const { manager, storage } = makeManager();
      await manager.updateIntegration('int-1', { displayName: 'Updated' });
      expect(storage.updateIntegration).toHaveBeenCalledWith('int-1', { displayName: 'Updated' });
    });
  });

  describe('deleteIntegration', () => {
    it('deletes integration when not running', async () => {
      const { manager, storage } = makeManager();
      const result = await manager.deleteIntegration('int-1');
      expect(result).toBe(true);
      expect(storage.deleteIntegration).toHaveBeenCalledWith('int-1');
    });
  });

  describe('startIntegration', () => {
    it('throws when integration not found', async () => {
      const { manager } = makeManager({ getIntegration: vi.fn().mockResolvedValue(null) });
      await expect(manager.startIntegration('missing')).rejects.toThrow(
        'Integration missing not found'
      );
    });

    it('throws when integration is disabled', async () => {
      const { manager } = makeManager({
        getIntegration: vi.fn().mockResolvedValue({ ...CONFIG, enabled: false }),
      });
      await expect(manager.startIntegration('int-1')).rejects.toThrow(
        'Integration int-1 is disabled'
      );
    });

    it('throws when no adapter registered for platform', async () => {
      const { manager } = makeManager();
      await expect(manager.startIntegration('int-1')).rejects.toThrow(
        'No adapter registered for platform "slack"'
      );
    });

    it('starts integration successfully', async () => {
      const { manager, storage, logger } = makeManager();
      const integration = makeIntegration();
      manager.registerPlatform('slack' as any, () => integration as any);
      await manager.startIntegration('int-1');
      expect(integration.init).toHaveBeenCalled();
      expect(integration.start).toHaveBeenCalled();
      expect(storage.updateStatus).toHaveBeenCalledWith('int-1', 'connected');
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Integration started'));
    });

    it('warns and returns when already running', async () => {
      const { manager, logger } = makeManager();
      const integration = makeIntegration();
      manager.registerPlatform('slack' as any, () => integration as any);
      await manager.startIntegration('int-1');
      await manager.startIntegration('int-1'); // second call
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('already running'));
    });

    it('records error status when start fails', async () => {
      const { manager, storage } = makeManager();
      const integration = makeIntegration({
        start: vi.fn().mockRejectedValue(new Error('connection refused')),
      });
      manager.registerPlatform('slack' as any, () => integration as any);
      await expect(manager.startIntegration('int-1')).rejects.toThrow('connection refused');
      expect(storage.updateStatus).toHaveBeenCalledWith('int-1', 'error', 'connection refused');
    });
  });

  describe('stopIntegration', () => {
    it('does nothing when integration not running', async () => {
      const { manager, storage } = makeManager();
      await manager.stopIntegration('not-running');
      expect(storage.updateStatus).not.toHaveBeenCalled();
    });

    it('stops running integration', async () => {
      const { manager, storage } = makeManager();
      const integration = makeIntegration();
      manager.registerPlatform('slack' as any, () => integration as any);
      await manager.startIntegration('int-1');
      await manager.stopIntegration('int-1');
      expect(integration.stop).toHaveBeenCalled();
      expect(storage.updateStatus).toHaveBeenCalledWith('int-1', 'disconnected');
    });
  });

  describe('startAll / stopAll', () => {
    it('startAll starts all enabled integrations', async () => {
      const { manager, storage } = makeManager();
      const integration = makeIntegration();
      manager.registerPlatform('slack' as any, () => integration as any);
      await manager.startAll();
      expect(storage.listIntegrations).toHaveBeenCalledWith({ enabled: true });
      expect(integration.start).toHaveBeenCalled();
    });

    it('stopAll stops all running integrations', async () => {
      const { manager } = makeManager();
      const integration = makeIntegration();
      manager.registerPlatform('slack' as any, () => integration as any);
      await manager.startIntegration('int-1');
      expect(manager.getRunningCount()).toBe(1);
      await manager.stopAll();
      expect(manager.getRunningCount()).toBe(0);
    });
  });

  describe('isRunning / isHealthy / getRunningCount / getAdapter', () => {
    it('isRunning returns false for stopped integration', () => {
      const { manager } = makeManager();
      expect(manager.isRunning('int-1')).toBe(false);
    });

    it('isRunning returns true for running integration', async () => {
      const { manager } = makeManager();
      manager.registerPlatform('slack' as any, () => makeIntegration() as any);
      await manager.startIntegration('int-1');
      expect(manager.isRunning('int-1')).toBe(true);
    });

    it('isHealthy returns false for non-running integration', () => {
      const { manager } = makeManager();
      expect(manager.isHealthy('int-1')).toBe(false);
    });

    it('getRunningCount returns count of running integrations', async () => {
      const { manager } = makeManager();
      manager.registerPlatform('slack' as any, () => makeIntegration() as any);
      await manager.startIntegration('int-1');
      expect(manager.getRunningCount()).toBe(1);
    });

    it('getAdapter returns null for non-running integration', () => {
      const { manager } = makeManager();
      expect(manager.getAdapter('int-1')).toBeNull();
    });

    it('getAdapter returns adapter for running integration', async () => {
      const { manager } = makeManager();
      const integration = makeIntegration();
      manager.registerPlatform('slack' as any, () => integration as any);
      await manager.startIntegration('int-1');
      expect(manager.getAdapter('int-1')).toBe(integration);
    });
  });

  describe('sendMessage', () => {
    it('throws when integration not running', async () => {
      const { manager } = makeManager();
      await expect(manager.sendMessage('int-1', 'chat-1', 'Hello')).rejects.toThrow('not running');
    });

    it('sends message and stores it', async () => {
      const { manager, storage } = makeManager();
      const integration = makeIntegration();
      manager.registerPlatform('slack' as any, () => integration as any);
      await manager.startIntegration('int-1');
      const msgId = await manager.sendMessage('int-1', 'chat-1', 'Hello');
      expect(msgId).toBe('msg-id-1');
      expect(storage.storeMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          integrationId: 'int-1',
          chatId: 'chat-1',
          text: 'Hello',
          direction: 'outbound',
        })
      );
    });
  });

  describe('plugin loader', () => {
    it('getLoadedPlugins returns empty when no loader', () => {
      const { manager } = makeManager();
      expect(manager.getLoadedPlugins()).toEqual([]);
    });

    it('getLoadedPlugins delegates to plugin loader', () => {
      const { manager } = makeManager();
      const plugin = { platform: 'slack', version: '1.0.0', factory: vi.fn() };
      const loader = { getPlugins: vi.fn().mockReturnValue([plugin]), loadPlugin: vi.fn() };
      manager.setPluginLoader(loader as any);
      expect(manager.getLoadedPlugins()).toHaveLength(1);
    });

    it('loadPlugin throws when no loader configured', async () => {
      const { manager } = makeManager();
      await expect(manager.loadPlugin('/path/to/plugin.js')).rejects.toThrow(
        'No plugin loader configured'
      );
    });
  });

  describe('health checks', () => {
    it('runHealthChecks marks unhealthy integrations', async () => {
      const { manager, logger } = makeManager();
      // Use an integration that is healthy on start but unhealthy on check,
      // and will become healthy again on reconnect attempt (new factory instance)
      let startCount = 0;
      const makeHealthyIntegration = () =>
        makeIntegration({
          isHealthy: vi.fn().mockReturnValue(true),
        }) as any;
      const unhealthyIntegration = makeIntegration({ isHealthy: vi.fn().mockReturnValue(false) });
      manager.registerPlatform('slack' as any, () => {
        startCount++;
        return startCount === 1 ? (unhealthyIntegration as any) : makeHealthyIntegration();
      });
      await manager.startIntegration('int-1');
      await manager.runHealthChecks();
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('unhealthy'));
    });

    it('startHealthChecks / stopHealthChecks do not throw', () => {
      const { manager } = makeManager();
      vi.useFakeTimers();
      try {
        expect(() => manager.startHealthChecks()).not.toThrow();
        expect(() => manager.stopHealthChecks()).not.toThrow();
      } finally {
        vi.useRealTimers();
      }
    });

    it('startHealthChecks is idempotent', () => {
      const { manager } = makeManager();
      vi.useFakeTimers();
      try {
        manager.startHealthChecks();
        manager.startHealthChecks(); // second call should be no-op
        manager.stopHealthChecks();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('close', () => {
    it('stops health checks and all integrations', async () => {
      const { manager, storage } = makeManager();
      manager.registerPlatform('slack' as any, () => makeIntegration() as any);
      await manager.startIntegration('int-1');
      await manager.close();
      expect(storage.close).toHaveBeenCalled();
      expect(manager.getRunningCount()).toBe(0);
    });
  });

  // ── Error Path & Lifecycle Tests ──────────────────────────────────

  describe('stopIntegration — error handling', () => {
    it('logs error but does not throw when adapter.stop() rejects', async () => {
      const { manager, storage, logger } = makeManager();
      const integration = makeIntegration({
        stop: vi.fn().mockRejectedValue(new Error('cleanup failed')),
      });
      manager.registerPlatform('slack' as any, () => integration as any);
      await manager.startIntegration('int-1');

      // Should not throw
      await expect(manager.stopIntegration('int-1')).resolves.not.toThrow();

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('cleanup failed')
      );
      // Still removes from registry and marks disconnected
      expect(manager.isRunning('int-1')).toBe(false);
      expect(storage.updateStatus).toHaveBeenCalledWith('int-1', 'disconnected');
    });

    it('logs error when adapter.stop() throws a non-Error value', async () => {
      const { manager, logger } = makeManager();
      const integration = makeIntegration({
        stop: vi.fn().mockRejectedValue('string error'),
      });
      manager.registerPlatform('slack' as any, () => integration as any);
      await manager.startIntegration('int-1');

      await manager.stopIntegration('int-1');

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('string error')
      );
    });
  });

  describe('startIntegration — init failure', () => {
    it('records error status when init() fails', async () => {
      const { manager, storage } = makeManager();
      const integration = makeIntegration({
        init: vi.fn().mockRejectedValue(new Error('bad credentials')),
      });
      manager.registerPlatform('slack' as any, () => integration as any);

      await expect(manager.startIntegration('int-1')).rejects.toThrow('bad credentials');
      expect(storage.updateStatus).toHaveBeenCalledWith('int-1', 'error', 'bad credentials');
    });

    it('records error status for non-Error thrown values', async () => {
      const { manager, storage } = makeManager();
      const integration = makeIntegration({
        init: vi.fn().mockRejectedValue(42),
      });
      manager.registerPlatform('slack' as any, () => integration as any);

      await expect(manager.startIntegration('int-1')).rejects.toBe(42);
      expect(storage.updateStatus).toHaveBeenCalledWith('int-1', 'error', '42');
    });
  });

  describe('sendMessage — error propagation', () => {
    it('propagates adapter sendMessage rejection', async () => {
      const { manager } = makeManager();
      const integration = makeIntegration({
        sendMessage: vi.fn().mockRejectedValue(new Error('API timeout')),
      });
      manager.registerPlatform('slack' as any, () => integration as any);
      await manager.startIntegration('int-1');

      await expect(manager.sendMessage('int-1', 'chat-1', 'Hello')).rejects.toThrow('API timeout');
    });

    it('does not store message when adapter sendMessage fails', async () => {
      const { manager, storage } = makeManager();
      const integration = makeIntegration({
        sendMessage: vi.fn().mockRejectedValue(new Error('send failed')),
      });
      manager.registerPlatform('slack' as any, () => integration as any);
      await manager.startIntegration('int-1');

      await expect(manager.sendMessage('int-1', 'chat-1', 'Hi')).rejects.toThrow();
      expect(storage.storeMessage).not.toHaveBeenCalled();
    });
  });

  describe('sendMessage — rate limiting', () => {
    it('throws rate limit error when bucket is exhausted', async () => {
      const { manager } = makeManager();
      const integration = makeIntegration({
        platformRateLimit: { maxPerSecond: 1 },
      });
      manager.registerPlatform('slack' as any, () => integration as any);
      await manager.startIntegration('int-1');

      // First message should succeed (bucket starts with 1 token)
      await manager.sendMessage('int-1', 'chat-1', 'msg1');

      // Second message should be rate-limited (no tokens remain)
      await expect(manager.sendMessage('int-1', 'chat-1', 'msg2')).rejects.toThrow(
        'Rate limit exceeded'
      );
    });

    it('rate limit error includes platform name', async () => {
      const { manager } = makeManager();
      const integration = makeIntegration({
        platformRateLimit: { maxPerSecond: 1 },
      });
      manager.registerPlatform('slack' as any, () => integration as any);
      await manager.startIntegration('int-1');
      await manager.sendMessage('int-1', 'c', 'm1');

      await expect(manager.sendMessage('int-1', 'c', 'm2')).rejects.toThrow('slack');
    });

    it('falls back to DEFAULT_RATE_LIMITS when adapter has no platformRateLimit', async () => {
      const { manager } = makeManager();
      // null platformRateLimit → falls back to DEFAULT_RATE_LIMITS['slack'] = { maxPerSecond: 1 }
      const integration = makeIntegration({ platformRateLimit: null });
      manager.registerPlatform('slack' as any, () => integration as any);
      await manager.startIntegration('int-1');

      // slack default is 1/s, so first message succeeds
      await manager.sendMessage('int-1', 'c', 'm1');
      // second should be rate-limited
      await expect(manager.sendMessage('int-1', 'c', 'm2')).rejects.toThrow('Rate limit exceeded');
    });
  });

  describe('auto-reconnect — reconnect failure path', () => {
    it('removes integration from registry when reconnect fails', async () => {
      const { manager, storage, logger } = makeManager(
        {},
        { maxRetries: 5, baseDelayMs: 0, healthCheckIntervalMs: 100_000 }
      );

      let callCount = 0;
      manager.registerPlatform('slack' as any, () => {
        callCount++;
        if (callCount === 1) {
          // First instance starts fine but will be unhealthy when checked
          return makeIntegration({ isHealthy: vi.fn().mockReturnValue(false) }) as any;
        }
        // Reconnect instance fails to start
        return makeIntegration({
          start: vi.fn().mockRejectedValue(new Error('still down')),
        }) as any;
      });

      await manager.startIntegration('int-1');
      expect(manager.isRunning('int-1')).toBe(true);

      // Health check finds unhealthy, attempts reconnect which fails
      await manager.runHealthChecks();

      // Integration should be removed from registry since reconnect failed
      expect(manager.isRunning('int-1')).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('reconnect attempt'));
      expect(storage.updateStatus).toHaveBeenCalledWith('int-1', 'error', 'still down');
    });

    it('reconnect stop errors are silently ignored', async () => {
      const { manager } = makeManager(
        {},
        { maxRetries: 5, baseDelayMs: 0, healthCheckIntervalMs: 100_000 }
      );

      let callCount = 0;
      manager.registerPlatform('slack' as any, () => {
        callCount++;
        if (callCount === 1) {
          return makeIntegration({
            isHealthy: vi.fn().mockReturnValue(false),
            stop: vi.fn().mockRejectedValue(new Error('stop failed')),
          }) as any;
        }
        return makeIntegration() as any;
      });

      await manager.startIntegration('int-1');

      // Should not throw even though stop() fails during reconnect
      await expect(manager.runHealthChecks()).resolves.not.toThrow();
      // Reconnect succeeded with new instance
      expect(manager.isRunning('int-1')).toBe(true);
    });

    it('successful reconnect logs the attempt count', async () => {
      const { manager, logger } = makeManager(
        {},
        { maxRetries: 5, baseDelayMs: 0, healthCheckIntervalMs: 100_000 }
      );

      let callCount = 0;
      manager.registerPlatform('slack' as any, () => {
        callCount++;
        if (callCount === 1) {
          return makeIntegration({ isHealthy: vi.fn().mockReturnValue(false) }) as any;
        }
        return makeIntegration() as any;
      });

      await manager.startIntegration('int-1');
      await manager.runHealthChecks();

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('reconnected after 1 attempt')
      );
    });
  });

  describe('auto-reconnect — backoff timing', () => {
    it('does not retry before the backoff delay has elapsed', async () => {
      vi.useFakeTimers();
      try {
        const { manager } = makeManager(
          {},
          { maxRetries: 5, baseDelayMs: 10_000, healthCheckIntervalMs: 100_000 }
        );

        let callCount = 0;
        const startMock = vi.fn().mockRejectedValue(new Error('still down'));
        manager.registerPlatform('slack' as any, () => {
          callCount++;
          if (callCount === 1) {
            return makeIntegration({ isHealthy: vi.fn().mockReturnValue(false) }) as any;
          }
          return makeIntegration({ start: startMock }) as any;
        });

        await manager.startIntegration('int-1');
        startMock.mockClear();

        // First health check triggers reconnect attempt 1
        await manager.runHealthChecks();
        expect(startMock).toHaveBeenCalledTimes(1);
        startMock.mockClear();

        // Running health checks immediately should NOT retry (backoff not elapsed)
        await manager.runHealthChecks();
        expect(startMock).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('startAll — partial failure', () => {
    it('continues starting other integrations when one fails', async () => {
      const config2 = { ...CONFIG, id: 'int-2', displayName: 'Slack 2' };
      const { manager, storage, logger } = makeManager({
        listIntegrations: vi.fn().mockResolvedValue([CONFIG, config2]),
        getIntegration: vi.fn().mockImplementation((id: string) => {
          if (id === 'int-1') return CONFIG;
          if (id === 'int-2') return config2;
          return null;
        }),
      });

      let callCount = 0;
      manager.registerPlatform('slack' as any, () => {
        callCount++;
        if (callCount === 1) {
          return makeIntegration({
            start: vi.fn().mockRejectedValue(new Error('first fails')),
          }) as any;
        }
        return makeIntegration() as any;
      });

      await manager.startAll();

      // First failed, second succeeded
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to auto-start')
      );
      expect(manager.isRunning('int-2')).toBe(true);
    });
  });

  describe('reloadIntegration', () => {
    it('stops and restarts a running integration', async () => {
      const { manager, storage } = makeManager();
      const integration1 = makeIntegration();
      const integration2 = makeIntegration();
      let callCount = 0;
      manager.registerPlatform('slack' as any, () => {
        callCount++;
        return (callCount === 1 ? integration1 : integration2) as any;
      });

      await manager.startIntegration('int-1');
      expect(integration1.start).toHaveBeenCalled();

      await manager.reloadIntegration('int-1');
      expect(integration1.stop).toHaveBeenCalled();
      expect(integration2.start).toHaveBeenCalled();
      expect(manager.isRunning('int-1')).toBe(true);
    });

    it('throws when integration does not exist', async () => {
      const { manager } = makeManager({
        getIntegration: vi.fn().mockResolvedValue(null),
      });
      await expect(manager.reloadIntegration('missing')).rejects.toThrow('not found');
    });
  });

  describe('getAdaptersByPlatform', () => {
    it('returns all adapters matching the given platform', async () => {
      const config2 = { ...CONFIG, id: 'int-2', displayName: 'Slack 2' };
      const { manager } = makeManager({
        getIntegration: vi.fn().mockImplementation((id: string) => {
          if (id === 'int-1') return CONFIG;
          if (id === 'int-2') return config2;
          return null;
        }),
      });

      const i1 = makeIntegration();
      const i2 = makeIntegration();
      let callCount = 0;
      manager.registerPlatform('slack' as any, () => {
        callCount++;
        return (callCount === 1 ? i1 : i2) as any;
      });

      await manager.startIntegration('int-1');
      await manager.startIntegration('int-2');

      const adapters = manager.getAdaptersByPlatform('slack');
      expect(adapters).toHaveLength(2);
    });

    it('returns empty array when no adapters match', () => {
      const { manager } = makeManager();
      expect(manager.getAdaptersByPlatform('discord')).toEqual([]);
    });
  });

  describe('deleteIntegration — stops running integration', () => {
    it('stops a running integration before deleting', async () => {
      const { manager, storage } = makeManager();
      const integration = makeIntegration();
      manager.registerPlatform('slack' as any, () => integration as any);
      await manager.startIntegration('int-1');

      const result = await manager.deleteIntegration('int-1');
      expect(result).toBe(true);
      expect(storage.deleteIntegration).toHaveBeenCalledWith('int-1');
    });
  });

  describe('outbound webhook dispatcher', () => {
    it('dispatches integration.started event on successful start', async () => {
      const { manager } = makeManager();
      const dispatcher = { dispatch: vi.fn() };
      manager.setOutboundWebhookDispatcher(dispatcher as any);
      manager.registerPlatform('slack' as any, () => makeIntegration() as any);

      await manager.startIntegration('int-1');

      expect(dispatcher.dispatch).toHaveBeenCalledWith(
        'integration.started',
        expect.objectContaining({ integrationId: 'int-1', platform: 'slack' })
      );
    });

    it('dispatches integration.error event on start failure', async () => {
      const { manager } = makeManager();
      const dispatcher = { dispatch: vi.fn() };
      manager.setOutboundWebhookDispatcher(dispatcher as any);
      manager.registerPlatform(
        'slack' as any,
        () => makeIntegration({ start: vi.fn().mockRejectedValue(new Error('boom')) }) as any
      );

      await expect(manager.startIntegration('int-1')).rejects.toThrow('boom');

      expect(dispatcher.dispatch).toHaveBeenCalledWith(
        'integration.error',
        expect.objectContaining({ integrationId: 'int-1', error: 'boom' })
      );
    });

    it('dispatches integration.stopped event on stop', async () => {
      const { manager } = makeManager();
      const dispatcher = { dispatch: vi.fn() };
      manager.setOutboundWebhookDispatcher(dispatcher as any);
      manager.registerPlatform('slack' as any, () => makeIntegration() as any);

      await manager.startIntegration('int-1');
      await manager.stopIntegration('int-1');

      expect(dispatcher.dispatch).toHaveBeenCalledWith(
        'integration.stopped',
        expect.objectContaining({ integrationId: 'int-1', platform: 'slack' })
      );
    });

    it('dispatches message.outbound event on sendMessage', async () => {
      const { manager } = makeManager();
      const dispatcher = { dispatch: vi.fn() };
      manager.setOutboundWebhookDispatcher(dispatcher as any);
      manager.registerPlatform('slack' as any, () => makeIntegration() as any);

      await manager.startIntegration('int-1');
      await manager.sendMessage('int-1', 'chat-1', 'Hello');

      expect(dispatcher.dispatch).toHaveBeenCalledWith(
        'message.outbound',
        expect.objectContaining({
          integrationId: 'int-1',
          chatId: 'chat-1',
          text: 'Hello',
          platformMessageId: 'msg-id-1',
        })
      );
    });
  });

  describe('getOAuthTokens', () => {
    it('returns empty array when no oauth service configured', async () => {
      const { manager } = makeManager();
      const tokens = await manager.getOAuthTokens();
      expect(tokens).toEqual([]);
    });

    it('returns mapped tokens from oauth service', async () => {
      const storage = makeStorage();
      const logger = makeLogger();
      const oauthTokenService = {
        listTokens: vi.fn().mockResolvedValue([
          { id: 't1', provider: 'google', email: 'user@example.com', accessToken: 'secret' },
        ]),
      };
      const deps = { logger: logger as any, onMessage: vi.fn(), oauthTokenService };
      const manager = new IntegrationManager(storage as any, deps as any);

      const tokens = await manager.getOAuthTokens();
      expect(tokens).toEqual([{ id: 't1', provider: 'google', email: 'user@example.com' }]);
    });
  });

  describe('setMultimodalManager / setOAuthTokenService', () => {
    it('setMultimodalManager updates deps without throwing', () => {
      const { manager } = makeManager();
      expect(() => manager.setMultimodalManager(null)).not.toThrow();
    });

    it('setOAuthTokenService updates deps without throwing', () => {
      const { manager } = makeManager();
      expect(() => manager.setOAuthTokenService(null)).not.toThrow();
    });
  });
});
