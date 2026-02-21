import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IntegrationConfig, UnifiedMessage } from '@secureyeoman/shared';
import type { IntegrationDeps } from '../types.js';
import type { SecureLogger } from '../../logging/logger.js';

// Mock discord.js before importing the adapter
const mockChannel = {
  send: vi.fn().mockResolvedValue({ id: 'sent_123' }),
  name: 'general',
};

const mockClientOn = vi.fn();
const mockLogin = vi.fn();
const mockDestroy = vi.fn();
const mockIsReady = vi.fn().mockReturnValue(true);
const mockChannelsFetch = vi.fn().mockResolvedValue(mockChannel);
const mockRestPut = vi.fn().mockResolvedValue(undefined);

// Tracks ready handlers so mockLogin can fire them
const readyHandlers: Array<() => Promise<void>> = [];

vi.mock('discord.js', () => {
  const mockClientOnce = vi.fn((event: string, handler: () => Promise<void>) => {
    if (event === 'ready') {
      readyHandlers.push(handler);
    }
  });

  class MockClient {
    on = mockClientOn;
    once = mockClientOnce;
    login = mockLogin;
    destroy = mockDestroy;
    isReady = mockIsReady;
    channels = { fetch: mockChannelsFetch };
    constructor(_opts?: any) {}
  }

  class MockREST {
    setToken() {
      return this;
    }
    put = mockRestPut;
    constructor(_opts?: any) {}
  }

  class MockEmbedBuilder {
    setTitle() {
      return this;
    }
    setDescription() {
      return this;
    }
    setColor() {
      return this;
    }
    setTimestamp() {
      return this;
    }
    addFields() {
      return this;
    }
  }

  class MockModalBuilder {
    setCustomId() {
      return this;
    }
    setTitle() {
      return this;
    }
    addComponents() {
      return this;
    }
  }

  class MockTextInputBuilder {
    setCustomId() {
      return this;
    }
    setLabel() {
      return this;
    }
    setStyle() {
      return this;
    }
  }

  class MockActionRowBuilder {
    addComponents() {
      return this;
    }
  }

  return {
    Client: MockClient,
    Intents: {
      FLAGS: {
        GUILDS: 1,
        GUILD_MESSAGES: 2,
      },
    },
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
    REST: MockREST,
    Routes: {
      applicationGuildCommands: vi.fn(
        (clientId: string, guildId: string) => `/guilds/${guildId}/commands`
      ),
      applicationCommands: vi.fn((clientId: string) => `/applications/${clientId}/commands`),
    },
    MessageEmbed: MockEmbedBuilder,
    EmbedBuilder: MockEmbedBuilder,
    ModalBuilder: MockModalBuilder,
    TextInputBuilder: MockTextInputBuilder,
    ActionRowBuilder: MockActionRowBuilder,
  };
});

import { DiscordIntegration } from './adapter.js';

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
    id: 'dc_int_1',
    platform: 'discord',
    displayName: 'Test Discord Bot',
    enabled: true,
    status: 'disconnected',
    config: { botToken: 'test-token', clientId: 'client_123' },
    messageCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeDeps(onMessage = vi.fn().mockResolvedValue(undefined)): IntegrationDeps {
  return { logger: noopLogger(), onMessage };
}

// Fires all registered ready handlers (simulates client becoming ready after login)
async function fireReadyHandlers() {
  for (const h of readyHandlers) {
    await h();
  }
}

