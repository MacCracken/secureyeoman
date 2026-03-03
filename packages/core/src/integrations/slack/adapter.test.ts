/**
 * Unit tests for SlackIntegration adapter.
 *
 * All @slack/bolt imports are fully mocked so no real network calls are made.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IntegrationConfig } from '@secureyeoman/shared';
import type { IntegrationDeps } from '../types.js';
import type { SecureLogger } from '../../logging/logger.js';

// ── Stable mock references (must be declared before vi.mock factories) ────────

const mocks = vi.hoisted(() => {
  const appStart = vi.fn().mockResolvedValue(undefined);
  const appStop = vi.fn().mockResolvedValue(undefined);
  const chatPostMessage = vi.fn().mockResolvedValue({ ts: 'ts-12345' });

  // Registered handler storage (keyed by event/command/view name)
  const registeredHandlers: Record<string, (...args: any[]) => any> = {};

  const mockAppInstance = {
    start: appStart,
    stop: appStop,
    client: {
      chat: {
        postMessage: chatPostMessage,
      },
    },
    message: vi.fn().mockImplementation(function (handler: (...args: any[]) => any) {
      registeredHandlers['message'] = handler;
    }),
    event: vi.fn().mockImplementation(function (name: string, handler: (...args: any[]) => any) {
      registeredHandlers[`event:${name}`] = handler;
    }),
    action: vi.fn().mockImplementation(function (
      pattern: unknown,
      handler: (...args: any[]) => any
    ) {
      registeredHandlers['action'] = handler;
    }),
    command: vi.fn().mockImplementation(function (name: string, handler: (...args: any[]) => any) {
      registeredHandlers[`command:${name}`] = handler;
    }),
    view: vi.fn().mockImplementation(function (name: string, handler: (...args: any[]) => any) {
      registeredHandlers[`view:${name}`] = handler;
    }),
    step: vi.fn(),
  };

  return {
    appStart,
    appStop,
    chatPostMessage,
    registeredHandlers,
    mockAppInstance,
  };
});

// ── Mock @slack/bolt ──────────────────────────────────────────────────────────

vi.mock('@slack/bolt', () => {
  const MockApp = vi.fn().mockImplementation(function () {
    return mocks.mockAppInstance;
  });

  const MockWorkflowStep = vi.fn().mockImplementation(function (name: string, handlers: unknown) {
    return { name, handlers };
  });

  return { App: MockApp, WorkflowStep: MockWorkflowStep };
});

// ── Import adapter after mocks ────────────────────────────────────────────────

import { SlackIntegration } from './adapter.js';

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
    id: 'sl-test-id',
    platform: 'slack',
    displayName: 'Test Slack Bot',
    enabled: true,
    status: 'disconnected',
    config: {
      botToken: 'xoxb-test-bot-token',
      appToken: 'xapp-test-app-token',
    },
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

describe('SlackIntegration', () => {
  let integration: SlackIntegration;

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear registered handlers between tests
    for (const key of Object.keys(mocks.registeredHandlers)) {
      delete mocks.registeredHandlers[key];
    }
    // Restore default mock resolved values
    mocks.appStart.mockResolvedValue(undefined);
    mocks.appStop.mockResolvedValue(undefined);
    mocks.chatPostMessage.mockResolvedValue({ ts: 'ts-12345' });
    // Re-attach handler registration logic since clearAllMocks resets mock.fn impls
    mocks.mockAppInstance.message.mockImplementation(function (handler: (...args: any[]) => any) {
      mocks.registeredHandlers['message'] = handler;
    });
    mocks.mockAppInstance.event.mockImplementation(function (
      name: string,
      handler: (...args: any[]) => any
    ) {
      mocks.registeredHandlers[`event:${name}`] = handler;
    });
    mocks.mockAppInstance.action.mockImplementation(function (
      _pattern: unknown,
      handler: (...args: any[]) => any
    ) {
      mocks.registeredHandlers['action'] = handler;
    });
    mocks.mockAppInstance.command.mockImplementation(function (
      name: string,
      handler: (...args: any[]) => any
    ) {
      mocks.registeredHandlers[`command:${name}`] = handler;
    });
    mocks.mockAppInstance.view.mockImplementation(function (
      name: string,
      handler: (...args: any[]) => any
    ) {
      mocks.registeredHandlers[`view:${name}`] = handler;
    });
    integration = new SlackIntegration();
  });

  // ── Platform metadata ──────────────────────────────────────────────────────

  it('should expose platform as "slack"', () => {
    expect(integration.platform).toBe('slack');
  });

  it('should expose platformRateLimit of 1 msg/s', () => {
    expect(integration.platformRateLimit).toEqual({ maxPerSecond: 1 });
  });

  // ── init() ─────────────────────────────────────────────────────────────────

  describe('init()', () => {
    it('should initialize successfully with valid config', async () => {
      await expect(integration.init(makeConfig(), makeDeps())).resolves.not.toThrow();
    });

    it('should throw when botToken is missing', async () => {
      await expect(
        integration.init(makeConfig({ config: { appToken: 'xapp-token' } }), makeDeps())
      ).rejects.toThrow('botToken');
    });

    it('should throw when appToken is missing', async () => {
      await expect(
        integration.init(makeConfig({ config: { botToken: 'xoxb-token' } }), makeDeps())
      ).rejects.toThrow('appToken');
    });

    it('should register app.message handler', async () => {
      await integration.init(makeConfig(), makeDeps());
      expect(mocks.mockAppInstance.message).toHaveBeenCalledOnce();
    });

    it('should register app.event handler for app_mention', async () => {
      await integration.init(makeConfig(), makeDeps());
      expect(mocks.mockAppInstance.event).toHaveBeenCalledWith('app_mention', expect.any(Function));
    });

    it('should register app.action handler', async () => {
      await integration.init(makeConfig(), makeDeps());
      expect(mocks.mockAppInstance.action).toHaveBeenCalledOnce();
    });

    it('should register /friday command handler', async () => {
      await integration.init(makeConfig(), makeDeps());
      const commandNames = mocks.mockAppInstance.command.mock.calls.map((c: any[]) => c[0]);
      expect(commandNames).toContain('/friday');
    });

    it('should register /friday-status command handler', async () => {
      await integration.init(makeConfig(), makeDeps());
      const commandNames = mocks.mockAppInstance.command.mock.calls.map((c: any[]) => c[0]);
      expect(commandNames).toContain('/friday-status');
    });

    it('should register /friday-modal command handler', async () => {
      await integration.init(makeConfig(), makeDeps());
      const commandNames = mocks.mockAppInstance.command.mock.calls.map((c: any[]) => c[0]);
      expect(commandNames).toContain('/friday-modal');
    });

    it('should register friday_modal view handler', async () => {
      await integration.init(makeConfig(), makeDeps());
      expect(mocks.mockAppInstance.view).toHaveBeenCalledWith('friday_modal', expect.any(Function));
    });

    it('should register workflow step via app.step', async () => {
      await integration.init(makeConfig(), makeDeps());
      expect(mocks.mockAppInstance.step).toHaveBeenCalledOnce();
    });
  });

  // ── start() ────────────────────────────────────────────────────────────────

  describe('start()', () => {
    it('should call app.start() and become healthy', async () => {
      await integration.init(makeConfig(), makeDeps());
      await integration.start();
      expect(mocks.appStart).toHaveBeenCalledOnce();
      expect(integration.isHealthy()).toBe(true);
    });

    it('should throw when called before init', async () => {
      await expect(integration.start()).rejects.toThrow('not initialized');
    });

    it('should be idempotent — second start does not call app.start again', async () => {
      await integration.init(makeConfig(), makeDeps());
      await integration.start();
      await integration.start();
      expect(mocks.appStart).toHaveBeenCalledTimes(1);
    });
  });

  // ── stop() ─────────────────────────────────────────────────────────────────

  describe('stop()', () => {
    it('should call app.stop() and become unhealthy', async () => {
      await integration.init(makeConfig(), makeDeps());
      await integration.start();
      await integration.stop();
      expect(mocks.appStop).toHaveBeenCalledOnce();
      expect(integration.isHealthy()).toBe(false);
    });

    it('should be a no-op when not running (does not call app.stop)', async () => {
      await integration.init(makeConfig(), makeDeps());
      // Not started — stop should do nothing
      await expect(integration.stop()).resolves.not.toThrow();
      expect(mocks.appStop).not.toHaveBeenCalled();
    });

    it('should be a no-op when called before init', async () => {
      await expect(integration.stop()).resolves.not.toThrow();
      expect(mocks.appStop).not.toHaveBeenCalled();
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
    beforeEach(async () => {
      await integration.init(makeConfig(), makeDeps());
    });

    it('calls app.client.chat.postMessage with channel and text', async () => {
      const ts = await integration.sendMessage('C123456', 'Hello Slack!');
      expect(mocks.chatPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'C123456',
          text: 'Hello Slack!',
        })
      );
      expect(ts).toBe('ts-12345');
    });

    it('returns the ts value from the postMessage result', async () => {
      mocks.chatPostMessage.mockResolvedValueOnce({ ts: 'ts-unique-99' });
      const ts = await integration.sendMessage('C123', 'Test message');
      expect(ts).toBe('ts-unique-99');
    });

    it('includes thread_ts when metadata.threadTs is provided', async () => {
      await integration.sendMessage('C123', 'Thread reply', { threadTs: '1234567890.000200' });
      const arg = mocks.chatPostMessage.mock.calls[0][0] as Record<string, unknown>;
      expect(arg.thread_ts).toBe('1234567890.000200');
    });

    it('includes blocks when metadata.blocks is provided', async () => {
      const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: '*Bold*' } }];
      await integration.sendMessage('C456', 'Rich message', { blocks });
      const arg = mocks.chatPostMessage.mock.calls[0][0] as Record<string, unknown>;
      expect(arg.blocks).toEqual(blocks);
    });

    it('does not include blocks when metadata.blocks is absent', async () => {
      await integration.sendMessage('C789', 'Plain message');
      const arg = mocks.chatPostMessage.mock.calls[0][0] as Record<string, unknown>;
      expect(arg.blocks).toBeUndefined();
    });

    it('throws when called before init', async () => {
      const uninit = new SlackIntegration();
      await expect(uninit.sendMessage('C123', 'test')).rejects.toThrow('not initialized');
    });

    it('returns empty string when postMessage result has no ts', async () => {
      mocks.chatPostMessage.mockResolvedValueOnce({});
      const ts = await integration.sendMessage('C123', 'test');
      expect(ts).toBe('');
    });

    it('prepends thinking context block when thinkingContent is provided', async () => {
      await integration.sendMessage('C123', 'Reply', { thinkingContent: 'Reasoning about...' });
      const arg = mocks.chatPostMessage.mock.calls[0][0] as Record<string, unknown>;
      expect(arg.blocks).toBeDefined();
      const blocks = arg.blocks as any[];
      expect(blocks[0].type).toBe('context');
      expect(blocks[0].elements[0].text).toContain('Thinking');
    });

    it('does not prepend thinking block when thinkingContent is not a string', async () => {
      await integration.sendMessage('C123', 'Reply', { thinkingContent: 123 });
      const arg = mocks.chatPostMessage.mock.calls[0][0] as Record<string, unknown>;
      expect(arg.blocks).toBeUndefined();
    });

    it('merges thinking block with explicit blocks', async () => {
      const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: 'hello' } }];
      await integration.sendMessage('C123', 'Reply', {
        thinkingContent: 'Analyzing...',
        blocks,
      });
      const arg = mocks.chatPostMessage.mock.calls[0][0] as Record<string, unknown>;
      const allBlocks = arg.blocks as any[];
      expect(allBlocks).toHaveLength(2);
      expect(allBlocks[0].type).toBe('context');
      expect(allBlocks[1].type).toBe('section');
    });

    it('truncates thinking content to 500 characters', async () => {
      const longContent = 'A'.repeat(1000);
      await integration.sendMessage('C123', 'Reply', { thinkingContent: longContent });
      const arg = mocks.chatPostMessage.mock.calls[0][0] as Record<string, unknown>;
      const blocks = arg.blocks as any[];
      const text = blocks[0].elements[0].text as string;
      // The text should contain the truncated content (500 chars) plus prefix
      expect(text.length).toBeLessThan(600);
    });
  });

  // ── Message handler invocations ───────────────────────────────────────────

  describe('message handler', () => {
    it('dispatches a regular message to onMessage', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await integration.init(makeConfig(), makeDeps(onMessage));

      const handler = mocks.registeredHandlers['message'];
      expect(handler).toBeDefined();

      await handler({
        message: {
          ts: '1234567890.000100',
          user: 'U123',
          channel: 'C456',
          text: 'Hello bot',
          channel_type: 'im',
        },
      });

      expect(onMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'sl_1234567890.000100',
          platform: 'slack',
          senderId: 'U123',
          chatId: 'C456',
          text: 'Hello bot',
        })
      );
    });

    it('skips messages with subtype', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await integration.init(makeConfig(), makeDeps(onMessage));

      const handler = mocks.registeredHandlers['message'];
      await handler({
        message: {
          ts: '1234567890.000100',
          user: 'U123',
          channel: 'C456',
          text: 'edited message',
          subtype: 'message_changed',
        },
      });

      expect(onMessage).not.toHaveBeenCalled();
    });

    it('skips messages with no text and no files', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await integration.init(makeConfig(), makeDeps(onMessage));

      const handler = mocks.registeredHandlers['message'];
      await handler({
        message: {
          ts: '1234567890.000100',
          user: 'U123',
          channel: 'C456',
        },
      });

      expect(onMessage).not.toHaveBeenCalled();
    });

    it('allows messages with only file attachments (no text)', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await integration.init(makeConfig(), makeDeps(onMessage));

      const handler = mocks.registeredHandlers['message'];
      await handler({
        message: {
          ts: '1234567890.000100',
          user: 'U123',
          channel: 'C456',
          files: [
            {
              name: 'image.png',
              mimetype: 'image/png',
              url_private: 'https://files.slack.com/img.png',
              size: 1024,
            },
          ],
        },
      });

      expect(onMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: '',
          attachments: expect.arrayContaining([
            expect.objectContaining({ fileName: 'image.png', mimeType: 'image/png' }),
          ]),
        })
      );
    });

    it('processes image attachments through multimodalManager', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      const mockAnalyzeImage = vi
        .fn()
        .mockResolvedValue({ description: 'A sunset over the ocean' });
      const deps = {
        logger: makeLogger(),
        onMessage,
        multimodalManager: { analyzeImage: mockAnalyzeImage },
      } as any;

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          arrayBuffer: async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer,
        })
      );

      await integration.init(makeConfig(), deps);

      const handler = mocks.registeredHandlers['message'];
      await handler({
        message: {
          ts: '1234567890.000100',
          user: 'U123',
          channel: 'C456',
          text: 'Check this image',
          files: [
            {
              name: 'sunset.png',
              mimetype: 'image/png',
              url_private: 'https://files.slack.com/sunset.png',
              size: 2048,
            },
          ],
        },
      });

      expect(mockAnalyzeImage).toHaveBeenCalledWith(
        expect.objectContaining({
          mimeType: 'image/png',
        })
      );
      expect(onMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('[Image: A sunset over the ocean]'),
        })
      );
    });

    it('handles multimodal vision processing failure gracefully', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      const mockAnalyzeImage = vi.fn().mockRejectedValue(new Error('Vision API down'));
      const deps = {
        logger: makeLogger(),
        onMessage,
        multimodalManager: { analyzeImage: mockAnalyzeImage },
      } as any;

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          arrayBuffer: async () => new Uint8Array([0x89]).buffer,
        })
      );

      await integration.init(makeConfig(), deps);

      const handler = mocks.registeredHandlers['message'];
      await handler({
        message: {
          ts: '1234567890.000100',
          user: 'U123',
          channel: 'C456',
          text: 'Check image',
          files: [
            {
              name: 'img.jpg',
              mimetype: 'image/jpeg',
              url_private: 'https://files.slack.com/img.jpg',
              size: 1024,
            },
          ],
        },
      });

      // Should still call onMessage despite vision failure
      expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ text: 'Check image' }));
    });

    it('skips non-image attachments in vision processing', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      const mockAnalyzeImage = vi.fn();
      const deps = {
        logger: makeLogger(),
        onMessage,
        multimodalManager: { analyzeImage: mockAnalyzeImage },
      } as any;

      await integration.init(makeConfig(), deps);

      const handler = mocks.registeredHandlers['message'];
      await handler({
        message: {
          ts: '1234567890.000100',
          user: 'U123',
          channel: 'C456',
          text: 'Check file',
          files: [
            {
              name: 'document.pdf',
              mimetype: 'application/pdf',
              url_private: 'https://files.slack.com/doc.pdf',
              size: 4096,
            },
          ],
        },
      });

      expect(mockAnalyzeImage).not.toHaveBeenCalled();
      expect(onMessage).toHaveBeenCalled();
    });

    it('includes thread_ts as replyToMessageId', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await integration.init(makeConfig(), makeDeps(onMessage));

      const handler = mocks.registeredHandlers['message'];
      await handler({
        message: {
          ts: '1234567890.000100',
          user: 'U123',
          channel: 'C456',
          text: 'Thread reply',
          thread_ts: '1234567890.000001',
        },
      });

      expect(onMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          replyToMessageId: '1234567890.000001',
        })
      );
    });
  });

  // ── app_mention handler ───────────────────────────────────────────────────

  describe('app_mention handler', () => {
    it('dispatches mention events to onMessage', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await integration.init(makeConfig(), makeDeps(onMessage));

      const handler = mocks.registeredHandlers['event:app_mention'];
      expect(handler).toBeDefined();

      await handler({
        event: {
          ts: '1234567890.000200',
          user: 'U789',
          channel: 'C321',
          text: '<@BOT> help',
        },
      });

      expect(onMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'sl_1234567890.000200',
          text: '<@BOT> help',
          metadata: expect.objectContaining({ isMention: true }),
        })
      );
    });
  });

  // ── action handler ────────────────────────────────────────────────────────

  describe('action handler', () => {
    it('dispatches block actions to onMessage', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await integration.init(makeConfig(), makeDeps(onMessage));

      const handler = mocks.registeredHandlers['action'];
      expect(handler).toBeDefined();

      await handler({
        action: {
          action_id: 'approve_btn',
          block_id: 'block-1',
          value: 'approved',
        },
        ack: vi.fn().mockResolvedValue(undefined),
        body: {
          user: { id: 'U111', name: 'User Name' },
          channel: { id: 'C999' },
        },
      });

      expect(onMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'approved',
          metadata: expect.objectContaining({
            isBlockAction: true,
            actionId: 'approve_btn',
          }),
        })
      );
    });

    it('uses container.channel_id when channel.id is absent', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await integration.init(makeConfig(), makeDeps(onMessage));

      const handler = mocks.registeredHandlers['action'];
      await handler({
        action: { action_id: 'btn', value: 'val' },
        ack: vi.fn().mockResolvedValue(undefined),
        body: {
          user: { id: 'U111' },
          container: { channel_id: 'C888' },
        },
      });

      expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ chatId: 'C888' }));
    });
  });

  // ── /friday command handler ───────────────────────────────────────────────

  describe('/friday command handler', () => {
    it('dispatches /friday commands to onMessage', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await integration.init(makeConfig(), makeDeps(onMessage));

      const handler = mocks.registeredHandlers['command:/friday'];
      expect(handler).toBeDefined();

      await handler({
        command: {
          user_id: 'U222',
          user_name: 'testuser',
          channel_id: 'C111',
          text: 'summarize my tasks',
          trigger_id: 'trig-1',
        },
        ack: vi.fn().mockResolvedValue(undefined),
      });

      expect(onMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'summarize my tasks',
          metadata: expect.objectContaining({
            isSlashCommand: true,
            commandName: '/friday',
          }),
        })
      );
    });

    it('uses default text when command.text is empty', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await integration.init(makeConfig(), makeDeps(onMessage));

      const handler = mocks.registeredHandlers['command:/friday'];
      await handler({
        command: {
          user_id: 'U222',
          user_name: 'testuser',
          channel_id: 'C111',
          text: '',
          trigger_id: 'trig-1',
        },
        ack: vi.fn().mockResolvedValue(undefined),
      });

      expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ text: '/friday' }));
    });
  });

  // ── /friday-status command handler ────────────────────────────────────────

  describe('/friday-status command handler', () => {
    it('responds with agent status', async () => {
      await integration.init(makeConfig(), makeDeps());

      const handler = mocks.registeredHandlers['command:/friday-status'];
      expect(handler).toBeDefined();

      const respond = vi.fn().mockResolvedValue(undefined);
      await handler({
        command: {
          user_id: 'U222',
          user_name: 'testuser',
          channel_id: 'C111',
          text: '',
          trigger_id: 'trig-1',
        },
        ack: vi.fn().mockResolvedValue(undefined),
        respond,
      });

      expect(respond).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('Test Slack Bot'),
        })
      );
    });
  });

  // ── /friday-modal command handler ─────────────────────────────────────────

  describe('/friday-modal command handler', () => {
    it('opens a modal dialog', async () => {
      await integration.init(makeConfig(), makeDeps());

      const handler = mocks.registeredHandlers['command:/friday-modal'];
      expect(handler).toBeDefined();

      const viewsOpen = vi.fn().mockResolvedValue(undefined);
      await handler({
        command: {
          trigger_id: 'trig-modal',
        },
        ack: vi.fn().mockResolvedValue(undefined),
        client: { views: { open: viewsOpen } },
      });

      expect(viewsOpen).toHaveBeenCalledWith(
        expect.objectContaining({
          trigger_id: 'trig-modal',
          view: expect.objectContaining({
            type: 'modal',
            callback_id: 'friday_modal',
          }),
        })
      );
    });
  });

  // ── WorkflowStep handlers ──────────────────────────────────────────────────

  describe('WorkflowStep handlers', () => {
    it('edit handler configures the step', async () => {
      await integration.init(makeConfig(), makeDeps());

      // Extract WorkflowStep constructor calls
      const { WorkflowStep: WS } = await import('@slack/bolt');
      const mockWS = vi.mocked(WS);
      expect(mockWS).toHaveBeenCalledWith('friday_process', expect.any(Object));

      const handlers = mockWS.mock.calls[0][1] as Record<string, Function>;
      const ack = vi.fn().mockResolvedValue(undefined);
      const configure = vi.fn().mockResolvedValue(undefined);

      await handlers.edit({ ack, step: {}, configure });

      expect(ack).toHaveBeenCalled();
      expect(configure).toHaveBeenCalledWith(
        expect.objectContaining({
          blocks: expect.arrayContaining([expect.objectContaining({ block_id: 'task_block' })]),
        })
      );
    });

    it('save handler acks and updates with task input', async () => {
      await integration.init(makeConfig(), makeDeps());

      const { WorkflowStep: WS } = await import('@slack/bolt');
      const mockWS = vi.mocked(WS);
      const handlers = mockWS.mock.calls[0][1] as Record<string, Function>;
      const ack = vi.fn().mockResolvedValue(undefined);
      const update = vi.fn().mockResolvedValue(undefined);

      await handlers.save({
        ack,
        step: {},
        view: {
          state: {
            values: { task_block: { task_input: { value: 'My workflow task' } } },
          },
        },
        update,
      });

      expect(ack).toHaveBeenCalled();
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          inputs: { task: { value: 'My workflow task' } },
          outputs: [],
        })
      );
    });

    it('execute handler dispatches to onMessage and completes', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await integration.init(makeConfig(), makeDeps(onMessage));

      const { WorkflowStep: WS } = await import('@slack/bolt');
      const mockWS = vi.mocked(WS);
      const handlers = mockWS.mock.calls[0][1] as Record<string, Function>;
      const complete = vi.fn().mockResolvedValue(undefined);
      const fail = vi.fn().mockResolvedValue(undefined);

      await handlers.execute({
        step: { inputs: { task: { value: 'Execute this' } } },
        complete,
        fail,
      });

      expect(onMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Execute this',
          metadata: expect.objectContaining({
            isWorkflowStep: true,
            workflowStepId: 'friday_process',
          }),
        })
      );
      expect(complete).toHaveBeenCalledWith({ outputs: {} });
      expect(fail).not.toHaveBeenCalled();
    });

    it('execute handler calls fail when onMessage throws', async () => {
      const onMessage = vi.fn().mockRejectedValue(new Error('Workflow failed'));
      await integration.init(makeConfig(), makeDeps(onMessage));

      const { WorkflowStep: WS } = await import('@slack/bolt');
      const mockWS = vi.mocked(WS);
      const handlers = mockWS.mock.calls[0][1] as Record<string, Function>;
      const complete = vi.fn().mockResolvedValue(undefined);
      const fail = vi.fn().mockResolvedValue(undefined);

      await handlers.execute({
        step: { inputs: { task: { value: 'Fail task' } } },
        complete,
        fail,
      });

      expect(complete).not.toHaveBeenCalled();
      expect(fail).toHaveBeenCalledWith(
        expect.objectContaining({
          error: { message: 'Workflow failed' },
        })
      );
    });

    it('execute handler calls fail with string error', async () => {
      const onMessage = vi.fn().mockRejectedValue('string error');
      await integration.init(makeConfig(), makeDeps(onMessage));

      const { WorkflowStep: WS } = await import('@slack/bolt');
      const mockWS = vi.mocked(WS);
      const handlers = mockWS.mock.calls[0][1] as Record<string, Function>;
      const complete = vi.fn().mockResolvedValue(undefined);
      const fail = vi.fn().mockResolvedValue(undefined);

      await handlers.execute({
        step: { inputs: {} },
        complete,
        fail,
      });

      expect(fail).toHaveBeenCalledWith(
        expect.objectContaining({
          error: { message: 'string error' },
        })
      );
    });
  });

  // ── friday_modal view handler ─────────────────────────────────────────────

  describe('friday_modal view handler', () => {
    it('dispatches modal submission to onMessage', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await integration.init(makeConfig(), makeDeps(onMessage));

      const handler = mocks.registeredHandlers['view:friday_modal'];
      expect(handler).toBeDefined();

      await handler({
        ack: vi.fn().mockResolvedValue(undefined),
        view: {
          id: 'view-1',
          callback_id: 'friday_modal',
          state: {
            values: {
              task_block: {
                task_input: { value: 'My task description' },
              },
            },
          },
        },
        body: {
          user: { id: 'U333', name: 'Modal User' },
          view: { root_view_id: 'root-1' },
        },
      });

      expect(onMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'My task description',
          metadata: expect.objectContaining({
            isModalSubmit: true,
            modalCallbackId: 'friday_modal',
          }),
        })
      );
    });
  });
});
