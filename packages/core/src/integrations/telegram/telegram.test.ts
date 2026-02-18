import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TelegramIntegration } from './adapter.js';
import type { IntegrationConfig, UnifiedMessage } from '@secureyeoman/shared';
import type { IntegrationDeps } from '../types.js';
import type { SecureLogger } from '../../logging/logger.js';

// ── Mock grammy ────────────────────────────────────────────────────

const mockSendMessage = vi.fn().mockResolvedValue({ message_id: 42 });
const mockSendVoice = vi.fn().mockResolvedValue({ message_id: 43 });
const mockStop = vi.fn();
const mockStart = vi.fn(({ onStart }: { onStart?: () => void } = {}) => {
  onStart?.();
});
const mockCatch = vi.fn();

const handlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock('grammy', () => {
  class MockBot {
    api = { sendMessage: mockSendMessage, sendVoice: mockSendVoice };
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

    it('should register callback_query:data handler', async () => {
      await adapter.init(createConfig(), createDeps());
      expect(handlers.has('callback_query:data')).toBe(true);
    });

    it('should register message:document handler', async () => {
      await adapter.init(createConfig(), createDeps());
      expect(handlers.has('message:document')).toBe(true);
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

    it('should send message with replyMarkup when provided', async () => {
      await adapter.init(createConfig(), createDeps());
      const keyboard = { inline_keyboard: [[{ text: 'Yes', callback_data: 'yes' }]] };
      await adapter.sendMessage('12345', 'Choose:', { replyMarkup: keyboard });
      expect(mockSendMessage).toHaveBeenCalledWith(12345, 'Choose:', {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
    });

    it('should not include reply_markup when replyMarkup is not in metadata', async () => {
      await adapter.init(createConfig(), createDeps());
      await adapter.sendMessage('12345', 'Hello');
      expect(mockSendMessage).toHaveBeenCalledWith(12345, 'Hello', {
        parse_mode: 'Markdown',
      });
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

    it('callback_query:data handler should call onMessage with callbackData', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(createConfig(), createDeps({ onMessage }));

      const handler = handlers.get('callback_query:data') as (ctx: unknown) => Promise<void>;
      expect(handler).toBeDefined();

      const answerCallbackQuery = vi.fn().mockResolvedValue(undefined);
      const fakeCtx = {
        callbackQuery: {
          id: 'cbq_001',
          data: 'button_yes',
          from: { id: 555, first_name: 'John', last_name: 'Doe' },
          message: { chat: { id: 777 }, message_id: 50 },
        },
        answerCallbackQuery,
      };

      await handler(fakeCtx);

      expect(answerCallbackQuery).toHaveBeenCalledOnce();
      expect(onMessage).toHaveBeenCalledOnce();
      const msg: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(msg.id).toBe('tg_cbq_cbq_001');
      expect(msg.text).toBe('button_yes');
      expect(msg.platform).toBe('telegram');
      expect(msg.direction).toBe('inbound');
      expect(msg.metadata?.callbackData).toBe('button_yes');
      expect(msg.metadata?.callbackQueryId).toBe('cbq_001');
    });

    it('callback_query:data handler should use from.id as chatId when message is absent', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(createConfig(), createDeps({ onMessage }));

      const handler = handlers.get('callback_query:data') as (ctx: unknown) => Promise<void>;
      const answerCallbackQuery = vi.fn().mockResolvedValue(undefined);
      const fakeCtx = {
        callbackQuery: {
          id: 'cbq_002',
          data: 'action',
          from: { id: 999, first_name: 'Alice' },
          message: undefined,
        },
        answerCallbackQuery,
      };

      await handler(fakeCtx);
      const msg: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(msg.chatId).toBe('999');
    });

    it('message:document handler should call onMessage with file attachment', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(createConfig(), createDeps({ onMessage }));

      const handler = handlers.get('message:document') as (ctx: unknown) => Promise<void>;
      expect(handler).toBeDefined();

      const fakeCtx = {
        message: {
          message_id: 200,
          from: { id: 555, first_name: 'John', last_name: 'Doe', is_bot: false },
          chat: { id: 777, type: 'private' },
          caption: 'My document',
          document: {
            file_id: 'file_abc123',
            file_name: 'report.pdf',
            mime_type: 'application/pdf',
            file_size: 12345,
          },
          date: 1700000000,
        },
      };

      await handler(fakeCtx);

      expect(onMessage).toHaveBeenCalledOnce();
      const msg: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(msg.id).toBe('tg_200');
      expect(msg.text).toBe('My document');
      expect(msg.attachments).toHaveLength(1);
      expect(msg.attachments![0].type).toBe('file');
      expect(msg.attachments![0].fileName).toBe('report.pdf');
      expect(msg.attachments![0].mimeType).toBe('application/pdf');
      expect(msg.attachments![0].size).toBe(12345);
      expect(msg.metadata?.fileId).toBe('file_abc123');
      expect(msg.metadata?.chatType).toBe('private');
    });

    it('message:document handler should handle missing caption and optional fields', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(createConfig(), createDeps({ onMessage }));

      const handler = handlers.get('message:document') as (ctx: unknown) => Promise<void>;
      const fakeCtx = {
        message: {
          message_id: 201,
          from: { id: 555, first_name: 'Jane', is_bot: false },
          chat: { id: 888, type: 'group' },
          caption: undefined,
          document: {
            file_id: 'file_xyz',
            file_name: undefined,
            mime_type: undefined,
            file_size: undefined,
          },
          date: 1700000001,
        },
      };

      await handler(fakeCtx);
      const msg: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(msg.text).toBe('');
      expect(msg.attachments![0].fileName).toBeUndefined();
      expect(msg.attachments![0].mimeType).toBeUndefined();
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