describe('DiscordIntegration', () => {
  let integration: DiscordIntegration;

  beforeEach(() => {
    vi.clearAllMocks();
    readyHandlers.length = 0;
    mockLogin.mockResolvedValue('token');
    integration = new DiscordIntegration();
  });

  it('should have discord platform', () => {
    expect(integration.platform).toBe('discord');
  });

  it('should have rate limit config', () => {
    expect(integration.platformRateLimit).toEqual({ maxPerSecond: 50 });
  });

  it('should throw without botToken', async () => {
    await expect(integration.init(makeConfig({ config: {} }), makeDeps())).rejects.toThrow(
      'botToken'
    );
  });

  it('should initialize successfully with valid config', async () => {
    await integration.init(makeConfig(), makeDeps());
    expect(mockClientOn).toHaveBeenCalled();
  });

  it('should start and login', async () => {
    await integration.init(makeConfig(), makeDeps());
    await integration.start();
    expect(integration.isHealthy()).toBe(true);
  });

  it('should throw start without init', async () => {
    await expect(integration.start()).rejects.toThrow('not initialized');
  });

  it('should stop cleanly', async () => {
    await integration.init(makeConfig(), makeDeps());
    await integration.start();
    await integration.stop();
    expect(integration.isHealthy()).toBe(false);
  });

  it('should not start twice', async () => {
    await integration.init(makeConfig(), makeDeps());
    await integration.start();
    await integration.start(); // should not throw
    expect(integration.isHealthy()).toBe(true);
  });

  it('should stop when not running without error', async () => {
    await integration.stop(); // should not throw
  });

  it('should send message via channel.send', async () => {
    await integration.init(makeConfig(), makeDeps());
    await integration.start();
    const msgId = await integration.sendMessage('channel_123', 'Hello Discord!');
    expect(msgId).toBe('sent_123');
  });

  it('should throw sendMessage without init', async () => {
    await expect(integration.sendMessage('ch', 'hi')).rejects.toThrow('not initialized');
  });

  it('should report unhealthy when not running', () => {
    expect(integration.isHealthy()).toBe(false);
  });

  it('should initialize with guild ID config', async () => {
    await integration.init(
      makeConfig({ config: { botToken: 'token', clientId: 'cid', guildId: 'gid' } }),
      makeDeps()
    );
    expect(mockClientOn).toHaveBeenCalled();
  });

  it('should initialize with clientId but no guild ID', async () => {
    await integration.init(
      makeConfig({ config: { botToken: 'token', clientId: 'cid' } }),
      makeDeps()
    );
    expect(mockClientOn).toHaveBeenCalled();
  });

  it('should handle slash command registration failure gracefully', async () => {
    mockRestPut.mockRejectedValueOnce(new Error('API error'));

    const int = new DiscordIntegration();
    await int.init(makeConfig({ config: { botToken: 'token', clientId: 'cid' } }), makeDeps());
    await int.start();
    // Fire ready handlers — registration will fail but should not throw
    await fireReadyHandlers();
    // No assertion needed; test passes if no exception was thrown
  });

  it('should call REST.put to register slash commands on ready', async () => {
    await integration.init(
      makeConfig({ config: { botToken: 'token', clientId: 'client_123' } }),
      makeDeps()
    );
    await integration.start();
    await fireReadyHandlers();
    expect(mockRestPut).toHaveBeenCalledOnce();
  });

  it('should use applicationGuildCommands for guild-scoped registration', async () => {
    const { Routes } = await import('discord.js');
    await integration.init(
      makeConfig({ config: { botToken: 'token', clientId: 'client_123', guildId: 'guild_456' } }),
      makeDeps()
    );
    await integration.start();
    await fireReadyHandlers();
    expect(Routes.applicationGuildCommands).toHaveBeenCalledWith('client_123', 'guild_456');
  });

  it('should use applicationCommands for global registration (no guildId)', async () => {
    const { Routes } = await import('discord.js');
    await integration.init(
      makeConfig({ config: { botToken: 'token', clientId: 'client_123' } }),
      makeDeps()
    );
    await integration.start();
    await fireReadyHandlers();
    expect(Routes.applicationCommands).toHaveBeenCalledWith('client_123');
  });

  it('should skip registration if no clientId', async () => {
    await integration.init(makeConfig({ config: { botToken: 'token' } }), makeDeps());
    await integration.start();
    await fireReadyHandlers();
    expect(mockRestPut).not.toHaveBeenCalled();
  });

  it('should handle messageCreate events', async () => {
    const onMessage = vi.fn().mockResolvedValue(undefined);
    await integration.init(makeConfig(), { logger: noopLogger(), onMessage });

    const messageCreateCall = mockClientOn.mock.calls.find(
      (call: any[]) => call[0] === 'messageCreate'
    );
    expect(messageCreateCall).toBeDefined();
  });

  it('should detect thread channels and set metadata.isThread', async () => {
    const onMessage = vi.fn().mockResolvedValue(undefined);
    await integration.init(makeConfig(), { logger: noopLogger(), onMessage });

    const messageCreateHandler = mockClientOn.mock.calls.find(
      (call: any[]) => call[0] === 'messageCreate'
    )?.[1] as ((msg: any) => void) | undefined;
    expect(messageCreateHandler).toBeDefined();

    const fakeThreadMessage = {
      author: { bot: false, id: 'u1', username: 'user1', displayName: 'User One' },
      content: 'Hello in thread',
      channelId: 'thread_ch',
      id: 'msg_t1',
      channel: {
        type: 11, // PublicThread
        name: 'my-thread',
        parent: { name: 'general' },
      },
      attachments: { size: 0, map: () => [] },
      reference: null,
      guildId: 'guild_1',
      createdTimestamp: 1700000000000,
    };

    messageCreateHandler!(fakeThreadMessage);

    // Allow microtask to settle
    await new Promise((r) => setTimeout(r, 0));

    expect(onMessage).toHaveBeenCalledOnce();
    const msg: UnifiedMessage = onMessage.mock.calls[0][0];
    expect(msg.metadata?.isThread).toBe(true);
    expect(msg.metadata?.threadId).toBe('thread_ch');
  });

  it('should not set isThread for regular guild text channels', async () => {
    const onMessage = vi.fn().mockResolvedValue(undefined);
    await integration.init(makeConfig(), { logger: noopLogger(), onMessage });

    const messageCreateHandler = mockClientOn.mock.calls.find(
      (call: any[]) => call[0] === 'messageCreate'
    )?.[1] as ((msg: any) => void) | undefined;

    const fakeMessage = {
      author: { bot: false, id: 'u1', username: 'user1', displayName: 'User One' },
      content: 'Hello',
      channelId: 'ch_1',
      id: 'msg_1',
      channel: { type: 0, name: 'general' }, // GuildText
      attachments: { size: 0, map: () => [] },
      reference: null,
      guildId: 'guild_1',
      createdTimestamp: 1700000000000,
    };

    messageCreateHandler!(fakeMessage);
    await new Promise((r) => setTimeout(r, 0));

    const msg: UnifiedMessage = onMessage.mock.calls[0][0];
    expect(msg.metadata?.isThread).toBe(false);
    expect(msg.metadata?.threadId).toBeUndefined();
  });

  it('should handle interactionCreate events', async () => {
    await integration.init(makeConfig(), makeDeps());

    const interactionCall = mockClientOn.mock.calls.find(
      (call: any[]) => call[0] === 'interactionCreate'
    );
    expect(interactionCall).toBeDefined();
  });

  it('/feedback command should call showModal', async () => {
    await integration.init(makeConfig(), makeDeps());

    const interactionHandler = mockClientOn.mock.calls.find(
      (call: any[]) => call[0] === 'interactionCreate'
    )?.[1] as ((interaction: any) => void) | undefined;
    expect(interactionHandler).toBeDefined();

    const showModal = vi.fn();
    const fakeInteraction = {
      isModalSubmit: () => false,
      isCommand: () => true,
      commandName: 'feedback',
      id: 'int_1',
      user: { id: 'u1', username: 'user1' },
      channelId: 'ch_1',
      guildId: 'guild_1',
      createdTimestamp: Date.now(),
      options: { getString: vi.fn() },
      deferReply: vi.fn(),
      reply: vi.fn(),
      showModal,
    };

    interactionHandler!(fakeInteraction);

    expect(showModal).toHaveBeenCalledOnce();
  });

  it('modal submit should call onMessage with isModalSubmit metadata', async () => {
    const onMessage = vi.fn().mockResolvedValue(undefined);
    await integration.init(makeConfig(), { logger: noopLogger(), onMessage });

    const interactionHandler = mockClientOn.mock.calls.find(
      (call: any[]) => call[0] === 'interactionCreate'
    )?.[1] as ((interaction: any) => void) | undefined;

    const fakeModalSubmit = {
      isModalSubmit: () => true,
      id: 'modal_1',
      customId: 'friday_feedback',
      user: { id: 'u1', username: 'user1' },
      channelId: 'ch_1',
      guildId: 'guild_1',
      createdTimestamp: Date.now(),
      fields: {
        getTextInputValue: vi.fn().mockReturnValue('Great product!'),
      },
      reply: vi.fn().mockResolvedValue(undefined),
    };

    interactionHandler!(fakeModalSubmit);

    // Flush microtasks
    await new Promise((r) => setTimeout(r, 0));

    expect(onMessage).toHaveBeenCalledOnce();
    const msg: UnifiedMessage = onMessage.mock.calls[0][0];
    expect(msg.text).toBe('Great product!');
    expect(msg.metadata?.isModalSubmit).toBe(true);
    expect(msg.metadata?.modalCustomId).toBe('friday_feedback');
  });

  it('should support sendMessage with threadId metadata', async () => {
    await integration.init(makeConfig(), makeDeps());
    await integration.start();

    const threadChannel = {
      send: vi.fn().mockResolvedValue({ id: 'thread_msg_1' }),
      name: 'thread',
    };
    mockChannelsFetch.mockResolvedValueOnce(threadChannel);

    const msgId = await integration.sendMessage('ch_123', 'Hello thread!', {
      threadId: 'thread_ch_456',
    });
    expect(mockChannelsFetch).toHaveBeenCalledWith('thread_ch_456');
    expect(msgId).toBe('thread_msg_1');
  });

  it('should register error handler', async () => {
    await integration.init(makeConfig(), makeDeps());

    const errorCall = mockClientOn.mock.calls.find((call: any[]) => call[0] === 'error');
    expect(errorCall).toBeDefined();
  });

  it('should skip clientId registration if no clientId', async () => {
    await integration.init(makeConfig({ config: { botToken: 'token' } }), makeDeps());
    // Should not throw, just skip registration
  });
});
