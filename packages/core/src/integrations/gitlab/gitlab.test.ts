import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitLabIntegration } from './adapter.js';
import type { IntegrationConfig } from '@friday/shared';

const mockFetch = vi.fn();

function makeConfig(): IntegrationConfig {
  return {
    id: 'gitlab-1',
    platform: 'gitlab',
    displayName: 'Test GitLab',
    enabled: true,
    config: {
      personalAccessToken: 'glpat-test-token',
      webhookSecret: 'test-secret',
      gitlabUrl: 'https://gitlab.com',
    },
    status: 'disconnected',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeDeps() {
  return {
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as any,
    onMessage: vi.fn(),
  };
}

describe('GitLabIntegration', () => {
  let adapter: GitLabIntegration;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
    adapter = new GitLabIntegration();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('init', () => {
    it('should initialize successfully with valid config', async () => {
      await adapter.init(makeConfig(), makeDeps());
    });

    it('should throw when personalAccessToken is missing', async () => {
      const config = makeConfig();
      (config.config as any).personalAccessToken = '';
      await expect(adapter.init(config, makeDeps())).rejects.toThrow(
        'requires a personalAccessToken'
      );
    });

    it('should throw when webhookSecret is missing', async () => {
      const config = makeConfig();
      (config.config as any).webhookSecret = '';
      await expect(adapter.init(config, makeDeps())).rejects.toThrow('requires a webhookSecret');
    });
  });

  describe('testConnection', () => {
    it('should return ok when API responds successfully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ username: 'testuser', name: 'Test User' }),
      });

      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();
      expect(result.ok).toBe(true);
      expect(result.message).toContain('Test User');
      expect(result.message).toContain('@testuser');
    });

    it('should return error when API fails', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        text: async () => 'Unauthorized',
      });

      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();
      expect(result.ok).toBe(false);
    });
  });

  describe('sendMessage', () => {
    it('should post a note on an issue', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 42 }),
      });

      await adapter.init(makeConfig(), makeDeps());
      const id = await adapter.sendMessage('mygroup/myproject/issues/5', 'Test comment');
      expect(id).toBe('42');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/issues/5/notes'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should post a note on a merge request', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 99 }),
      });

      await adapter.init(makeConfig(), makeDeps());
      const id = await adapter.sendMessage('mygroup/myproject/merge_requests/10', 'MR comment');
      expect(id).toBe('99');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/merge_requests/10/notes'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should throw on invalid chatId format', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await expect(adapter.sendMessage('bad', 'text')).rejects.toThrow('Invalid chatId format');
    });
  });

  describe('webhook verification', () => {
    it('should verify valid webhook token', async () => {
      await adapter.init(makeConfig(), makeDeps());
      expect(adapter.verifyWebhook('payload', 'test-secret')).toBe(true);
    });

    it('should reject invalid webhook token', async () => {
      await adapter.init(makeConfig(), makeDeps());
      expect(adapter.verifyWebhook('payload', 'wrong-secret')).toBe(false);
    });
  });

  describe('handleWebhook', () => {
    it('should handle push events', async () => {
      const deps = makeDeps();
      await adapter.init(makeConfig(), deps);
      await adapter.start();

      const payload = JSON.stringify({
        object_kind: 'push',
        ref: 'refs/heads/main',
        user_name: 'Test User',
        user_username: 'testuser',
        project: {
          path_with_namespace: 'group/project',
          web_url: 'https://gitlab.com/group/project',
        },
        commits: [{ id: 'abc123', message: 'fix bug', author: { name: 'Test' } }],
        total_commits_count: 1,
      });

      await adapter.handleWebhook('Push Hook', payload, 'test-secret');
      expect(deps.onMessage).toHaveBeenCalledTimes(1);
      const msg = deps.onMessage.mock.calls[0][0];
      expect(msg.platform).toBe('gitlab');
      expect(msg.text).toContain('Push to refs/heads/main');
    });

    it('should handle merge_request events', async () => {
      const deps = makeDeps();
      await adapter.init(makeConfig(), deps);
      await adapter.start();

      const payload = JSON.stringify({
        object_kind: 'merge_request',
        user: { username: 'testuser', name: 'Test User' },
        project: { path_with_namespace: 'group/project', web_url: '' },
        object_attributes: {
          iid: 5,
          title: 'Add feature',
          state: 'opened',
          action: 'open',
          url: 'https://gitlab.com/group/project/-/merge_requests/5',
          source_branch: 'feature',
          target_branch: 'main',
        },
      });

      await adapter.handleWebhook('Merge Request Hook', payload, 'test-secret');
      expect(deps.onMessage).toHaveBeenCalledTimes(1);
      const msg = deps.onMessage.mock.calls[0][0];
      expect(msg.text).toContain('MR !5');
    });

    it('should reject invalid token', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await expect(adapter.handleWebhook('Push Hook', '{}', 'wrong-secret')).rejects.toThrow(
        'Invalid webhook token'
      );
    });
  });

  describe('lifecycle', () => {
    it('should start and stop cleanly', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      expect(adapter.isHealthy()).toBe(true);
      await adapter.stop();
      expect(adapter.isHealthy()).toBe(false);
    });

    it('should return correct webhook path', async () => {
      await adapter.init(makeConfig(), makeDeps());
      expect(adapter.getWebhookPath()).toBe('/api/v1/webhooks/gitlab/gitlab-1');
    });
  });
});
