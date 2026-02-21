/**
 * Unit tests for TelegramIntegration adapter.
 *
 * All grammy imports are fully mocked so no real network calls are made.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IntegrationConfig, UnifiedMessage } from '@secureyeoman/shared';
import type { IntegrationDeps } from '../types.js';
import type { SecureLogger } from '../../logging/logger.js';

// ── Stable mock references ────────────────────────────────────────────────────

const mockSendMessage = vi.fn().mockResolvedValue({ message_id: 42 });
const mockSendVoice = vi.fn().mockResolvedValue({ message_id: 99 });
const mockBotStart = vi.fn(({ onStart }: { onStart?: () => void } = {}) => {
  onStart?.();
});
const mockBotStop = vi.fn();
const mockBotCatch = vi.fn();

// Map of registered handlers: event name/command -> handler function
const handlers = new Map<string, (...args: unknown[]) => unknown>();

// ── Mock grammy ───────────────────────────────────────────────────────────────

vi.mock('grammy', () => {
  // Regular function (not arrow) so `new Bot(...)` works correctly
  const MockBot = vi.fn().mockImplementation(function (this: any, _token: string) {
    this.api = { sendMessage: mockSendMessage, sendVoice: mockSendVoice };
    this.command = (cmd: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(`command:${cmd}`, handler);
    };
    this.on = (event: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(event, handler);
    };
    this.catch = mockBotCatch;
    this.start = mockBotStart;
    this.stop = mockBotStop;
  });

  class MockInputFile {
    constructor(
      public buf: unknown,
      public name: string
    ) {}
  }

  return { Bot: MockBot, InputFile: MockInputFile };
});

// ── Import adapter after mocks ────────────────────────────────────────────────

import { TelegramIntegration } from './adapter.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeLogger(): SecureLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as SecureLogger;
}

function makeConfig(overrides: Partial<IntegrationConfig> = {}): IntegrationConfig {
  return {
    id: 'tg-test-id',
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

function makeDeps(onMessage = vi.fn().mockResolvedValue(undefined)): IntegrationDeps {
  return { logger: makeLogger(), onMessage };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TelegramIntegration', () => {
  let integration: TelegramIntegration;

  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    integration = new TelegramIntegration();
  });

  // ── Platform metadata ──────────────────────────────────────────────────────

  it('should expose platform as "telegram"', () => {
    expect(integration.platform).toBe('telegram');
  });

  it('should not be healthy before init', () => {
    expect(integration.isHealthy()).toBe(false);
  });

  // ── init() ─────────────────────────────────────────────────────────────────

  describe('init()', () => {
    it('should initialize successfully with valid config', async () => {
      await expect(integration.init(makeConfig(), makeDeps())).resolves.not.toThrow();
    });

    it('should throw when botToken is missing', async () => {
      await expect(integration.init(makeConfig({ config: {} }), makeDeps())).rejects.toThrow(
        'botToken'
      );
    });

    it('should register /start command handler', async () => {
      await integration.init(makeConfig(), makeDeps());
      expect(handlers.has('command:start')).toBe(true);
    });

    it('should register /help command handler', async () => {
      await integration.init(makeConfig(), makeDeps());
      expect(handlers.has('command:help')).toBe(true);
    });

    it('should register /status command handler', async () => {
      await integration.init(makeConfig(), makeDeps());
      expect(handlers.has('command:status')).toBe(true);
    });

    it('should register message:text handler', async () => {
      await integration.init(makeConfig(), makeDeps());
      expect(handlers.has('message:text')).toBe(true);
    });

    it('should register message:photo handler', async () => {
      await integration.init(makeConfig(), makeDeps());
      expect(handlers.has('message:photo')).toBe(true);
    });

    it('should register message:voice handler', async () => {
      await integration.init(makeConfig(), makeDeps());
      expect(handlers.has('message:voice')).toBe(true);
    });

    it('should register callback_query:data handler', async () => {
      await integration.init(makeConfig(), makeDeps());
      expect(handlers.has('callback_query:data')).toBe(true);
    });

    it('should register message:document handler', async () => {
      await integration.init(makeConfig(), makeDeps());
      expect(handlers.has('message:document')).toBe(true);
    });

    it('should register error/catch handler', async () => {
      await integration.init(makeConfig(), makeDeps());
      expect(mockBotCatch).toHaveBeenCalledOnce();
    });
  });

  // ── start() ────────────────────────────────────────────────────────────────

  describe('start()', () => {
    it('should call bot.start and invoke onStart callback', async () => {
      await integration.init(makeConfig(), makeDeps());
      await integration.start();
      expect(mockBotStart).toHaveBeenCalledOnce();
    });

    it('should be healthy after start', async () => {
      await integration.init(makeConfig(), makeDeps());
      await integration.start();
      expect(integration.isHealthy()).toBe(true);
    });

    it('should throw when called before init', async () => {
      await expect(integration.start()).rejects.toThrow('not initialized');
    });

    it('should be idempotent — second start does nothing', async () => {
      await integration.init(makeConfig(), makeDeps());
      await integration.start();
      await integration.start();
      expect(mockBotStart).toHaveBeenCalledTimes(1);
    });
  });

  // ── stop() ─────────────────────────────────────────────────────────────────

  describe('stop()', () => {
    it('should call bot.stop', async () => {
      await integration.init(makeConfig(), makeDeps());
      await integration.start();
      await integration.stop();
      expect(mockBotStop).toHaveBeenCalledOnce();
    });

    it('should not be healthy after stop', async () => {
      await integration.init(makeConfig(), makeDeps());
      await integration.start();
      await integration.stop();
      expect(integration.isHealthy()).toBe(false);
    });

    it('should be safe to call without start', async () => {
      await integration.init(makeConfig(), makeDeps());
      await expect(integration.stop()).resolves.not.toThrow();
      expect(mockBotStop).not.toHaveBeenCalled();
    });

    it('should be safe to call without init', async () => {
      await expect(integration.stop()).resolves.not.toThrow();
    });
  });

  // ── isHealthy() ────────────────────────────────────────────────────────────

  describe('isHealthy()', () => {
    it('returns false before init', () => {
      expect(integration.isHealthy()).toBe(false);
    });

    it('returns false after init but before start', async () => {
      await integration.init(makeConfig(), makeDeps());
      expect(integration.isHealthy()).toBe(false);
    });

    it('returns true after start', async () => {
      await integration.init(makeConfig(), makeDeps());
      await integration.start();
      expect(integration.isHealthy()).toBe(true);
    });

    it('returns false after stop', async () => {
      await integration.init(makeConfig(), makeDeps());
      await integration.start();
      await integration.stop();
      expect(integration.isHealthy()).toBe(false);
    });
  });

  // ── sendMessage() ──────────────────────────────────────────────────────────

  describe('sendMessage()', () => {
    it('should send a text message and return the platform message id', async () => {
      await integration.init(makeConfig(), makeDeps());
      const id = await integration.sendMessage('12345', 'Hello world');
      expect(mockSendMessage).toHaveBeenCalledWith(12345, 'Hello world', {
        parse_mode: 'Markdown',
      });
      expect(id).toBe('42');
    });

    it('should include reply_markup when replyMarkup metadata is provided', async () => {
      await integration.init(makeConfig(), makeDeps());
      const keyboard = { inline_keyboard: [[{ text: 'Yes', callback_data: 'yes' }]] };
      await integration.sendMessage('12345', 'Choose:', { replyMarkup: keyboard });
      expect(mockSendMessage).toHaveBeenCalledWith(12345, 'Choose:', {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
    });

    it('should not include reply_markup when no replyMarkup in metadata', async () => {
      await integration.init(makeConfig(), makeDeps());
      await integration.sendMessage('12345', 'Plain text');
      const callArg = mockSendMessage.mock.calls[0][1];
      // reply_markup key should be absent entirely
      expect(
        Object.prototype.hasOwnProperty.call(mockSendMessage.mock.calls[0][2], 'reply_markup')
      ).toBe(false);
    });

    it('should send voice message when audioBase64 metadata is provided', async () => {
      await integration.init(makeConfig(), makeDeps());
      const audioBase64 = Buffer.from('fake-audio').toString('base64');
      await integration.sendMessage('12345', 'With audio', { audioBase64 });
      expect(mockSendVoice).toHaveBeenCalledOnce();
    });

    it('should continue sending text even when voice send fails', async () => {
      mockSendVoice.mockRejectedValueOnce(new Error('Voice send failed'));
      const deps = makeDeps();
      await integration.init(makeConfig(), deps);

      const audioBase64 = Buffer.from('fake-audio').toString('base64');
      await integration.sendMessage('12345', 'Text after voice fail', { audioBase64 });

      expect(mockSendMessage).toHaveBeenCalledOnce();
      expect(deps.logger.warn as ReturnType<typeof vi.fn>).toHaveBeenCalled();
    });

    it('should throw when called before init', async () => {
      await expect(integration.sendMessage('123', 'test')).rejects.toThrow('not initialized');
    });
  });

  // ── Command handlers ───────────────────────────────────────────────────────

  describe('command handlers', () => {
    it('/start should reply with welcome message including displayName', async () => {
      await integration.init(makeConfig(), makeDeps());
      const handler = handlers.get('command:start') as (ctx: unknown) => Promise<void>;
      const reply = vi.fn().mockResolvedValue(undefined);
      await handler({ reply });
      expect(reply).toHaveBeenCalledOnce();
      expect(reply.mock.calls[0][0]).toContain('Test Telegram Bot');
    });

    it('/help should reply with list of commands', async () => {
      await integration.init(makeConfig(), makeDeps());
      const handler = handlers.get('command:help') as (ctx: unknown) => Promise<void>;
      const reply = vi.fn().mockResolvedValue(undefined);
      await handler({ reply });
      expect(reply).toHaveBeenCalledOnce();
      const text: string = reply.mock.calls[0][0];
      expect(text).toContain('/start');
      expect(text).toContain('/help');
      expect(text).toContain('/status');
    });

    it('/status should reply with agent info', async () => {
      await integration.init(makeConfig(), makeDeps());
      const handler = handlers.get('command:status') as (ctx: unknown) => Promise<void>;
      const reply = vi.fn().mockResolvedValue(undefined);
      await handler({ reply });
      expect(reply).toHaveBeenCalledOnce();
      const text: string = reply.mock.calls[0][0];
      expect(text).toContain('Telegram');
      expect(text).toContain('Connected');
    });
  });

  // ── message:text handler ───────────────────────────────────────────────────

  describe('message:text handler', () => {
    it('should normalize a text message and call onMessage', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await integration.init(makeConfig(), makeDeps(onMessage));

      const handler = handlers.get('message:text') as (ctx: unknown) => Promise<void>;
      await handler({
        message: {
          message_id: 99,
          from: { id: 555, first_name: 'John', last_name: 'Doe', is_bot: false },
          chat: { id: 777, type: 'private' },
          text: 'Hello FRIDAY',
          date: 1700000000,
          reply_to_message: null,
        },
      });

      expect(onMessage).toHaveBeenCalledOnce();
      const unified: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(unified.id).toBe('tg_99');
      expect(unified.platform).toBe('telegram');
      expect(unified.direction).toBe('inbound');
      expect(unified.senderId).toBe('555');
      expect(unified.senderName).toBe('John Doe');
      expect(unified.chatId).toBe('777');
      expect(unified.text).toBe('Hello FRIDAY');
      expect(unified.timestamp).toBe(1700000000000);
      expect(unified.metadata).toEqual({ chatType: 'private', isBot: false });
    });

    it('should skip messages starting with /', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await integration.init(makeConfig(), makeDeps(onMessage));

      const handler = handlers.get('message:text') as (ctx: unknown) => Promise<void>;
      await handler({
        message: {
          message_id: 100,
          from: { id: 555, first_name: 'John' },
          chat: { id: 777, type: 'private' },
          text: '/unknown_command',
          date: 1700000000,
        },
      });
      expect(onMessage).not.toHaveBeenCalled();
    });

    it('should set replyToMessageId when reply_to_message is present', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await integration.init(makeConfig(), makeDeps(onMessage));

      const handler = handlers.get('message:text') as (ctx: unknown) => Promise<void>;
      await handler({
        message: {
          message_id: 101,
          from: { id: 555, first_name: 'Jane' },
          chat: { id: 777, type: 'group' },
          text: 'Reply text',
          date: 1700000000,
          reply_to_message: { message_id: 50 },
        },
      });

      const unified: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(unified.replyToMessageId).toBe('50');
    });

    it('should handle sender with only first name', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await integration.init(makeConfig(), makeDeps(onMessage));

      const handler = handlers.get('message:text') as (ctx: unknown) => Promise<void>;
      await handler({
        message: {
          message_id: 102,
          from: { id: 555, first_name: 'Alice', last_name: undefined, is_bot: false },
          chat: { id: 777, type: 'private' },
          text: 'Hi',
          date: 1700000000,
          reply_to_message: null,
        },
      });

      const unified: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(unified.senderName).toBe('Alice');
    });
  });

  // ── message:photo handler ──────────────────────────────────────────────────

  describe('message:photo handler', () => {
    it('should call onMessage with photo message (no multimodal manager)', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await integration.init(makeConfig(), makeDeps(onMessage));

      const handler = handlers.get('message:photo') as (ctx: unknown) => Promise<void>;
      await handler({
        message: {
          message_id: 200,
          from: { id: 555, first_name: 'Bob', is_bot: false },
          chat: { id: 777, type: 'private' },
          photo: [
            { file_id: 'small_id', width: 100, height: 100 },
            { file_id: 'large_id', width: 800, height: 600 },
          ],
          caption: 'A photo caption',
          date: 1700000001,
        },
        api: { getFile: vi.fn() },
      });

      expect(onMessage).toHaveBeenCalledOnce();
      const unified: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(unified.id).toBe('tg_200');
      expect(unified.platform).toBe('telegram');
      expect(unified.text).toBe('A photo caption');
    });

    it('should skip photo messages when photo array is empty', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await integration.init(makeConfig(), makeDeps(onMessage));

      const handler = handlers.get('message:photo') as (ctx: unknown) => Promise<void>;
      await handler({
        message: {
          message_id: 201,
          from: { id: 555, first_name: 'Bob', is_bot: false },
          chat: { id: 777, type: 'private' },
          photo: [],
          caption: null,
          date: 1700000001,
        },
        api: { getFile: vi.fn() },
      });

      expect(onMessage).not.toHaveBeenCalled();
    });
  });

  // ── message:voice handler ──────────────────────────────────────────────────

  describe('message:voice handler', () => {
    it('should call onMessage with "[Voice message]" text (no multimodal manager)', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await integration.init(makeConfig(), makeDeps(onMessage));

      const handler = handlers.get('message:voice') as (ctx: unknown) => Promise<void>;
      await handler({
        message: {
          message_id: 300,
          from: { id: 555, first_name: 'Carol', is_bot: false },
          chat: { id: 777, type: 'private' },
          voice: { file_id: 'voice_abc', duration: 10 },
          date: 1700000002,
        },
        api: { getFile: vi.fn() },
      });

      expect(onMessage).toHaveBeenCalledOnce();
      const unified: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(unified.text).toBe('[Voice message]');
      expect(unified.platform).toBe('telegram');
    });
  });

  // ── callback_query:data handler ────────────────────────────────────────────

  describe('callback_query:data handler', () => {
    it('should acknowledge and call onMessage with callbackData', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await integration.init(makeConfig(), makeDeps(onMessage));

      const handler = handlers.get('callback_query:data') as (ctx: unknown) => Promise<void>;
      const answerCallbackQuery = vi.fn().mockResolvedValue(undefined);
      await handler({
        callbackQuery: {
          id: 'cbq-001',
          data: 'button_yes',
          from: { id: 555, first_name: 'John', last_name: 'Doe' },
          message: { chat: { id: 777 }, message_id: 50 },
        },
        answerCallbackQuery,
      });

      expect(answerCallbackQuery).toHaveBeenCalledOnce();
      expect(onMessage).toHaveBeenCalledOnce();
      const unified: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(unified.id).toBe('tg_cbq_cbq-001');
      expect(unified.text).toBe('button_yes');
      expect(unified.metadata?.callbackData).toBe('button_yes');
      expect(unified.metadata?.callbackQueryId).toBe('cbq-001');
      expect(unified.metadata?.messageId).toBe(50);
    });

    it('should use from.id as chatId when message is absent', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await integration.init(makeConfig(), makeDeps(onMessage));

      const handler = handlers.get('callback_query:data') as (ctx: unknown) => Promise<void>;
      const answerCallbackQuery = vi.fn().mockResolvedValue(undefined);
      await handler({
        callbackQuery: {
          id: 'cbq-002',
          data: 'action_x',
          from: { id: 999, first_name: 'Alice' },
          message: undefined,
        },
        answerCallbackQuery,
      });

      const unified: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(unified.chatId).toBe('999');
    });
  });

  // ── message:document handler ───────────────────────────────────────────────

  describe('message:document handler', () => {
    it('should call onMessage with file attachment details', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await integration.init(makeConfig(), makeDeps(onMessage));

      const handler = handlers.get('message:document') as (ctx: unknown) => Promise<void>;
      await handler({
        message: {
          message_id: 400,
          from: { id: 555, first_name: 'Dave', last_name: 'Smith', is_bot: false },
          chat: { id: 777, type: 'private' },
          caption: 'My document',
          document: {
            file_id: 'file_abc',
            file_name: 'report.pdf',
            mime_type: 'application/pdf',
            file_size: 12345,
          },
          date: 1700000003,
        },
      });

      expect(onMessage).toHaveBeenCalledOnce();
      const unified: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(unified.id).toBe('tg_400');
      expect(unified.text).toBe('My document');
      expect(unified.attachments).toHaveLength(1);
      expect(unified.attachments![0].type).toBe('file');
      expect(unified.attachments![0].fileName).toBe('report.pdf');
      expect(unified.attachments![0].mimeType).toBe('application/pdf');
      expect(unified.attachments![0].size).toBe(12345);
      expect(unified.metadata?.fileId).toBe('file_abc');
    });

    it('should handle documents with missing optional fields', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await integration.init(makeConfig(), makeDeps(onMessage));

      const handler = handlers.get('message:document') as (ctx: unknown) => Promise<void>;
      await handler({
        message: {
          message_id: 401,
          from: { id: 555, first_name: 'Jane', is_bot: false },
          chat: { id: 888, type: 'group' },
          caption: undefined,
          document: {
            file_id: 'file_xyz',
            file_name: undefined,
            mime_type: undefined,
            file_size: undefined,
          },
          date: 1700000004,
        },
      });

      const unified: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(unified.text).toBe('');
      expect(unified.attachments![0].fileName).toBeUndefined();
      expect(unified.attachments![0].mimeType).toBeUndefined();
      expect(unified.attachments![0].size).toBeUndefined();
    });
  });
});
