/**
 * Unit tests for GitHubIntegration adapter.
 *
 * All @octokit/rest and @octokit/webhooks imports are fully mocked
 * so no real network calls are made.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IntegrationConfig } from '@secureyeoman/shared';
import type { IntegrationDeps } from '../types.js';
import type { SecureLogger } from '../../logging/logger.js';

// ── Stable mock references (must be declared before vi.mock factories) ────────

const mocks = vi.hoisted(() => {
  const webhooksOn = vi.fn();
  const webhooksVerify = vi.fn();
  const webhooksVerifyAndReceive = vi.fn().mockResolvedValue(undefined);

  const octokitIssuesCreateComment = vi.fn().mockResolvedValue({ data: { id: 101 } });
  const octokitIssuesAddLabels = vi.fn().mockResolvedValue({});
  const octokitPullsCreateReview = vi.fn().mockResolvedValue({ data: { id: 202 } });

  const mockWebhooksInstance = {
    on: webhooksOn,
    verify: webhooksVerify,
    verifyAndReceive: webhooksVerifyAndReceive,
  };

  const mockOctokitInstance = {
    issues: {
      createComment: octokitIssuesCreateComment,
      addLabels: octokitIssuesAddLabels,
    },
    pulls: {
      createReview: octokitPullsCreateReview,
    },
  };

  return {
    webhooksOn,
    webhooksVerify,
    webhooksVerifyAndReceive,
    octokitIssuesCreateComment,
    octokitIssuesAddLabels,
    octokitPullsCreateReview,
    mockWebhooksInstance,
    mockOctokitInstance,
  };
});

// ── Mock @octokit/rest ────────────────────────────────────────────────────────

vi.mock('@octokit/rest', () => {
  const MockOctokit = vi.fn().mockImplementation(function () {
    return mocks.mockOctokitInstance;
  });
  return { Octokit: MockOctokit };
});

// ── Mock @octokit/webhooks ────────────────────────────────────────────────────

vi.mock('@octokit/webhooks', () => {
  const MockWebhooks = vi.fn().mockImplementation(function () {
    return mocks.mockWebhooksInstance;
  });
  return { Webhooks: MockWebhooks };
});

// ── Import adapter after mocks ────────────────────────────────────────────────

import { GitHubIntegration } from './adapter.js';

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
    id: 'gh-test-id',
    platform: 'github',
    displayName: 'Test GitHub Integration',
    enabled: true,
    status: 'disconnected',
    config: {
      personalAccessToken: 'ghp_test_token',
      webhookSecret: 'test-webhook-secret',
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

/**
 * Retrieve a handler registered via webhooks.on(eventName, handler).
 * The mock captures all calls as [eventName, handler].
 */
