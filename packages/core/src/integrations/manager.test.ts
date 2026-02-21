import { describe, it, expect, vi, afterEach } from 'vitest';
import { IntegrationManager } from './manager.js';

const makeLogger = () => ({
  info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(),
  trace: vi.fn(), fatal: vi.fn(), child: vi.fn().mockReturnThis(), level: 'info',
});

const CONFIG = {
  id: 'int-1', platform: 'slack', displayName: 'Slack', enabled: true,
  config: {}, createdAt: 1000, updatedAt: 1000, status: 'disconnected',
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

function makeManager(storageOverrides: any = {}) {
  const storage = makeStorage(storageOverrides);
  const logger = makeLogger();
  const onMessage = vi.fn();
  const deps = { logger: logger as any, onMessage };
  const manager = new IntegrationManager(storage as any, deps);
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
      await expect(manager.createIntegration({ platform: 'slack', displayName: 'S', config: {} } as any))
        .rejects.toThrow('Platform "slack" is not registered');
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
      await expect(manager.createIntegration({ platform: 'slack', displayName: 'S', config: {} } as any))
        .rejects.toThrow('Invalid config for platform "slack"');
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
      await expect(manager.startIntegration('missing')).rejects.toThrow('Integration missing not found');
    });

    it('throws when integration is disabled', async () => {
      const { manager } = makeManager({ getIntegration: vi.fn().mockResolvedValue({ ...CONFIG, enabled: false }) });
      await expect(manager.startIntegration('int-1')).rejects.toThrow('Integration int-1 is disabled');
    });

    it('throws when no adapter registered for platform', async () => {
      const { manager } = makeManager();
      await expect(manager.startIntegration('int-1')).rejects.toThrow('No adapter registered for platform "slack"');
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
      const integration = makeIntegration({ start: vi.fn().mockRejectedValue(new Error('connection refused')) });
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
        expect.objectContaining({ integrationId: 'int-1', chatId: 'chat-1', text: 'Hello', direction: 'outbound' })
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
      await expect(manager.loadPlugin('/path/to/plugin.js')).rejects.toThrow('No plugin loader configured');
    });
  });

  describe('health checks', () => {
    it('runHealthChecks marks unhealthy integrations', async () => {
      const { manager, logger } = makeManager();
      // Use an integration that is healthy on start but unhealthy on check,
      // and will become healthy again on reconnect attempt (new factory instance)
      let startCount = 0;
      const makeHealthyIntegration = () => makeIntegration({
        isHealthy: vi.fn().mockReturnValue(true),
      }) as any;
      const unhealthyIntegration = makeIntegration({ isHealthy: vi.fn().mockReturnValue(false) });
      manager.registerPlatform('slack' as any, () => {
        startCount++;
        return startCount === 1 ? unhealthyIntegration as any : makeHealthyIntegration();
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
});
