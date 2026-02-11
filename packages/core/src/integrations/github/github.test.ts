import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IntegrationConfig } from '@friday/shared';
import type { IntegrationDeps } from '../types.js';
import type { SecureLogger } from '../../logging/logger.js';

// Mock @octokit/rest
const mockCreateComment = vi.fn().mockResolvedValue({ data: { id: 42 } });

vi.mock('@octokit/rest', () => {
  class MockOctokit {
    issues = { createComment: mockCreateComment };
    constructor(_opts?: any) {}
  }
  return { Octokit: MockOctokit };
});

// Mock @octokit/webhooks
const webhookHandlers: Record<string, Function> = {};
const mockVerify = vi.fn();
const mockVerifyAndReceive = vi.fn().mockResolvedValue(undefined);

vi.mock('@octokit/webhooks', () => {
  class MockWebhooks {
    on = vi.fn((event: string, handler: Function) => {
      webhookHandlers[event] = handler;
    });
    verify = mockVerify;
    verifyAndReceive = mockVerifyAndReceive;
    constructor(_opts?: any) {}
  }
  return { Webhooks: MockWebhooks };
});

import { GitHubIntegration } from './adapter.js';

function noopLogger(): SecureLogger {
  const noop = () => {};
  return {
    trace: noop, debug: noop, info: noop, warn: noop, error: noop, fatal: noop,
    child: () => noopLogger(),
    level: 'silent',
  } as SecureLogger;
}

function makeConfig(overrides: Partial<IntegrationConfig> = {}): IntegrationConfig {
  return {
    id: 'gh_int_1',
    platform: 'github',
    displayName: 'Test GitHub Bot',
    enabled: true,
    status: 'disconnected',
    config: { personalAccessToken: 'ghp_test', webhookSecret: 'secret123' },
    messageCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeDeps(onMessage = vi.fn().mockResolvedValue(undefined)): IntegrationDeps {
  return { logger: noopLogger(), onMessage };
}

describe('GitHubIntegration', () => {
  let integration: GitHubIntegration;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(webhookHandlers).forEach((k) => delete webhookHandlers[k]);
    integration = new GitHubIntegration();
  });

  it('should have github platform', () => {
    expect(integration.platform).toBe('github');
  });

  it('should have rate limit config', () => {
    expect(integration.platformRateLimit).toEqual({ maxPerSecond: 30 });
  });

  it('should throw without personalAccessToken', async () => {
    await expect(
      integration.init(
        makeConfig({ config: { webhookSecret: 'secret' } }),
        makeDeps(),
      ),
    ).rejects.toThrow('personalAccessToken');
  });

  it('should throw without webhookSecret', async () => {
    await expect(
      integration.init(
        makeConfig({ config: { personalAccessToken: 'token' } }),
        makeDeps(),
      ),
    ).rejects.toThrow('webhookSecret');
  });

  it('should initialize successfully', async () => {
    await integration.init(makeConfig(), makeDeps());
    expect(webhookHandlers['push']).toBeDefined();
    expect(webhookHandlers['pull_request']).toBeDefined();
    expect(webhookHandlers['issues']).toBeDefined();
    expect(webhookHandlers['issue_comment']).toBeDefined();
  });

  it('should start successfully', async () => {
    await integration.init(makeConfig(), makeDeps());
    await integration.start();
    expect(integration.isHealthy()).toBe(true);
  });

  it('should throw start without init', async () => {
    await expect(integration.start()).rejects.toThrow('not initialized');
  });

  it('should stop successfully', async () => {
    await integration.init(makeConfig(), makeDeps());
    await integration.start();
    await integration.stop();
    expect(integration.isHealthy()).toBe(false);
  });

  it('should not start twice', async () => {
    await integration.init(makeConfig(), makeDeps());
    await integration.start();
    await integration.start(); // no-op
    expect(integration.isHealthy()).toBe(true);
  });

  it('should send message as issue comment', async () => {
    await integration.init(makeConfig(), makeDeps());
    const commentId = await integration.sendMessage(
      'owner/repo/issues/42',
      'This is a comment',
    );
    expect(commentId).toBe('42');
    expect(mockCreateComment).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      issue_number: 42,
      body: 'This is a comment',
    });
  });

  it('should throw sendMessage with invalid chatId format', async () => {
    await integration.init(makeConfig(), makeDeps());
    await expect(integration.sendMessage('bad-format', 'hi')).rejects.toThrow('Invalid chatId');
  });

  it('should throw sendMessage without init', async () => {
    await expect(integration.sendMessage('o/r/i/1', 'hi')).rejects.toThrow('not initialized');
  });

  it('should return webhook path', async () => {
    await integration.init(makeConfig(), makeDeps());
    expect(integration.getWebhookPath()).toBe('/api/v1/webhooks/github/gh_int_1');
  });

  it('should verify webhook signature', async () => {
    await integration.init(makeConfig(), makeDeps());
    mockVerify.mockReturnValue(undefined);
    expect(integration.verifyWebhook('payload', 'sig')).toBe(true);
  });

  it('should return false for invalid webhook signature', async () => {
    await integration.init(makeConfig(), makeDeps());
    mockVerify.mockImplementation(() => { throw new Error('bad sig'); });
    expect(integration.verifyWebhook('payload', 'bad')).toBe(false);
  });

  it('should return false for verifyWebhook without init', () => {
    expect(integration.verifyWebhook('payload', 'sig')).toBe(false);
  });

  it('should report unhealthy when not running', () => {
    expect(integration.isHealthy()).toBe(false);
  });
});