function getWebhookHandler(eventName: string): ((...args: any[]) => any) | undefined {
  const call = mocks.webhooksOn.mock.calls.find((c: any[]) => c[0] === eventName);
  return call?.[1] as ((...args: any[]) => any) | undefined;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GitHubIntegration', () => {
  let integration: GitHubIntegration;

  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default resolved values after clearAllMocks
    mocks.octokitIssuesCreateComment.mockResolvedValue({ data: { id: 101 } });
    mocks.octokitIssuesAddLabels.mockResolvedValue({});
    mocks.octokitPullsCreateReview.mockResolvedValue({ data: { id: 202 } });
    mocks.webhooksVerifyAndReceive.mockResolvedValue(undefined);
    integration = new GitHubIntegration();
  });

  // ── Platform metadata ──────────────────────────────────────────────────────

  it('should expose platform as "github"', () => {
    expect(integration.platform).toBe('github');
  });

  it('should expose platformRateLimit of 30 msg/s', () => {
    expect(integration.platformRateLimit).toEqual({ maxPerSecond: 30 });
  });

  // ── init() ─────────────────────────────────────────────────────────────────

  describe('init()', () => {
    it('should initialize successfully with valid config', async () => {
      await expect(integration.init(makeConfig(), makeDeps())).resolves.not.toThrow();
    });

    it('should throw when personalAccessToken is missing', async () => {
      await expect(
        integration.init(makeConfig({ config: { webhookSecret: 'secret' } }), makeDeps())
      ).rejects.toThrow('personalAccessToken');
    });

    it('should throw when webhookSecret is missing', async () => {
      await expect(
        integration.init(makeConfig({ config: { personalAccessToken: 'ghp_token' } }), makeDeps())
      ).rejects.toThrow('webhookSecret');
    });

    it('should register webhook event listeners after init', async () => {
      await integration.init(makeConfig(), makeDeps());
      const registeredEvents = mocks.webhooksOn.mock.calls.map((c: any[]) => c[0]);
      expect(registeredEvents).toContain('push');
      expect(registeredEvents).toContain('pull_request');
      expect(registeredEvents).toContain('pull_request_review');
      expect(registeredEvents).toContain('pull_request_review_comment');
      expect(registeredEvents).toContain('issues');
      expect(registeredEvents).toContain('issue_comment');
    });
  });

  // ── start() ────────────────────────────────────────────────────────────────

  describe('start()', () => {
    it('should set running=true and become healthy', async () => {
      await integration.init(makeConfig(), makeDeps());
      await integration.start();
      expect(integration.isHealthy()).toBe(true);
    });

    it('should throw when called before init', async () => {
      await expect(integration.start()).rejects.toThrow('not initialized');
    });

    it('should be idempotent — second start is a no-op', async () => {
      await integration.init(makeConfig(), makeDeps());
      await integration.start();
      await integration.start(); // second call should not throw
      expect(integration.isHealthy()).toBe(true);
    });
  });

  // ── stop() ─────────────────────────────────────────────────────────────────

  describe('stop()', () => {
    it('should set running=false and become unhealthy', async () => {
      await integration.init(makeConfig(), makeDeps());
      await integration.start();
      await integration.stop();
      expect(integration.isHealthy()).toBe(false);
    });

    it('should be safe to call without prior start', async () => {
      await integration.init(makeConfig(), makeDeps());
      await expect(integration.stop()).resolves.not.toThrow();
    });

    it('should be safe to call without prior init', async () => {
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

  // ── getWebhookPath() ───────────────────────────────────────────────────────

  describe('getWebhookPath()', () => {
    it('returns path containing the integration id', async () => {
      await integration.init(makeConfig(), makeDeps());
      expect(integration.getWebhookPath()).toBe('/api/v1/webhooks/github/gh-test-id');
    });

    it('returns "unknown" when called before init', () => {
      expect(integration.getWebhookPath()).toBe('/api/v1/webhooks/github/unknown');
    });
  });

  // ── verifyWebhook() ────────────────────────────────────────────────────────

  describe('verifyWebhook()', () => {
    it('returns true when webhooks.verify() does not throw', async () => {
      mocks.webhooksVerify.mockReturnValue(undefined);
      await integration.init(makeConfig(), makeDeps());
      const result = integration.verifyWebhook('payload', 'valid-sig');
      expect(result).toBe(true);
      expect(mocks.webhooksVerify).toHaveBeenCalledWith('payload', 'valid-sig');
    });

    it('returns false when webhooks.verify() throws', async () => {
      mocks.webhooksVerify.mockImplementation(() => {
        throw new Error('Invalid signature');
      });
      await integration.init(makeConfig(), makeDeps());
      const result = integration.verifyWebhook('payload', 'bad-sig');
      expect(result).toBe(false);
    });

    it('returns false when called before init', () => {
      const result = integration.verifyWebhook('payload', 'sig');
      expect(result).toBe(false);
    });
  });

  // ── handleWebhook() ────────────────────────────────────────────────────────

  describe('handleWebhook()', () => {
    it('calls webhooks.verifyAndReceive with correct args', async () => {
      await integration.init(makeConfig(), makeDeps());
      await integration.handleWebhook('push', '{"ref":"main"}', 'sha256=abc');

      expect(mocks.webhooksVerifyAndReceive).toHaveBeenCalledOnce();
      const arg = mocks.webhooksVerifyAndReceive.mock.calls[0][0] as Record<string, unknown>;
      expect(arg.name).toBe('push');
      expect(arg.payload).toBe('{"ref":"main"}');
      expect(arg.signature).toBe('sha256=abc');
      expect(typeof arg.id).toBe('string');
    });

    it('throws when called before init', async () => {
      await expect(integration.handleWebhook('push', '{}', 'sig')).rejects.toThrow(
        'not initialized'
      );
    });
  });

  // ── sendMessage() ──────────────────────────────────────────────────────────

  describe('sendMessage()', () => {
    beforeEach(async () => {
      await integration.init(makeConfig(), makeDeps());
    });

    it('posts an issue comment and returns string id', async () => {
      const id = await integration.sendMessage('owner/repo/issues/42', 'Hello issue!');
      expect(mocks.octokitIssuesCreateComment).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 42,
        body: 'Hello issue!',
      });
      expect(id).toBe('101');
    });

    it('posts a PR review when metadata.reviewEvent is set and type is "pulls"', async () => {
      const id = await integration.sendMessage('owner/repo/pulls/7', 'Looks good!', {
        reviewEvent: 'APPROVE',
      });
      expect(mocks.octokitPullsCreateReview).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'owner',
          repo: 'repo',
          pull_number: 7,
          body: 'Looks good!',
          event: 'APPROVE',
        })
      );
      expect(id).toBe('202');
    });

    it('posts an issue comment even for pulls chatId without metadata.reviewEvent', async () => {
      const id = await integration.sendMessage('owner/repo/pulls/3', 'PR comment');
      expect(mocks.octokitIssuesCreateComment).toHaveBeenCalledOnce();
      expect(id).toBe('101');
    });

    it('throws on chatId with fewer than 4 parts', async () => {
      await expect(integration.sendMessage('owner/repo/issues', 'bad chatId')).rejects.toThrow(
        'Invalid chatId format'
      );
    });

    it('throws on invalid (NaN) issue number in chatId', async () => {
      await expect(
        integration.sendMessage('owner/repo/issues/notanumber', 'bad number')
      ).rejects.toThrow('Invalid issue/PR number');
    });

    it('throws when called before init', async () => {
      const uninit = new GitHubIntegration();
      await expect(uninit.sendMessage('o/r/issues/1', 'hi')).rejects.toThrow('not initialized');
    });
  });

  // ── issues event: auto-labeling ───────────────────────────────────────────

  describe('issues event handler — auto-labeling', () => {
    it('calls addLabels when autoLabelKeywords match issue text', async () => {
      const config = makeConfig({
        config: {
          personalAccessToken: 'ghp_token',
          webhookSecret: 'secret',
          autoLabelKeywords: { bug: ['crash', 'error'], feature: ['request', 'enhancement'] },
        },
      });
      await integration.init(config, makeDeps());

      const handler = getWebhookHandler('issues');
      expect(handler).toBeDefined();

      await handler!({
        id: 'evt-1',
        payload: {
          action: 'opened',
          issue: {
            id: 111,
            number: 5,
            title: 'App crash on startup',
            body: 'It crashes immediately.',
            state: 'open',
            html_url: 'https://github.com/o/r/issues/5',
          },
          repository: {
            name: 'repo',
            owner: { login: 'owner' },
          },
          sender: { login: 'alice' },
        },
      });

      await new Promise((r) => setTimeout(r, 0));
      expect(mocks.octokitIssuesAddLabels).toHaveBeenCalledWith(
        expect.objectContaining({ labels: expect.arrayContaining(['bug']) })
      );
    });

    it('does not call addLabels when no keywords match', async () => {
      const config = makeConfig({
        config: {
          personalAccessToken: 'ghp_token',
          webhookSecret: 'secret',
          autoLabelKeywords: { bug: ['crash'] },
        },
      });
      await integration.init(config, makeDeps());

      const handler = getWebhookHandler('issues');
      await handler!({
        id: 'evt-2',
        payload: {
          action: 'opened',
          issue: {
            id: 222,
            number: 6,
            title: 'New feature request',
            body: 'Please add dark mode.',
            state: 'open',
            html_url: 'https://github.com/o/r/issues/6',
          },
          repository: {
            name: 'repo',
            owner: { login: 'owner' },
          },
          sender: { login: 'bob' },
        },
      });

      await new Promise((r) => setTimeout(r, 0));
      expect(mocks.octokitIssuesAddLabels).not.toHaveBeenCalled();
    });

    it('does not call addLabels when action is not "opened"', async () => {
      const config = makeConfig({
        config: {
          personalAccessToken: 'ghp_token',
          webhookSecret: 'secret',
          autoLabelKeywords: { bug: ['crash'] },
        },
      });
      await integration.init(config, makeDeps());

      const handler = getWebhookHandler('issues');
      await handler!({
        id: 'evt-3',
        payload: {
          action: 'closed',
          issue: {
            id: 333,
            number: 7,
            title: 'crash bug',
            body: 'crash',
            state: 'closed',
            html_url: 'https://github.com/o/r/issues/7',
          },
          repository: {
            name: 'repo',
            owner: { login: 'owner' },
          },
          sender: { login: 'carol' },
        },
      });

      await new Promise((r) => setTimeout(r, 0));
      expect(mocks.octokitIssuesAddLabels).not.toHaveBeenCalled();
    });
  });
});
