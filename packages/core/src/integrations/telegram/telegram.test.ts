import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TelegramIntegration } from './adapter.js';
import type { IntegrationConfig, UnifiedMessage } from '@secureyeoman/shared';
import type { IntegrationDeps } from '../types.js';
import type { SecureLogger } from '../../logging/logger.js';

// ── Mock grammy ────────────────────────────────────────────────────

const mockSendMessage = vi.fn().mockResolvedValue({ message_id: 42 });
const mockStop = vi.fn();
const mockStart = vi.fn(({ onStart }: { onStart?: () => void } = {}) => {
  onStart?.();
});
const mockCatch = vi.fn();

const handlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock('grammy', () => {
  class MockBot {
    api = { sendMessage: mockSendMessage };
    command(cmd: string, handler: (...args: unknown[]) => unknown) {
      handlers.set(`command:${cmd}`, handler);
    }
    on(event: string, handler: (...args: unknown[]) => unknown) {
      handlers.set(event, handler);
    }
    catch = mockCatch;
    start = mockStart;
    stop = mockStop;
  }
  return { Bot: MockBot };
});

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

function createConfig(overrides?: Partial<IntegrationConfig>): IntegrationConfig {
  return {
    id: 'int_001',
    platform: 'telegram',
    displayName: 'Test Telegram Bot',
    enabled: true,
    status: 'disconnected',
    config: { botToken: 'test-bot-token-123' },
    messageCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function createDeps(overrides?: Partial<IntegrationDeps>): IntegrationDeps {
  return {
    logger: noopLogger(),
    onMessage: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('TelegramIntegration', () => {
  let adapter: TelegramIntegration;

  beforeEach(() => {
    adapter = new TelegramIntegration();
    handlers.clear();
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should have platform set to telegram', () => {
      expect(adapter.platform).toBe('telegram');
    });

    it('should not be healthy before init', () => {
      expect(adapter.isHealthy()).toBe(false);
    });
  });

  describe('init()', () => {
    it('should initialize successfully with valid config', async () => {
      await expect(adapter.init(createConfig(), createDeps())).resolves.not.toThrow();
    });

    it('should throw if botToken is missing', async () => {
      const config = createConfig({ config: {} });
      await expect(adapter.init(config, createDeps())).rejects.toThrow('botToken');
    });

    it('should register command handlers', async () => {
      await adapter.init(createConfig(), createDeps());
      expect(handlers.has('command:start')).toBe(true);
      expect(handlers.has('command:help')).toBe(true);
      expect(handlers.has('command:status')).toBe(true);
    });

    it('should register message:text handler', async () => {
      await adapter.init(createConfig(), createDeps());
      expect(handlers.has('message:text')).toBe(true);
    });

    it('should register error handler', async () => {
      await adapter.init(createConfig(), createDeps());
      expect(mockCatch).toHaveBeenCalledOnce();
    });
  });

  describe('start() / stop()', () => {
    it('should start polling', async () => {
      await adapter.init(createConfig(), createDeps());
      await adapter.start();
      expect(mockStart).toHaveBeenCalledOnce();
      expect(adapter.isHealthy()).toBe(true);
    });

    it('should throw if not initialized', async () => {
      await expect(adapter.start()).rejects.toThrow('not initialized');
    });

    it('should not start twice', async () => {
      await adapter.init(createConfig(), createDeps());
      await adapter.start();
      await adapter.start();
      expect(mockStart).toHaveBeenCalledOnce();
    });

    it('should stop polling', async () => {
      await adapter.init(createConfig(), createDeps());
      await adapter.start();
      await adapter.stop();
      expect(mockStop).toHaveBeenCalledOnce();
      expect(adapter.isHealthy()).toBe(false);
    });

    it('should be safe to call stop without start', async () => {
      await adapter.init(createConfig(), createDeps());
      await expect(adapter.stop()).resolves.not.toThrow();
    });
  });

  describe('sendMessage()', () => {
    it('should send a message and return the platform message ID', async () => {
      await adapter.init(createConfig(), createDeps());
      const id = await adapter.sendMessage('12345', 'Hello world');
      expect(mockSendMessage).toHaveBeenCalledWith(12345, 'Hello world', {
        parse_mode: 'Markdown',
      });
      expect(id).toBe('42');
    });

    it('should throw if not initialized', async () => {
      await expect(adapter.sendMessage('123', 'test')).rejects.toThrow('not initialized');
    });
  });

  describe('inbound message handling', () => {
    it('should normalize text messages and call onMessage', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(createConfig(), createDeps({ onMessage }));

      const handler = handlers.get('message:text') as (ctx: unknown) => Promise<void>;
      expect(handler).toBeDefined();

      const fakeCtx = {
        message: {
          message_id: 99,
          from: { id: 555, first_name: 'John', last_name: 'Doe', is_bot: false },
          chat: { id: 777, type: 'private' },
          text: 'Hello FRIDAY',
          date: 1700000000,
          reply_to_message: null,
        },
      };

      await handler(fakeCtx);

      expect(onMessage).toHaveBeenCalledOnce();
      const msg: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(msg.id).toBe('tg_99');
      expect(msg.platform).toBe('telegram');
      expect(msg.direction).toBe('inbound');
      expect(msg.senderId).toBe('555');
      expect(msg.senderName).toBe('John Doe');
      expect(msg.chatId).toBe('777');
      expect(msg.text).toBe('Hello FRIDAY');
      expect(msg.timestamp).toBe(1700000000000);
      expect(msg.metadata).toEqual({ chatType: 'private', isBot: false });
    });

    it('should skip command messages starting with /', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(createConfig(), createDeps({ onMessage }));

      const handler = handlers.get('message:text') as (ctx: unknown) => Promise<void>;
      const fakeCtx = {
        message: {
          message_id: 100,
          from: { id: 555, first_name: 'John' },
          chat: { id: 777, type: 'private' },
          text: '/unknown_command',
          date: 1700000000,
        },
      };

      await handler(fakeCtx);
      expect(onMessage).not.toHaveBeenCalled();
    });

    it('should handle messages with reply_to_message', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(createConfig(), createDeps({ onMessage }));

      const handler = handlers.get('message:text') as (ctx: unknown) => Promise<void>;
      const fakeCtx = {
        message: {
          message_id: 101,
          from: { id: 555, first_name: 'Jane' },
          chat: { id: 777, type: 'group' },
          text: 'Reply text',
          date: 1700000000,
          reply_to_message: { message_id: 50 },
        },
      };

      await handler(fakeCtx);
      const msg: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(msg.replyToMessageId).toBe('50');
    });
  });

  describe('command handlers', () => {
    it('/start should reply with welcome message', async () => {
      await adapter.init(createConfig(), createDeps());
      const handler = handlers.get('command:start') as (ctx: unknown) => Promise<void>;
      const reply = vi.fn().mockResolvedValue(undefined);
      await handler({ reply });
      expect(reply).toHaveBeenCalledOnce();
      expect(reply.mock.calls[0][0]).toContain('Test Telegram Bot');
    });

    it('/help should reply with commands list', async () => {
      await adapter.init(createConfig(), createDeps());
      const handler = handlers.get('command:help') as (ctx: unknown) => Promise<void>;
      const reply = vi.fn().mockResolvedValue(undefined);
      await handler({ reply });
      expect(reply).toHaveBeenCalledOnce();
      expect(reply.mock.calls[0][0]).toContain('/start');
      expect(reply.mock.calls[0][0]).toContain('/help');
      expect(reply.mock.calls[0][0]).toContain('/status');
    });

    it('/status should reply with agent info', async () => {
      await adapter.init(createConfig(), createDeps());
      const handler = handlers.get('command:status') as (ctx: unknown) => Promise<void>;
      const reply = vi.fn().mockResolvedValue(undefined);
      await handler({ reply });
      expect(reply).toHaveBeenCalledOnce();
      expect(reply.mock.calls[0][0]).toContain('Telegram');
      expect(reply.mock.calls[0][0]).toContain('Connected');
    });
  });

  describe('isHealthy()', () => {
    it('should return false before start', async () => {
      await adapter.init(createConfig(), createDeps());
      expect(adapter.isHealthy()).toBe(false);
    });

    it('should return true after start', async () => {
      await adapter.init(createConfig(), createDeps());
      await adapter.start();
      expect(adapter.isHealthy()).toBe(true);
    });

    it('should return false after stop', async () => {
      await adapter.init(createConfig(), createDeps());
      await adapter.start();
      await adapter.stop();
      expect(adapter.isHealthy()).toBe(false);
    });
  });
});
