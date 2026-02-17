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
const mockLogin = vi.fn().mockResolvedValue('token');
const mockDestroy = vi.fn();
const mockIsReady = vi.fn().mockReturnValue(true);
const mockChannelsFetch = vi.fn().mockResolvedValue(mockChannel);
const mockRestPut = vi.fn().mockResolvedValue(undefined);

vi.mock('discord.js', () => {
  class MockClient {
    on = mockClientOn;
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
    REST: MockREST,
    Routes: {
      applicationGuildCommands: vi.fn(() => '/commands'),
      applicationCommands: vi.fn(() => '/commands'),
    },
    MessageEmbed: MockEmbedBuilder,
    EmbedBuilder: MockEmbedBuilder,
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

describe('DiscordIntegration', () => {
  let integration: DiscordIntegration;

  beforeEach(() => {
    vi.clearAllMocks();
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

    // Should not throw
    const int = new DiscordIntegration();
    await int.init(makeConfig({ config: { botToken: 'token', clientId: 'cid' } }), makeDeps());
  });

  it('should handle messageCreate events', async () => {
    const onMessage = vi.fn().mockResolvedValue(undefined);
    await integration.init(makeConfig(), { logger: noopLogger(), onMessage });

    const messageCreateCall = mockClientOn.mock.calls.find(
      (call: any[]) => call[0] === 'messageCreate'
    );
    expect(messageCreateCall).toBeDefined();
  });

  it('should handle interactionCreate events', async () => {
    await integration.init(makeConfig(), makeDeps());

    const interactionCall = mockClientOn.mock.calls.find(
      (call: any[]) => call[0] === 'interactionCreate'
    );
    expect(interactionCall).toBeDefined();
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
