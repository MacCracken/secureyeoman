/**
 * Unit tests for DiscordIntegration adapter.
 *
 * All discord.js imports are fully mocked so no real network calls are made.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IntegrationConfig, UnifiedMessage } from '@secureyeoman/shared';
import type { IntegrationDeps } from '../types.js';
import type { SecureLogger } from '../../logging/logger.js';

// ── Stable mock references (must be declared before vi.mock factories) ────────

const mockRestPut = vi.fn().mockResolvedValue(undefined);
const mockLogin = vi.fn().mockResolvedValue('token');
const mockDestroy = vi.fn();
const mockIsReady = vi.fn().mockReturnValue(true);
const mockChannelsFetch = vi.fn().mockResolvedValue({
  send: vi.fn().mockResolvedValue({ id: 'sent_msg_1' }),
  name: 'general',
});
const mockClientOn = vi.fn();

// Capture ready handlers registered via client.once('ready', ...)
const readyHandlers: Array<() => Promise<void>> = [];

// ── Mock discord.js ──────────────────────────────────────────────────────────

vi.mock('discord.js', () => {
  const mockClientOnce = vi.fn((event: string, handler: () => Promise<void>) => {
    if (event === 'ready') {
      readyHandlers.push(handler);
    }
  });

  // Use regular function (not arrow) so `new Client(...)` works correctly
  const MockClient = vi.fn().mockImplementation(function (this: any) {
    this.on = mockClientOn;
    this.once = mockClientOnce;
    this.login = mockLogin;
    this.destroy = mockDestroy;
    this.isReady = mockIsReady;
    this.channels = { fetch: mockChannelsFetch };
  });

  const MockREST = vi.fn().mockImplementation(function (this: any) {
    this.setToken = () => this;
    this.put = mockRestPut;
  });

  class MockEmbedBuilder {
    setTitle() { return this; }
    setDescription() { return this; }
    setColor() { return this; }
    setTimestamp() { return this; }
    addFields() { return this; }
  }

  class MockModalBuilder {
    setCustomId() { return this; }
    setTitle() { return this; }
    addComponents() { return this; }
  }

  class MockTextInputBuilder {
    setCustomId() { return this; }
    setLabel() { return this; }
    setStyle() { return this; }
  }

  class MockActionRowBuilder {
    addComponents() { return this; }
  }

  return {
    Client: MockClient,
    REST: MockREST,
    GatewayIntentBits: {
      Guilds: 1,
      GuildMessages: 2,
      MessageContent: 3,
    },
    ChannelType: {
      GuildText: 0,
      PublicThread: 11,
      PrivateThread: 12,
    },
    TextInputStyle: {
      Short: 1,
      Paragraph: 2,
    },
    Routes: {
      applicationGuildCommands: vi.fn(
        (clientId: string, guildId: string) => `/guilds/${guildId}/commands`
      ),
      applicationCommands: vi.fn(
        (clientId: string) => `/applications/${clientId}/commands`
      ),
    },
    EmbedBuilder: MockEmbedBuilder,
    ModalBuilder: MockModalBuilder,
    TextInputBuilder: MockTextInputBuilder,
    ActionRowBuilder: MockActionRowBuilder,
  };
});

// ── Import adapter after mocks ────────────────────────────────────────────────

import { DiscordIntegration } from './adapter.js';

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
    id: 'dc-test-id',
    platform: 'discord',
    displayName: 'Test Discord Bot',
    enabled: true,
    status: 'disconnected',
    config: { botToken: 'test-bot-token', clientId: 'client-123' },
    messageCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeDeps(onMessage = vi.fn().mockResolvedValue(undefined)): IntegrationDeps {
  return { logger: makeLogger(), onMessage };
}

async function fireReadyHandlers() {
  for (const h of readyHandlers) {
    await h();
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DiscordIntegration', () => {
  let integration: DiscordIntegration;

  beforeEach(() => {
    vi.clearAllMocks();
    readyHandlers.length = 0;
    mockLogin.mockResolvedValue('token');
    // Reset default resolved value for channels.fetch
    mockChannelsFetch.mockResolvedValue({
      send: vi.fn().mockResolvedValue({ id: 'sent_msg_1' }),
      name: 'general',
    });
    integration = new DiscordIntegration();
  });

  // ── Platform metadata ──────────────────────────────────────────────────────

  it('should expose platform as "discord"', () => {
    expect(integration.platform).toBe('discord');
  });

  it('should expose platformRateLimit of 50 msg/s', () => {
    expect(integration.platformRateLimit).toEqual({ maxPerSecond: 50 });
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
      await expect(
        integration.init(makeConfig({ config: {} }), makeDeps())
      ).rejects.toThrow('botToken');
    });

    it('should register messageCreate event handler', async () => {
      await integration.init(makeConfig(), makeDeps());
      const calls = (mockClientOn as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.some((c: any[]) => c[0] === 'messageCreate')).toBe(true);
    });

    it('should register interactionCreate event handler', async () => {
      await integration.init(makeConfig(), makeDeps());
      const calls = (mockClientOn as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.some((c: any[]) => c[0] === 'interactionCreate')).toBe(true);
    });

    it('should register error event handler', async () => {
      await integration.init(makeConfig(), makeDeps());
      const calls = (mockClientOn as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.some((c: any[]) => c[0] === 'error')).toBe(true);
    });
  });

  // ── start() ────────────────────────────────────────────────────────────────

  describe('start()', () => {
    it('should call client.login with botToken', async () => {
      await integration.init(makeConfig(), makeDeps());
      await integration.start();
      expect(mockLogin).toHaveBeenCalledWith('test-bot-token');
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
      expect(mockLogin).toHaveBeenCalledTimes(1);
    });
  });

  // ── stop() ─────────────────────────────────────────────────────────────────

  describe('stop()', () => {
    it('should call client.destroy', async () => {
      await integration.init(makeConfig(), makeDeps());
      await integration.start();
      await integration.stop();
      expect(mockDestroy).toHaveBeenCalledOnce();
    });

    it('should not be healthy after stop', async () => {
      await integration.init(makeConfig(), makeDeps());
      await integration.start();
      await integration.stop();
      expect(integration.isHealthy()).toBe(false);
    });

    it('should be safe to call without init', async () => {
      await expect(integration.stop()).resolves.not.toThrow();
    });

    it('should be safe to call without start', async () => {
      await integration.init(makeConfig(), makeDeps());
      await expect(integration.stop()).resolves.not.toThrow();
      expect(mockDestroy).not.toHaveBeenCalled();
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
    it('should fetch channel and send message, returning message id', async () => {
      const sendMock = vi.fn().mockResolvedValue({ id: 'msg-abc' });
      mockChannelsFetch.mockResolvedValueOnce({ send: sendMock, name: 'general' });

      await integration.init(makeConfig(), makeDeps());
      await integration.start();

      const id = await integration.sendMessage('ch-123', 'Hello Discord!');
      expect(mockChannelsFetch).toHaveBeenCalledWith('ch-123');
      expect(sendMock).toHaveBeenCalledOnce();
      expect(id).toBe('msg-abc');
    });

    it('should use threadId from metadata as the target channel', async () => {
      const sendMock = vi.fn().mockResolvedValue({ id: 'thread-msg-1' });
      mockChannelsFetch.mockResolvedValueOnce({ send: sendMock, name: 'thread' });

      await integration.init(makeConfig(), makeDeps());
      await integration.start();

      const id = await integration.sendMessage('ch-123', 'Thread reply', {
        threadId: 'thread-ch-456',
      });
      expect(mockChannelsFetch).toHaveBeenCalledWith('thread-ch-456');
      expect(id).toBe('thread-msg-1');
    });

    it('should throw when channel is not found', async () => {
      mockChannelsFetch.mockResolvedValueOnce(null);

      await integration.init(makeConfig(), makeDeps());
      await integration.start();

      await expect(integration.sendMessage('bad-ch', 'test')).rejects.toThrow(
        'not found or not a text channel'
      );
    });

    it('should throw when channel has no send method', async () => {
      mockChannelsFetch.mockResolvedValueOnce({ name: 'voice' }); // no .send

      await integration.init(makeConfig(), makeDeps());
      await integration.start();

      await expect(integration.sendMessage('bad-ch', 'test')).rejects.toThrow(
        'not found or not a text channel'
      );
    });

    it('should throw when called before init', async () => {
      await expect(integration.sendMessage('ch', 'hi')).rejects.toThrow('not initialized');
    });

    it('should include files when audioBase64 metadata is present', async () => {
      const sendMock = vi.fn().mockResolvedValue({ id: 'audio-msg' });
      mockChannelsFetch.mockResolvedValueOnce({ send: sendMock, name: 'general' });

      await integration.init(makeConfig(), makeDeps());
      await integration.start();

      const audioBase64 = Buffer.from('fake-audio').toString('base64');
      await integration.sendMessage('ch-123', 'Audio reply', {
        audioBase64,
        audioFormat: 'mp3',
      });

      const sendArg = sendMock.mock.calls[0][0] as Record<string, unknown>;
      expect(sendArg.files).toBeDefined();
      const file = (sendArg.files as any[])[0];
      expect(file.name).toBe('response.mp3');
    });

    it('should call startThread when metadata.startThread is a string', async () => {
      const startThread = vi.fn().mockResolvedValue(undefined);
      const sendMock = vi.fn().mockResolvedValue({ id: 'msg-thread', startThread });
      mockChannelsFetch.mockResolvedValueOnce({ send: sendMock, name: 'general' });

      await integration.init(makeConfig(), makeDeps());
      await integration.start();

      await integration.sendMessage('ch-123', 'New thread', {
        startThread: 'My Thread',
      });

      expect(startThread).toHaveBeenCalledWith({ name: 'My Thread' });
    });
  });

  // ── Slash command registration ─────────────────────────────────────────────

  describe('slash command registration (ready event)', () => {
    it('should register commands globally when clientId is set and no guildId', async () => {
      const { Routes } = await import('discord.js');
      await integration.init(
        makeConfig({ config: { botToken: 'token', clientId: 'client-123' } }),
        makeDeps()
      );
      await integration.start();
      await fireReadyHandlers();
      expect(mockRestPut).toHaveBeenCalledOnce();
      expect(Routes.applicationCommands).toHaveBeenCalledWith('client-123');
    });

    it('should register guild-scoped commands when guildId is set', async () => {
      const { Routes } = await import('discord.js');
      await integration.init(
        makeConfig({
          config: { botToken: 'token', clientId: 'client-123', guildId: 'guild-456' },
        }),
        makeDeps()
      );
      await integration.start();
      await fireReadyHandlers();
      expect(Routes.applicationGuildCommands).toHaveBeenCalledWith('client-123', 'guild-456');
    });

    it('should skip registration when no clientId is configured', async () => {
      await integration.init(
        makeConfig({ config: { botToken: 'token' } }),
        makeDeps()
      );
      await integration.start();
      await fireReadyHandlers();
      expect(mockRestPut).not.toHaveBeenCalled();
    });

    it('should handle REST.put failure gracefully', async () => {
      mockRestPut.mockRejectedValueOnce(new Error('API error'));
      const deps = makeDeps();
      await integration.init(
        makeConfig({ config: { botToken: 'token', clientId: 'client-123' } }),
        deps
      );
      await integration.start();
      // Should not throw
      await expect(fireReadyHandlers()).resolves.not.toThrow();
      expect((deps.logger.warn as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    });
  });

  // ── messageCreate handler ──────────────────────────────────────────────────

  describe('messageCreate handler', () => {
    function getMessageCreateHandler(): (msg: any) => void {
      const call = (mockClientOn as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: any[]) => c[0] === 'messageCreate'
      );
      return call?.[1] as (msg: any) => void;
    }

    it('should normalize a regular text message and call onMessage', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await integration.init(makeConfig(), makeDeps(onMessage));

      const handler = getMessageCreateHandler();
      const fakeMsg = {
        author: { bot: false, id: 'u-1', username: 'alice', displayName: 'Alice' },
        content: 'Hello there',
        channelId: 'ch-1',
        id: 'msg-1',
        channel: { type: 0, name: 'general' },
        attachments: { size: 0, map: () => [] },
        reference: null,
        guildId: 'guild-1',
        createdTimestamp: 1700000000000,
      };

      handler(fakeMsg);
      await new Promise((r) => setTimeout(r, 0));

      expect(onMessage).toHaveBeenCalledOnce();
      const unified: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(unified.id).toBe('dc_msg-1');
      expect(unified.platform).toBe('discord');
      expect(unified.direction).toBe('inbound');
      expect(unified.senderId).toBe('u-1');
      expect(unified.senderName).toBe('Alice');
      expect(unified.chatId).toBe('ch-1');
      expect(unified.text).toBe('Hello there');
      expect(unified.metadata?.isThread).toBe(false);
      expect(unified.metadata?.channelName).toBe('general');
    });

    it('should ignore bot messages', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await integration.init(makeConfig(), makeDeps(onMessage));

      const handler = getMessageCreateHandler();
      handler({
        author: { bot: true, id: 'bot-1', username: 'abot' },
        content: 'I am a bot',
        channelId: 'ch-1',
        id: 'msg-2',
        channel: { type: 0, name: 'bots' },
        attachments: { size: 0, map: () => [] },
        reference: null,
        guildId: 'guild-1',
        createdTimestamp: 1700000000000,
      });
      await new Promise((r) => setTimeout(r, 0));
      expect(onMessage).not.toHaveBeenCalled();
    });

    it('should ignore empty messages with no attachments', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await integration.init(makeConfig(), makeDeps(onMessage));

      const handler = getMessageCreateHandler();
      handler({
        author: { bot: false, id: 'u-1', username: 'alice' },
        content: '   ',
        channelId: 'ch-1',
        id: 'msg-3',
        channel: { type: 0, name: 'general' },
        attachments: { size: 0, map: () => [] },
        reference: null,
        guildId: 'guild-1',
        createdTimestamp: 1700000000000,
      });
      await new Promise((r) => setTimeout(r, 0));
      expect(onMessage).not.toHaveBeenCalled();
    });

    it('should set isThread=true and threadId for PublicThread channels', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await integration.init(makeConfig(), makeDeps(onMessage));

      const handler = getMessageCreateHandler();
      handler({
        author: { bot: false, id: 'u-1', username: 'alice', displayName: '' },
        content: 'Thread message',
        channelId: 'thread-ch-1',
        id: 'msg-t1',
        channel: {
          type: 11, // PublicThread
          name: 'my-thread',
          parent: { name: 'general' },
        },
        attachments: { size: 0, map: () => [] },
        reference: null,
        guildId: 'guild-1',
        createdTimestamp: 1700000000000,
      });
      await new Promise((r) => setTimeout(r, 0));

      const unified: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(unified.metadata?.isThread).toBe(true);
      expect(unified.metadata?.threadId).toBe('thread-ch-1');
      expect(unified.metadata?.channelName).toContain('general');
    });

    it('should allow messages with attachments even if content is empty', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await integration.init(makeConfig(), makeDeps(onMessage));

      const handler = getMessageCreateHandler();
      handler({
        author: { bot: false, id: 'u-1', username: 'alice', displayName: 'Alice' },
        content: '',
        channelId: 'ch-1',
        id: 'msg-4',
        channel: { type: 0, name: 'general' },
        attachments: {
          size: 1,
          map: () => [
            { url: 'https://cdn.discord.com/img.png', name: 'img.png', contentType: 'image/png', size: 1000 },
          ],
        },
        reference: null,
        guildId: 'guild-1',
        createdTimestamp: 1700000000000,
      });
      await new Promise((r) => setTimeout(r, 0));
      expect(onMessage).toHaveBeenCalledOnce();
    });

    it('should set replyToMessageId from message.reference', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await integration.init(makeConfig(), makeDeps(onMessage));

      const handler = getMessageCreateHandler();
      handler({
        author: { bot: false, id: 'u-1', username: 'alice', displayName: 'Alice' },
        content: 'Reply',
        channelId: 'ch-1',
        id: 'msg-5',
        channel: { type: 0, name: 'general' },
        attachments: { size: 0, map: () => [] },
        reference: { messageId: 'orig-msg-42' },
        guildId: 'guild-1',
        createdTimestamp: 1700000000000,
      });
      await new Promise((r) => setTimeout(r, 0));

      const unified: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(unified.replyToMessageId).toBe('orig-msg-42');
    });
  });

  // ── interactionCreate handler ──────────────────────────────────────────────

  describe('interactionCreate handler', () => {
    function getInteractionHandler(): (interaction: any) => void {
      const call = (mockClientOn as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: any[]) => c[0] === 'interactionCreate'
      );
      return call?.[1] as (interaction: any) => void;
    }

    it('should handle modal submit and call onMessage with isModalSubmit metadata', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await integration.init(makeConfig(), makeDeps(onMessage));

      const handler = getInteractionHandler();
      const reply = vi.fn().mockResolvedValue(undefined);
      const fakeModal = {
        isModalSubmit: () => true,
        id: 'modal-1',
        customId: 'friday_feedback',
        user: { id: 'u-1', username: 'alice' },
        channelId: 'ch-1',
        guildId: 'guild-1',
        createdTimestamp: 1700000000000,
        fields: { getTextInputValue: vi.fn().mockReturnValue('Great product!') },
        reply,
      };

      handler(fakeModal);
      await new Promise((r) => setTimeout(r, 0));

      expect(reply).toHaveBeenCalledWith({ content: 'Thank you for your feedback!', ephemeral: true });
      expect(onMessage).toHaveBeenCalledOnce();
      const unified: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(unified.text).toBe('Great product!');
      expect(unified.metadata?.isModalSubmit).toBe(true);
      expect(unified.metadata?.modalCustomId).toBe('friday_feedback');
    });

    it('should ignore interactions that are neither modal submits nor commands', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await integration.init(makeConfig(), makeDeps(onMessage));

      const handler = getInteractionHandler();
      handler({ isModalSubmit: () => false, isCommand: () => false });
      await new Promise((r) => setTimeout(r, 0));
      expect(onMessage).not.toHaveBeenCalled();
    });

    it('/help command should reply with embeds', async () => {
      await integration.init(makeConfig(), makeDeps());

      const handler = getInteractionHandler();
      const reply = vi.fn().mockResolvedValue(undefined);
      handler({
        isModalSubmit: () => false,
        isCommand: () => true,
        commandName: 'help',
        id: 'int-1',
        user: { id: 'u-1', username: 'alice' },
        channelId: 'ch-1',
        guildId: 'guild-1',
        createdTimestamp: Date.now(),
        options: { getString: vi.fn() },
        deferReply: vi.fn(),
        reply,
        showModal: vi.fn(),
      });

      expect(reply).toHaveBeenCalledOnce();
      const arg = reply.mock.calls[0][0] as Record<string, unknown>;
      expect(arg.embeds).toBeDefined();
    });

    it('/status command should reply with embeds', async () => {
      await integration.init(makeConfig(), makeDeps());

      const handler = getInteractionHandler();
      const reply = vi.fn().mockResolvedValue(undefined);
      handler({
        isModalSubmit: () => false,
        isCommand: () => true,
        commandName: 'status',
        id: 'int-2',
        user: { id: 'u-1', username: 'alice' },
        channelId: 'ch-1',
        guildId: 'guild-1',
        createdTimestamp: Date.now(),
        options: { getString: vi.fn() },
        deferReply: vi.fn(),
        reply,
        showModal: vi.fn(),
      });

      expect(reply).toHaveBeenCalledOnce();
      const arg = reply.mock.calls[0][0] as Record<string, unknown>;
      expect(arg.embeds).toBeDefined();
    });

    it('/feedback command should call showModal', async () => {
      await integration.init(makeConfig(), makeDeps());

      const handler = getInteractionHandler();
      const showModal = vi.fn().mockResolvedValue(undefined);
      handler({
        isModalSubmit: () => false,
        isCommand: () => true,
        commandName: 'feedback',
        id: 'int-3',
        user: { id: 'u-1', username: 'alice' },
        channelId: 'ch-1',
        guildId: 'guild-1',
        createdTimestamp: Date.now(),
        options: { getString: vi.fn() },
        deferReply: vi.fn(),
        reply: vi.fn(),
        showModal,
      });

      expect(showModal).toHaveBeenCalledOnce();
    });

    it('/ask command should call onMessage with isSlashCommand metadata', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await integration.init(makeConfig(), makeDeps(onMessage));

      const handler = getInteractionHandler();
      const deferReply = vi.fn().mockResolvedValue(undefined);
      handler({
        isModalSubmit: () => false,
        isCommand: () => true,
        commandName: 'ask',
        id: 'int-4',
        user: { id: 'u-1', username: 'alice' },
        channelId: 'ch-1',
        guildId: 'guild-1',
        createdTimestamp: 1700000000000,
        options: { getString: vi.fn().mockReturnValue('What is AI?') },
        deferReply,
        reply: vi.fn(),
        showModal: vi.fn(),
      });

      await new Promise((r) => setTimeout(r, 0));

      expect(deferReply).toHaveBeenCalledOnce();
      expect(onMessage).toHaveBeenCalledOnce();
      const unified: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(unified.text).toBe('What is AI?');
      expect(unified.metadata?.isSlashCommand).toBe(true);
      expect(unified.metadata?.commandName).toBe('ask');
    });
  });
});
