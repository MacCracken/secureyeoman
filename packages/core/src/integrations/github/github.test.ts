import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IntegrationConfig } from '@secureyeoman/shared';
import type { IntegrationDeps } from '../types.js';
import type { SecureLogger } from '../../logging/logger.js';

// Mock @octokit/rest
const mockCreateComment = vi.fn().mockResolvedValue({ data: { id: 42 } });
const mockCreateReview = vi.fn().mockResolvedValue({ data: { id: 99 } });
const mockAddLabels = vi.fn().mockResolvedValue({ data: [] });

vi.mock('@octokit/rest', () => {
  class MockOctokit {
    issues = { createComment: mockCreateComment, addLabels: mockAddLabels };
    pulls = { createReview: mockCreateReview };
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
      integration.init(makeConfig({ config: { webhookSecret: 'secret' } }), makeDeps())
    ).rejects.toThrow('personalAccessToken');
  });

  it('should throw without webhookSecret', async () => {
    await expect(
      integration.init(makeConfig({ config: { personalAccessToken: 'token' } }), makeDeps())
    ).rejects.toThrow('webhookSecret');
  });

  it('should initialize successfully', async () => {
    await integration.init(makeConfig(), makeDeps());
    expect(webhookHandlers['push']).toBeDefined();
    expect(webhookHandlers['pull_request']).toBeDefined();
    expect(webhookHandlers['issues']).toBeDefined();
    expect(webhookHandlers['issue_comment']).toBeDefined();
    expect(webhookHandlers['pull_request_review']).toBeDefined();
    expect(webhookHandlers['pull_request_review_comment']).toBeDefined();
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
    const commentId = await integration.sendMessage('owner/repo/issues/42', 'This is a comment');
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
    mockVerify.mockImplementation(() => {
      throw new Error('bad sig');
    });
    expect(integration.verifyWebhook('payload', 'bad')).toBe(false);
  });

  it('should return false for verifyWebhook without init', () => {
    expect(integration.verifyWebhook('payload', 'sig')).toBe(false);
  });

  it('should report unhealthy when not running', () => {
    expect(integration.isHealthy()).toBe(false);
  });

  // ── PR review handler ────────────────────────────────────────────

  it('pull_request_review handler should be registered and normalize correctly', async () => {
    const onMessage = vi.fn().mockResolvedValue(undefined);
    await integration.init(makeConfig(), makeDeps(onMessage));

    const handler = webhookHandlers['pull_request_review']!;
    expect(handler).toBeDefined();

    await handler({
      id: 'evt_1',
      payload: {
        action: 'submitted',
        review: {
          id: 501,
          body: 'Looks good!',
          state: 'approved',
          html_url: 'https://github.com/owner/repo/pull/10#pullrequestreview-501',
        },
        pull_request: {
          number: 10,
          html_url: 'https://github.com/owner/repo/pull/10',
        },
        sender: { login: 'reviewer1' },
        repository: { name: 'repo', owner: { login: 'owner' } },
      },
    });

    expect(onMessage).toHaveBeenCalledOnce();
    const msg = onMessage.mock.calls[0][0];
    expect(msg.id).toBe('gh_review_evt_1');
    expect(msg.platform).toBe('github');
    expect(msg.chatId).toBe('owner/repo/pulls/10');
    expect(msg.text).toBe('Looks good!');
    expect(msg.metadata?.event).toBe('pull_request_review');
    expect(msg.metadata?.action).toBe('submitted');
    expect(msg.metadata?.reviewState).toBe('approved');
    expect(msg.metadata?.reviewId).toBe(501);
    expect(msg.metadata?.prNumber).toBe(10);
  });

  it('pull_request_review handler should handle empty review body', async () => {
    const onMessage = vi.fn().mockResolvedValue(undefined);
    await integration.init(makeConfig(), makeDeps(onMessage));

    const handler = webhookHandlers['pull_request_review']!;

    await handler({
      id: 'evt_2',
      payload: {
        action: 'dismissed',
        review: { id: 502, body: null, state: 'dismissed' },
        pull_request: { number: 11, html_url: 'https://github.com/owner/repo/pull/11' },
        sender: { login: 'user1' },
        repository: { name: 'repo', owner: { login: 'owner' } },
      },
    });

    const msg = onMessage.mock.calls[0][0];
    expect(msg.text).toBe('PR review dismissed: dismissed');
  });

  // ── PR review comment handler ────────────────────────────────────

  it('pull_request_review_comment handler should be registered and normalize correctly', async () => {
    const onMessage = vi.fn().mockResolvedValue(undefined);
    await integration.init(makeConfig(), makeDeps(onMessage));

    const handler = webhookHandlers['pull_request_review_comment']!;
    expect(handler).toBeDefined();

    await handler({
      id: 'evt_3',
      payload: {
        action: 'created',
        comment: {
          id: 601,
          body: 'Nit: rename this variable',
          path: 'src/main.ts',
          line: 42,
          html_url: 'https://github.com/owner/repo/pull/10#discussion_r601',
          created_at: '2026-02-18T10:00:00Z',
        },
        pull_request: { number: 10, html_url: 'https://github.com/owner/repo/pull/10' },
        sender: { login: 'reviewer2' },
        repository: { name: 'repo', owner: { login: 'owner' } },
      },
    });

    expect(onMessage).toHaveBeenCalledOnce();
    const msg = onMessage.mock.calls[0][0];
    expect(msg.id).toBe('gh_review_comment_evt_3');
    expect(msg.chatId).toBe('owner/repo/pulls/10');
    expect(msg.text).toBe('Nit: rename this variable');
    expect(msg.metadata?.event).toBe('pull_request_review_comment');
    expect(msg.metadata?.path).toBe('src/main.ts');
    expect(msg.metadata?.line).toBe(42);
    expect(msg.metadata?.prNumber).toBe(10);
    expect(msg.metadata?.commentUrl).toBe('https://github.com/owner/repo/pull/10#discussion_r601');
  });

  // ── sendMessage with reviewEvent ─────────────────────────────────

  it('sendMessage with reviewEvent should call pulls.createReview instead of createComment', async () => {
    await integration.init(makeConfig(), makeDeps());
    const reviewId = await integration.sendMessage('owner/repo/pulls/10', 'LGTM!', {
      reviewEvent: 'APPROVE',
    });

    expect(reviewId).toBe('99');
    expect(mockCreateReview).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      pull_number: 10,
      body: 'LGTM!',
      event: 'APPROVE',
    });
    expect(mockCreateComment).not.toHaveBeenCalled();
  });

  it('sendMessage without reviewEvent should post a comment even for pulls chatId', async () => {
    await integration.init(makeConfig(), makeDeps());
    await integration.sendMessage('owner/repo/pulls/10', 'Just a comment');

    expect(mockCreateComment).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      issue_number: 10,
      body: 'Just a comment',
    });
    expect(mockCreateReview).not.toHaveBeenCalled();
  });

  // ── Issue auto-labeling ──────────────────────────────────────────

  it('should auto-label issues when keywords match on opened event', async () => {
    const onMessage = vi.fn().mockResolvedValue(undefined);
    await integration.init(
      makeConfig({
        config: {
          personalAccessToken: 'ghp_test',
          webhookSecret: 'secret123',
          autoLabelKeywords: {
            bug: ['crash', 'error', 'exception'],
            enhancement: ['feature', 'improvement', 'request'],
          },
        },
      }),
      makeDeps(onMessage)
    );

    const handler = webhookHandlers['issues']!;

    await handler({
      id: 'evt_4',
      payload: {
        action: 'opened',
        issue: {
          id: 701,
          number: 5,
          title: 'App crashes on startup',
          body: 'Getting a null pointer exception',
          state: 'open',
          html_url: 'https://github.com/owner/repo/issues/5',
        },
        sender: { login: 'reporter1' },
        repository: { name: 'repo', owner: { login: 'owner' } },
      },
    });

    // onMessage should be called for the issue event
    expect(onMessage).toHaveBeenCalledOnce();

    // Auto-labeling should add labels matching "crash" and "exception" keywords → bug label
    await new Promise((r) => setTimeout(r, 0));
    expect(mockAddLabels).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      issue_number: 5,
      labels: ['bug'],
    });
  });

  it('should not call addLabels when no keywords match', async () => {
    const onMessage = vi.fn().mockResolvedValue(undefined);
    await integration.init(
      makeConfig({
        config: {
          personalAccessToken: 'ghp_test',
          webhookSecret: 'secret123',
          autoLabelKeywords: {
            bug: ['crash', 'error'],
          },
        },
      }),
      makeDeps(onMessage)
    );

    const handler = webhookHandlers['issues']!;

    await handler({
      id: 'evt_5',
      payload: {
        action: 'opened',
        issue: {
          id: 702,
          number: 6,
          title: 'Add dark mode',
          body: 'Would love a dark theme option',
          state: 'open',
          html_url: 'https://github.com/owner/repo/issues/6',
        },
        sender: { login: 'reporter2' },
        repository: { name: 'repo', owner: { login: 'owner' } },
      },
    });

    await new Promise((r) => setTimeout(r, 0));
    expect(mockAddLabels).not.toHaveBeenCalled();
  });

  it('should not auto-label when action is not opened', async () => {
    await integration.init(
      makeConfig({
        config: {
          personalAccessToken: 'ghp_test',
          webhookSecret: 'secret123',
          autoLabelKeywords: { bug: ['crash'] },
        },
      }),
      makeDeps()
    );

    const handler = webhookHandlers['issues']!;

    await handler({
      id: 'evt_6',
      payload: {
        action: 'closed',
        issue: {
          id: 703,
          number: 7,
          title: 'App crashes',
          body: '',
          state: 'closed',
          html_url: 'https://github.com/owner/repo/issues/7',
        },
        sender: { login: 'user1' },
        repository: { name: 'repo', owner: { login: 'owner' } },
      },
    });

    await new Promise((r) => setTimeout(r, 0));
    expect(mockAddLabels).not.toHaveBeenCalled();
  });

  it('should not auto-label when autoLabelKeywords is not configured', async () => {
    await integration.init(makeConfig(), makeDeps());

    const handler = webhookHandlers['issues']!;

    await handler({
      id: 'evt_7',
      payload: {
        action: 'opened',
        issue: {
          id: 704,
          number: 8,
          title: 'App crashes badly',
          body: 'serious crash',
          state: 'open',
          html_url: 'https://github.com/owner/repo/issues/8',
        },
        sender: { login: 'user1' },
        repository: { name: 'repo', owner: { login: 'owner' } },
      },
    });

    await new Promise((r) => setTimeout(r, 0));
    expect(mockAddLabels).not.toHaveBeenCalled();
  });

  // ── Code search trigger ──────────────────────────────────────────

  it('should set isCodeSearchTrigger when comment starts with @friday search:', async () => {
    const onMessage = vi.fn().mockResolvedValue(undefined);
    await integration.init(makeConfig(), makeDeps(onMessage));

    const handler = webhookHandlers['issue_comment']!;

    await handler({
      id: 'evt_8',
      payload: {
        action: 'created',
        comment: {
          id: 801,
          user: { login: 'dev1' },
          body: '@friday search: authentication middleware',
          html_url: 'https://github.com/owner/repo/issues/3#issuecomment-801',
          created_at: '2026-02-18T11:00:00Z',
        },
        issue: { number: 3 },
        repository: { name: 'repo', owner: { login: 'owner' } },
      },
    });

    expect(onMessage).toHaveBeenCalledOnce();
    const msg = onMessage.mock.calls[0][0];
    expect(msg.metadata?.isCodeSearchTrigger).toBe(true);
    expect(msg.metadata?.searchQuery).toBe('authentication middleware');
  });

  it('should set isCodeSearchTrigger case-insensitively', async () => {
    const onMessage = vi.fn().mockResolvedValue(undefined);
    await integration.init(makeConfig(), makeDeps(onMessage));

    const handler = webhookHandlers['issue_comment']!;

    await handler({
      id: 'evt_9',
      payload: {
        action: 'created',
        comment: {
          id: 802,
          user: { login: 'dev2' },
          body: '@FRIDAY Search: user auth flow',
          html_url: 'https://github.com/owner/repo/issues/3#issuecomment-802',
          created_at: '2026-02-18T11:01:00Z',
        },
        issue: { number: 3 },
        repository: { name: 'repo', owner: { login: 'owner' } },
      },
    });

    const msg = onMessage.mock.calls[0][0];
    expect(msg.metadata?.isCodeSearchTrigger).toBe(true);
    expect(msg.metadata?.searchQuery).toBe('user auth flow');
  });

  it('should not set isCodeSearchTrigger for regular comments', async () => {
    const onMessage = vi.fn().mockResolvedValue(undefined);
    await integration.init(makeConfig(), makeDeps(onMessage));

    const handler = webhookHandlers['issue_comment']!;

    await handler({
      id: 'evt_10',
      payload: {
        action: 'created',
        comment: {
          id: 803,
          user: { login: 'dev3' },
          body: 'This is a regular comment',
          html_url: 'https://github.com/owner/repo/issues/3#issuecomment-803',
          created_at: '2026-02-18T11:02:00Z',
        },
        issue: { number: 3 },
        repository: { name: 'repo', owner: { login: 'owner' } },
      },
    });

    const msg = onMessage.mock.calls[0][0];
    expect(msg.metadata?.isCodeSearchTrigger).toBeUndefined();
    expect(msg.metadata?.searchQuery).toBeUndefined();
  });
});
