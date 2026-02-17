import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { z } from 'zod';
import { IntegrationStorage } from './storage.js';
import { IntegrationManager } from './manager.js';
import { MessageRouter } from './message-router.js';
import type { Integration, IntegrationDeps } from './types.js';
import type { IntegrationConfig, UnifiedMessage } from '@friday/shared';
import type { SecureLogger } from '../logging/logger.js';
import { setupTestDb, teardownTestDb, truncateAllTables } from '../test-setup.js';

// ── Helpers ──────────────────────────────────────────────────────

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

function createMockIntegration(overrides?: Partial<Integration>): Integration {
  return {
    platform: 'telegram',
    init: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue('msg_123'),
    isHealthy: vi.fn().mockReturnValue(true),
    ...overrides,
  };
}

beforeAll(async () => {
  await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

// ── IntegrationStorage Tests ─────────────────────────────────────

describe('IntegrationStorage', () => {
  let storage: IntegrationStorage;

  beforeEach(async () => {
    await truncateAllTables();
    storage = new IntegrationStorage();
  });

  describe('integration CRUD', () => {
    it('should create and retrieve an integration', async () => {
      const config = await storage.createIntegration({
        platform: 'telegram',
        displayName: 'My Telegram Bot',
        enabled: true,
        config: { botToken: 'test-token' },
      });

      expect(config.id).toBeDefined();
      expect(config.platform).toBe('telegram');
      expect(config.displayName).toBe('My Telegram Bot');
      expect(config.enabled).toBe(true);
      expect(config.status).toBe('disconnected');
      expect(config.config).toEqual({ botToken: 'test-token' });
      expect(config.messageCount).toBe(0);
    });

    it('should list integrations', async () => {
      await storage.createIntegration({
        platform: 'telegram',
        displayName: 'Bot 1',
        enabled: true,
        config: {},
      });
      await storage.createIntegration({
        platform: 'discord',
        displayName: 'Bot 2',
        enabled: false,
        config: {},
      });

      const all = await storage.listIntegrations();
      expect(all).toHaveLength(2);

      const telegram = await storage.listIntegrations({ platform: 'telegram' });
      expect(telegram).toHaveLength(1);
      expect(telegram[0].platform).toBe('telegram');

      const enabled = await storage.listIntegrations({ enabled: true });
      expect(enabled).toHaveLength(1);
    });

    it('should update an integration', async () => {
      const config = await storage.createIntegration({
        platform: 'telegram',
        displayName: 'Bot',
        enabled: false,
        config: {},
      });
      const updated = await storage.updateIntegration(config.id, {
        displayName: 'Updated Bot',
        enabled: true,
      });
      expect(updated).not.toBeNull();
      expect(updated!.displayName).toBe('Updated Bot');
      expect(updated!.enabled).toBe(true);
    });

    it('should delete an integration', async () => {
      const config = await storage.createIntegration({
        platform: 'telegram',
        displayName: 'Bot',
        enabled: false,
        config: {},
      });
      expect(await storage.deleteIntegration(config.id)).toBe(true);
      expect(await storage.getIntegration(config.id)).toBeNull();
    });

    it('should return null for non-existent integration', async () => {
      expect(await storage.getIntegration('non-existent')).toBeNull();
    });

    it('should return false when deleting non-existent', async () => {
      expect(await storage.deleteIntegration('non-existent')).toBe(false);
    });
  });

  describe('status updates', () => {
    it('should update status to connected', async () => {
      const config = await storage.createIntegration({
        platform: 'telegram',
        displayName: 'Bot',
        enabled: true,
        config: {},
      });
      await storage.updateStatus(config.id, 'connected');
      const updated = (await storage.getIntegration(config.id))!;
      expect(updated.status).toBe('connected');
      expect(updated.connectedAt).toBeDefined();
    });

    it('should update status with error message', async () => {
      const config = await storage.createIntegration({
        platform: 'telegram',
        displayName: 'Bot',
        enabled: true,
        config: {},
      });
      await storage.updateStatus(config.id, 'error', 'Connection timeout');
      const updated = (await storage.getIntegration(config.id))!;
      expect(updated.status).toBe('error');
      expect(updated.errorMessage).toBe('Connection timeout');
    });
  });

  describe('message storage', () => {
    it('should store and retrieve messages', async () => {
      const config = await storage.createIntegration({
        platform: 'telegram',
        displayName: 'Bot',
        enabled: true,
        config: {},
      });

      await storage.storeMessage({
        integrationId: config.id,
        platform: 'telegram',
        direction: 'inbound',
        senderId: 'user123',
        senderName: 'Test User',
        chatId: 'chat456',
        text: 'Hello!',
        attachments: [],
        metadata: {},
        timestamp: Date.now(),
      });

      const messages = await storage.listMessages(config.id);
      expect(messages).toHaveLength(1);
      expect(messages[0].text).toBe('Hello!');
      expect(messages[0].senderId).toBe('user123');
      expect(messages[0].direction).toBe('inbound');

      // Check message count incremented
      const updated = (await storage.getIntegration(config.id))!;
      expect(updated.messageCount).toBe(1);
    });

    it('should paginate messages', async () => {
      const config = await storage.createIntegration({
        platform: 'telegram',
        displayName: 'Bot',
        enabled: true,
        config: {},
      });

      for (let i = 0; i < 5; i++) {
        await storage.storeMessage({
          integrationId: config.id,
          platform: 'telegram',
          direction: 'inbound',
          senderId: 'user',
          senderName: 'User',
          chatId: 'chat',
          text: `Message ${i}`,
          attachments: [],
          metadata: {},
          timestamp: Date.now() + i,
        });
      }

      const page = await storage.listMessages(config.id, { limit: 2, offset: 0 });
      expect(page).toHaveLength(2);
    });

    it('should cascade delete messages when integration is deleted', async () => {
      const config = await storage.createIntegration({
        platform: 'telegram',
        displayName: 'Bot',
        enabled: true,
        config: {},
      });
      await storage.storeMessage({
        integrationId: config.id,
        platform: 'telegram',
        direction: 'inbound',
        senderId: 'user',
        senderName: 'User',
        chatId: 'chat',
        text: 'Hello',
        attachments: [],
        metadata: {},
        timestamp: Date.now(),
      });

      await storage.deleteIntegration(config.id);
      const messages = await storage.listMessages(config.id);
      expect(messages).toHaveLength(0);
    });
  });
});

// ── IntegrationManager Tests ─────────────────────────────────────

describe('IntegrationManager', () => {
  let storage: IntegrationStorage;
  let manager: IntegrationManager;
  const onMessage = vi.fn().mockResolvedValue(undefined);

  beforeEach(async () => {
    await truncateAllTables();
    storage = new IntegrationStorage();
    manager = new IntegrationManager(storage, {
      logger: noopLogger(),
      onMessage,
    });
  });

  it('should register platforms', () => {
    manager.registerPlatform('telegram', () => createMockIntegration());
    expect(manager.getAvailablePlatforms()).toContain('telegram');
  });

  it('should create integration only for registered platforms', async () => {
    await expect(
      manager.createIntegration({
        platform: 'telegram',
        displayName: 'Bot',
        enabled: true,
        config: {},
      })
    ).rejects.toThrow('not registered');

    manager.registerPlatform('telegram', () => createMockIntegration());
    const config = await manager.createIntegration({
      platform: 'telegram',
      displayName: 'Bot',
      enabled: true,
      config: {},
    });
    expect(config.id).toBeDefined();
  });

  it('should start and stop an integration', async () => {
    const mockIntegration = createMockIntegration();
    manager.registerPlatform('telegram', () => mockIntegration);
    const config = await manager.createIntegration({
      platform: 'telegram',
      displayName: 'Bot',
      enabled: true,
      config: {},
    });

    await manager.startIntegration(config.id);
    expect(mockIntegration.init).toHaveBeenCalled();
    expect(mockIntegration.start).toHaveBeenCalled();
    expect(manager.isRunning(config.id)).toBe(true);
    expect(manager.isHealthy(config.id)).toBe(true);

    await manager.stopIntegration(config.id);
    expect(mockIntegration.stop).toHaveBeenCalled();
    expect(manager.isRunning(config.id)).toBe(false);
  });

  it('should not start a disabled integration', async () => {
    manager.registerPlatform('telegram', () => createMockIntegration());
    const config = await manager.createIntegration({
      platform: 'telegram',
      displayName: 'Bot',
      enabled: false,
      config: {},
    });

    await expect(manager.startIntegration(config.id)).rejects.toThrow('disabled');
  });

  it('should handle start failure gracefully', async () => {
    const mockIntegration = createMockIntegration({
      start: vi.fn().mockRejectedValue(new Error('Connection failed')),
    });
    manager.registerPlatform('telegram', () => mockIntegration);
    const config = await manager.createIntegration({
      platform: 'telegram',
      displayName: 'Bot',
      enabled: true,
      config: {},
    });

    await expect(manager.startIntegration(config.id)).rejects.toThrow('Connection failed');
    expect(manager.isRunning(config.id)).toBe(false);

    // Status should be error
    const updated = (await manager.getIntegration(config.id))!;
    expect(updated.status).toBe('error');
    expect(updated.errorMessage).toBe('Connection failed');
  });

  it('should send messages through running integration', async () => {
    const mockIntegration = createMockIntegration();
    manager.registerPlatform('telegram', () => mockIntegration);
    const config = await manager.createIntegration({
      platform: 'telegram',
      displayName: 'Bot',
      enabled: true,
      config: {},
    });

    await manager.startIntegration(config.id);
    const msgId = await manager.sendMessage(config.id, 'chat123', 'Hello!');
    expect(msgId).toBe('msg_123');
    expect(mockIntegration.sendMessage).toHaveBeenCalledWith('chat123', 'Hello!', undefined);
  });

  it('should throw when sending to non-running integration', async () => {
    await expect(manager.sendMessage('non-existent', 'chat', 'hi')).rejects.toThrow('not running');
  });

  it('should delete and stop a running integration', async () => {
    const mockIntegration = createMockIntegration();
    manager.registerPlatform('telegram', () => mockIntegration);
    const config = await manager.createIntegration({
      platform: 'telegram',
      displayName: 'Bot',
      enabled: true,
      config: {},
    });

    await manager.startIntegration(config.id);
    await manager.deleteIntegration(config.id);
    // stopIntegration is called asynchronously inside deleteIntegration
    // Wait a tick for it to complete
    await new Promise((r) => setTimeout(r, 10));
    expect(manager.isRunning(config.id)).toBe(false);
    expect(await manager.getIntegration(config.id)).toBeNull();
  });

  it('should return adapter via getAdapter when running', async () => {
    const mockIntegration = createMockIntegration();
    manager.registerPlatform('telegram', () => mockIntegration);
    const config = await manager.createIntegration({
      platform: 'telegram',
      displayName: 'Bot',
      enabled: true,
      config: {},
    });

    expect(manager.getAdapter(config.id)).toBeNull();

    await manager.startIntegration(config.id);
    expect(manager.getAdapter(config.id)).toBe(mockIntegration);

    await manager.stopIntegration(config.id);
    expect(manager.getAdapter(config.id)).toBeNull();
  });

  it('should return null from getAdapter for unknown id', () => {
    expect(manager.getAdapter('non-existent')).toBeNull();
  });

  it('should report running count', async () => {
    manager.registerPlatform('telegram', () => createMockIntegration());
    const c1 = await manager.createIntegration({
      platform: 'telegram',
      displayName: 'Bot 1',
      enabled: true,
      config: {},
    });
    const c2 = await manager.createIntegration({
      platform: 'telegram',
      displayName: 'Bot 2',
      enabled: true,
      config: {},
    });

    await manager.startIntegration(c1.id);
    await manager.startIntegration(c2.id);
    expect(manager.getRunningCount()).toBe(2);

    await manager.stopAll();
    expect(manager.getRunningCount()).toBe(0);
  });

  // ── Zod config validation ──────────────────────────────────

  it('should accept valid config when schema is registered', async () => {
    const schema = z.object({ botToken: z.string().min(1), chatId: z.number() });
    manager.registerPlatform('telegram', () => createMockIntegration(), schema);

    const config = await manager.createIntegration({
      platform: 'telegram',
      displayName: 'Bot',
      enabled: true,
      config: { botToken: 'tok123', chatId: 42 },
    });
    expect(config.id).toBeDefined();
  });

  it('should reject invalid config with descriptive errors', async () => {
    const schema = z.object({ botToken: z.string().min(1), chatId: z.number() });
    manager.registerPlatform('telegram', () => createMockIntegration(), schema);

    await expect(
      manager.createIntegration({
        platform: 'telegram',
        displayName: 'Bot',
        enabled: true,
        config: { botToken: '', chatId: 'not-a-number' },
      })
    ).rejects.toThrow(/Invalid config.*telegram/);
  });

  it('should detect missing required fields', async () => {
    const schema = z.object({ botToken: z.string(), webhookUrl: z.string().url() });
    manager.registerPlatform('telegram', () => createMockIntegration(), schema);

    await expect(
      manager.createIntegration({
        platform: 'telegram',
        displayName: 'Bot',
        enabled: true,
        config: {},
      })
    ).rejects.toThrow(/Invalid config/);
  });

  it('should skip validation when no schema is registered', async () => {
    manager.registerPlatform('telegram', () => createMockIntegration());

    const config = await manager.createIntegration({
      platform: 'telegram',
      displayName: 'Bot',
      enabled: true,
      config: { anything: 'goes' },
    });
    expect(config.id).toBeDefined();
  });
});

// ── MessageRouter Tests ──────────────────────────────────────────

describe('MessageRouter', () => {
  let storage: IntegrationStorage;
  let integrationManager: IntegrationManager;
  let router: MessageRouter;
  const mockSubmit = vi.fn();
  const onMessage = vi.fn().mockResolvedValue(undefined);

  beforeEach(async () => {
    await truncateAllTables();
    storage = new IntegrationStorage();
    integrationManager = new IntegrationManager(storage, {
      logger: noopLogger(),
      onMessage,
    });

    mockSubmit.mockReset();
    mockSubmit.mockResolvedValue({
      id: 'task_1',
      status: 'pending',
      result: undefined,
    });

    router = new MessageRouter({
      logger: noopLogger(),
      taskExecutor: {
        submit: mockSubmit,
      } as any,
      integrationManager,
      integrationStorage: storage,
    });
  });

  it('should store inbound messages', async () => {
    const config = await storage.createIntegration({
      platform: 'telegram',
      displayName: 'Bot',
      enabled: true,
      config: {},
    });

    await router.handleInbound({
      id: 'msg_1',
      integrationId: config.id,
      platform: 'telegram',
      direction: 'inbound',
      senderId: 'user1',
      senderName: 'Test User',
      chatId: 'chat1',
      text: 'Hello bot!',
      attachments: [],
      metadata: {},
      timestamp: Date.now(),
    });

    const messages = await storage.listMessages(config.id);
    expect(messages).toHaveLength(1);
    expect(messages[0].text).toBe('Hello bot!');
  });

  it('should submit a task for inbound messages', async () => {
    const config = await storage.createIntegration({
      platform: 'telegram',
      displayName: 'Bot',
      enabled: true,
      config: {},
    });

    await router.handleInbound({
      id: 'msg_1',
      integrationId: config.id,
      platform: 'telegram',
      direction: 'inbound',
      senderId: 'user1',
      senderName: 'Test User',
      chatId: 'chat1',
      text: 'What is the weather?',
      attachments: [],
      metadata: {},
      timestamp: Date.now(),
    });

    expect(mockSubmit).toHaveBeenCalledTimes(1);
    expect(mockSubmit.mock.calls[0][0].type).toBe('query');
    expect(mockSubmit.mock.calls[0][0].description).toBe('What is the weather?');
  });

  it('should skip empty messages', async () => {
    const config = await storage.createIntegration({
      platform: 'telegram',
      displayName: 'Bot',
      enabled: true,
      config: {},
    });

    await router.handleInbound({
      id: 'msg_1',
      integrationId: config.id,
      platform: 'telegram',
      direction: 'inbound',
      senderId: 'user1',
      senderName: 'Test User',
      chatId: 'chat1',
      text: '   ',
      attachments: [],
      metadata: {},
      timestamp: Date.now(),
    });

    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('should handle task submission failure gracefully', async () => {
    const config = await storage.createIntegration({
      platform: 'telegram',
      displayName: 'Bot',
      enabled: true,
      config: {},
    });
    mockSubmit.mockRejectedValue(new Error('Task executor error'));

    // Should not throw
    await router.handleInbound({
      id: 'msg_1',
      integrationId: config.id,
      platform: 'telegram',
      direction: 'inbound',
      senderId: 'user1',
      senderName: 'Test User',
      chatId: 'chat1',
      text: 'Hello!',
      attachments: [],
      metadata: {},
      timestamp: Date.now(),
    });
  });
});
