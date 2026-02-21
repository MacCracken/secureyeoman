import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TeamsIntegration } from './adapter.js';
import type { IntegrationConfig, UnifiedMessage } from '@secureyeoman/shared';
import type { IntegrationDeps } from '../types.js';
import type { SecureLogger } from '../../logging/logger.js';

// ── Helpers ────────────────────────────────────────────────────────

function noopLogger(): SecureLogger {
  const noop = () => {};
  return {
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    child: () => noopLogger(),
    level: 'silent',
  } as SecureLogger;
}

function makeConfig(overrides: Partial<IntegrationConfig> = {}): IntegrationConfig {
  return {
    id: 'teams_int_1',
    platform: 'teams',
    displayName: 'Test Teams',
    enabled: true,
    status: 'disconnected',
    config: {
      botId: 'bot-app-id',
      botPassword: 'bot-secret',
      tenantId: 'tenant-123',
      serviceUrl: 'https://smba.trafficmanager.net/teams/',
    },
    messageCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeDeps(onMessage = vi.fn().mockResolvedValue(undefined)): IntegrationDeps {
  return { logger: noopLogger(), onMessage };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('TeamsIntegration', () => {
  let adapter: TeamsIntegration;

  beforeEach(() => {
    adapter = new TeamsIntegration();
    vi.clearAllMocks();
  });

  it('should have platform "teams"', () => {
    expect(adapter.platform).toBe('teams');
  });

  it('should not be healthy before init', () => {
    expect(adapter.isHealthy()).toBe(false);
  });

  describe('init()', () => {
    it('should initialize successfully with valid config', async () => {
      await expect(adapter.init(makeConfig(), makeDeps())).resolves.not.toThrow();
    });

    it('should throw when botId is missing', async () => {
      const cfg = makeConfig({ config: { botPassword: 'secret' } });
      await expect(adapter.init(cfg, makeDeps())).rejects.toThrow(
        'Teams integration requires botId and botPassword'
      );
    });

    it('should throw when botPassword is missing', async () => {
      const cfg = makeConfig({ config: { botId: 'bot-app-id' } });
      await expect(adapter.init(cfg, makeDeps())).rejects.toThrow(
        'Teams integration requires botId and botPassword'
      );
    });

    it('should throw when both botId and botPassword are missing', async () => {
      const cfg = makeConfig({ config: {} });
      await expect(adapter.init(cfg, makeDeps())).rejects.toThrow(
        'Teams integration requires botId and botPassword'
      );
    });
  });

  describe('start() / stop()', () => {
    it('should become healthy after start', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      expect(adapter.isHealthy()).toBe(true);
    });

    it('should be idempotent — calling start twice does not throw', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await expect(adapter.start()).resolves.not.toThrow();
      expect(adapter.isHealthy()).toBe(true);
    });

    it('should become unhealthy after stop', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await adapter.stop();
      expect(adapter.isHealthy()).toBe(false);
    });

    it('should be safe to call stop before start', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await expect(adapter.stop()).resolves.not.toThrow();
    });
  });

  describe('sendMessage()', () => {
    it('should return a message ID string with teams_ prefix', async () => {
      await adapter.init(makeConfig(), makeDeps());
      const id = await adapter.sendMessage('conv_abc', 'Hello Teams');
      expect(id).toMatch(/^teams_\d+$/);
    });

    it('should throw when serviceUrl is not configured', async () => {
      const cfg = makeConfig({ config: { botId: 'bot-app-id', botPassword: 'secret' } });
      await adapter.init(cfg, makeDeps());
      await expect(adapter.sendMessage('conv_abc', 'Hello')).rejects.toThrow(
        'Teams service URL not configured'
      );
    });
  });

  describe('handleBotFrameworkActivity()', () => {
    it('should call onMessage for a valid message activity', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));

      adapter.handleBotFrameworkActivity({
        type: 'message',
        id: 'activity_123',
        from: { id: 'user_1', name: 'Alice' },
        conversation: { id: 'conv_abc' },
        text: 'Hello from Teams',
        timestamp: '2024-01-01T12:00:00Z',
        serviceUrl: 'https://smba.trafficmanager.net/teams/',
        channelId: 'msteams',
      });

      expect(onMessage).toHaveBeenCalledOnce();
      const msg: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(msg.platform).toBe('teams');
      expect(msg.direction).toBe('inbound');
      expect(msg.senderId).toBe('user_1');
      expect(msg.senderName).toBe('Alice');
      expect(msg.chatId).toBe('conv_abc');
      expect(msg.text).toBe('Hello from Teams');
      expect(msg.integrationId).toBe('teams_int_1');
    });

    it('should ignore non-message activity types', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));

      adapter.handleBotFrameworkActivity({
        type: 'conversationUpdate',
        from: { id: 'user_1' },
        text: 'ignored',
      });

      expect(onMessage).not.toHaveBeenCalled();
    });

    it('should ignore activities missing from.id', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));

      adapter.handleBotFrameworkActivity({
        type: 'message',
        from: {},
        text: 'Hello',
      });

      expect(onMessage).not.toHaveBeenCalled();
    });

    it('should ignore activities missing text', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));

      adapter.handleBotFrameworkActivity({
        type: 'message',
        from: { id: 'user_1' },
        text: undefined,
      });

      expect(onMessage).not.toHaveBeenCalled();
    });

    it('should not throw if called before init', () => {
      expect(() => {
        adapter.handleBotFrameworkActivity({ type: 'message', from: { id: 'u1' }, text: 'hi' });
      }).not.toThrow();
    });
  });

  describe('isHealthy()', () => {
    it('should return false before start', async () => {
      await adapter.init(makeConfig(), makeDeps());
      expect(adapter.isHealthy()).toBe(false);
    });

    it('should return true after start', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      expect(adapter.isHealthy()).toBe(true);
    });

    it('should return false after stop', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await adapter.stop();
      expect(adapter.isHealthy()).toBe(false);
    });
  });
});
