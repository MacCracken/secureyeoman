/**
 * Integration Routes — credential masking tests (Phase 22 secrets hygiene)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerIntegrationRoutes } from './integration-routes.js';
import type { IntegrationConfig } from '@secureyeoman/shared';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_INTEGRATION: IntegrationConfig = {
  id: 'intg-1',
  platform: 'telegram',
  displayName: 'My Telegram Bot',
  enabled: true,
  status: 'connected',
  config: {
    botToken: 'secret-bot-token-12345',
    webhookSecret: 'webhook-secret-abc',
    chatId: 'chat-123',
  },
  messageCount: 0,
  createdAt: 1000000,
  updatedAt: 1000001,
};

// ── Mock IntegrationManager ───────────────────────────────────────────────────

function buildMockManager(integration: IntegrationConfig = BASE_INTEGRATION) {
  return {
    listIntegrations: vi.fn().mockResolvedValue([integration]),
    getIntegration: vi.fn().mockResolvedValue(integration),
    createIntegration: vi.fn().mockResolvedValue(integration),
    updateIntegration: vi.fn().mockResolvedValue(integration),
    deleteIntegration: vi.fn().mockResolvedValue(true),
    startIntegration: vi.fn().mockResolvedValue(undefined),
    stopIntegration: vi.fn().mockResolvedValue(undefined),
    reloadIntegration: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue('msg-1'),
    getAvailablePlatforms: vi.fn().mockReturnValue(['telegram']),
    getAdapter: vi.fn().mockReturnValue(null),
    isRunning: vi.fn().mockReturnValue(true),
    isHealthy: vi.fn().mockReturnValue(true),
    getRunningCount: vi.fn().mockReturnValue(1),
    getLoadedPlugins: vi.fn().mockReturnValue([]),
    loadPlugin: vi.fn().mockResolvedValue({ platform: 'telegram', path: '/tmp/plugin.js' }),
  } as any;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function buildApp(manager = buildMockManager()) {
  const app = Fastify({ logger: false });
  const mockStorage = {
    listMessages: vi.fn().mockResolvedValue([]),
  } as any;
  registerIntegrationRoutes(app, {
    integrationManager: manager,
    integrationStorage: mockStorage,
  });
  await app.ready();
  return { app, manager };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('integration-routes credential masking', () => {
  it('GET /api/v1/integrations masks sensitive config keys', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/integrations' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.integrations).toHaveLength(1);
    const cfg = body.integrations[0].config;
    expect(cfg.botToken).toBe('[REDACTED]');
    expect(cfg.webhookSecret).toBe('[REDACTED]');
    // Non-sensitive key should pass through
    expect(cfg.chatId).toBe('chat-123');
  });

  it('GET /api/v1/integrations/:id masks sensitive config keys', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/integrations/intg-1' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const cfg = body.integration.config;
    expect(cfg.botToken).toBe('[REDACTED]');
    expect(cfg.webhookSecret).toBe('[REDACTED]');
    expect(cfg.chatId).toBe('chat-123');
  });

  it('POST /api/v1/integrations masks sensitive config keys', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations',
      payload: {
        platform: 'telegram',
        displayName: 'My Telegram Bot',
        enabled: true,
        config: { botToken: 'secret-bot-token-12345' },
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.integration.config.botToken).toBe('[REDACTED]');
  });

  it('PUT /api/v1/integrations/:id masks sensitive config keys', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/integrations/intg-1',
      payload: { displayName: 'Updated' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.integration.config.botToken).toBe('[REDACTED]');
    expect(body.integration.config.chatId).toBe('chat-123');
  });

  it('GET /api/v1/integrations returns 404 when not found', async () => {
    const manager = buildMockManager();
    manager.getIntegration = vi.fn().mockResolvedValue(null);
    const { app } = await buildApp(manager);
    const res = await app.inject({ method: 'GET', url: '/api/v1/integrations/nonexistent' });
    expect(res.statusCode).toBe(404);
  });

  it('integration without sensitive config passes through unchanged', async () => {
    const plainIntegration: IntegrationConfig = {
      ...BASE_INTEGRATION,
      config: { chatId: 'chat-xyz', maxRetries: 3 },
    };
    const manager = buildMockManager(plainIntegration);
    const { app } = await buildApp(manager);
    const res = await app.inject({ method: 'GET', url: '/api/v1/integrations/intg-1' });
    const body = res.json();
    expect(body.integration.config.chatId).toBe('chat-xyz');
    expect(body.integration.config.maxRetries).toBe(3);
  });
});

// ── Platform, filter, and lifecycle routes ────────────────────────────────────

describe('integration platform and list routes', () => {
  it('GET /api/v1/integrations/platforms returns available platforms', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/integrations/platforms' });
    expect(res.statusCode).toBe(200);
    expect(res.json().platforms).toContain('telegram');
  });

  it('GET /api/v1/integrations?platform=telegram filters by platform', async () => {
    const { app, manager } = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/integrations?platform=telegram',
    });
    expect(res.statusCode).toBe(200);
    expect(manager.listIntegrations).toHaveBeenCalledWith({ platform: 'telegram' });
  });

  it('GET /api/v1/integrations?enabled=true filters by enabled=true', async () => {
    const { app, manager } = await buildApp();
    await app.inject({ method: 'GET', url: '/api/v1/integrations?enabled=true' });
    expect(manager.listIntegrations).toHaveBeenCalledWith({ enabled: true });
  });

  it('GET /api/v1/integrations?enabled=false filters by enabled=false', async () => {
    const { app, manager } = await buildApp();
    await app.inject({ method: 'GET', url: '/api/v1/integrations?enabled=false' });
    expect(manager.listIntegrations).toHaveBeenCalledWith({ enabled: false });
  });

  it('GET /api/v1/integrations includes running count', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/integrations' });
    const body = res.json();
    expect(body.running).toBe(1);
    expect(body.total).toBe(1);
  });

  it('GET /api/v1/integrations/:id returns running and healthy flags', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/integrations/intg-1' });
    const body = res.json();
    expect(body.running).toBe(true);
    expect(body.healthy).toBe(true);
  });
});

// ── DELETE integration ────────────────────────────────────────────────────────

describe('DELETE /api/v1/integrations/:id', () => {
  it('returns 204 on successful delete', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/integrations/intg-1' });
    expect(res.statusCode).toBe(204);
  });

  it('returns 404 when integration not found', async () => {
    const manager = buildMockManager();
    manager.deleteIntegration = vi.fn().mockResolvedValue(false);
    const { app } = await buildApp(manager);
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/integrations/nonexistent' });
    expect(res.statusCode).toBe(404);
  });
});

// ── PUT 404 and POST error ────────────────────────────────────────────────────

describe('PUT /api/v1/integrations/:id additional paths', () => {
  it('returns 404 when updateIntegration returns null', async () => {
    const manager = buildMockManager();
    manager.updateIntegration = vi.fn().mockResolvedValue(null);
    const { app } = await buildApp(manager);
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/integrations/nonexistent',
      payload: { displayName: 'X' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/v1/integrations additional paths', () => {
  it('returns 400 when createIntegration throws', async () => {
    const manager = buildMockManager();
    manager.createIntegration = vi.fn().mockRejectedValue(new Error('Invalid platform'));
    const { app } = await buildApp(manager);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations',
      payload: { platform: 'bad', displayName: 'X', enabled: true, config: {} },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Invalid platform');
  });
});

// ── Test connection ───────────────────────────────────────────────────────────

describe('POST /api/v1/integrations/:id/test', () => {
  it('returns 404 when adapter null and config not found', async () => {
    const manager = buildMockManager();
    manager.getAdapter = vi.fn().mockReturnValue(null);
    manager.getIntegration = vi.fn().mockResolvedValue(null);
    const { app } = await buildApp(manager);
    const res = await app.inject({ method: 'POST', url: '/api/v1/integrations/intg-1/test' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when adapter null but config exists (not running)', async () => {
    const manager = buildMockManager();
    manager.getAdapter = vi.fn().mockReturnValue(null);
    const { app } = await buildApp(manager);
    const res = await app.inject({ method: 'POST', url: '/api/v1/integrations/intg-1/test' });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.ok).toBe(false);
    expect(body.message).toContain('not running');
  });

  it('returns ok when adapter has no testConnection method', async () => {
    const manager = buildMockManager();
    const mockAdapter = { isHealthy: vi.fn().mockReturnValue(true) };
    manager.getAdapter = vi.fn().mockReturnValue(mockAdapter);
    const { app } = await buildApp(manager);
    const res = await app.inject({ method: 'POST', url: '/api/v1/integrations/intg-1/test' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.message).toContain('running and healthy');
  });

  it('calls testConnection and returns result when adapter supports it', async () => {
    const manager = buildMockManager();
    const mockAdapter = {
      isHealthy: vi.fn().mockReturnValue(true),
      testConnection: vi.fn().mockResolvedValue({ ok: true, message: 'Connected' }),
    };
    manager.getAdapter = vi.fn().mockReturnValue(mockAdapter);
    const { app } = await buildApp(manager);
    const res = await app.inject({ method: 'POST', url: '/api/v1/integrations/intg-1/test' });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    expect(mockAdapter.testConnection).toHaveBeenCalled();
  });
});

// ── Reload ────────────────────────────────────────────────────────────────────

describe('POST /api/v1/integrations/:id/reload', () => {
  it('returns success message on reload', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/integrations/intg-1/reload' });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toContain('reloaded');
  });

  it('returns 400 when reload throws', async () => {
    const manager = buildMockManager();
    manager.reloadIntegration = vi.fn().mockRejectedValue(new Error('Cannot reload'));
    const { app } = await buildApp(manager);
    const res = await app.inject({ method: 'POST', url: '/api/v1/integrations/intg-1/reload' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Cannot reload');
  });
});

// ── Plugins ───────────────────────────────────────────────────────────────────

describe('plugin endpoints', () => {
  it('GET /api/v1/integrations/plugins returns loaded plugins', async () => {
    const manager = buildMockManager();
    manager.getLoadedPlugins = vi
      .fn()
      .mockReturnValue([{ platform: 'telegram', path: '/tmp/plugin.js' }]);
    const { app } = await buildApp(manager);
    const res = await app.inject({ method: 'GET', url: '/api/v1/integrations/plugins' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(1);
    expect(body.plugins[0].platform).toBe('telegram');
  });

  it('GET /api/v1/integrations/plugins returns empty when no plugins', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/integrations/plugins' });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBe(0);
  });

  it('POST /api/v1/integrations/plugins/load returns 201 on success', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/plugins/load',
      payload: { path: '/tmp/plugin.js' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().plugin.platform).toBe('telegram');
  });

  it('POST /api/v1/integrations/plugins/load returns 400 when path missing', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/plugins/load',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Missing path');
  });

  it('POST /api/v1/integrations/plugins/load returns 400 when loadPlugin throws', async () => {
    const manager = buildMockManager();
    manager.loadPlugin = vi.fn().mockRejectedValue(new Error('File not found'));
    const { app } = await buildApp(manager);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/plugins/load',
      payload: { path: '/bad/path.js' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('File not found');
  });
});

// ── Start / Stop ──────────────────────────────────────────────────────────────

describe('start/stop endpoints', () => {
  it('POST /api/v1/integrations/:id/start returns success', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/integrations/intg-1/start' });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toContain('started');
  });

  it('POST /api/v1/integrations/:id/start returns 400 on error', async () => {
    const manager = buildMockManager();
    manager.startIntegration = vi.fn().mockRejectedValue(new Error('Already running'));
    const { app } = await buildApp(manager);
    const res = await app.inject({ method: 'POST', url: '/api/v1/integrations/intg-1/start' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Already running');
  });

  it('POST /api/v1/integrations/:id/stop returns success', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/integrations/intg-1/stop' });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toContain('stopped');
  });

  it('POST /api/v1/integrations/:id/stop returns 400 on error', async () => {
    const manager = buildMockManager();
    manager.stopIntegration = vi.fn().mockRejectedValue(new Error('Not running'));
    const { app } = await buildApp(manager);
    const res = await app.inject({ method: 'POST', url: '/api/v1/integrations/intg-1/stop' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Not running');
  });
});

// ── Messages ──────────────────────────────────────────────────────────────────

describe('message endpoints', () => {
  it('GET /api/v1/integrations/:id/messages returns messages', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/integrations/intg-1/messages',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().messages).toEqual([]);
  });

  it('GET /api/v1/integrations/:id/messages passes limit and offset params', async () => {
    const manager = buildMockManager();
    const mockStorage = { listMessages: vi.fn().mockResolvedValue([]) } as any;
    const app = Fastify({ logger: false });
    registerIntegrationRoutes(app, { integrationManager: manager, integrationStorage: mockStorage });
    await app.ready();

    await app.inject({
      method: 'GET',
      url: '/api/v1/integrations/intg-1/messages?limit=10&offset=5',
    });
    expect(mockStorage.listMessages).toHaveBeenCalledWith('intg-1', { limit: 10, offset: 5 });
  });

  it('POST /api/v1/integrations/:id/messages returns 201 with platformMessageId', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/intg-1/messages',
      payload: { chatId: 'chat-123', text: 'Hello!' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().platformMessageId).toBe('msg-1');
  });

  it('POST /api/v1/integrations/:id/messages returns 400 on error', async () => {
    const manager = buildMockManager();
    manager.sendMessage = vi.fn().mockRejectedValue(new Error('Send failed'));
    const { app } = await buildApp(manager);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/intg-1/messages',
      payload: { chatId: 'chat-123', text: 'Hello!' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Send failed');
  });
});

// ── Webhook endpoints ─────────────────────────────────────────────────────────

describe('webhook endpoints', () => {
  it('POST /api/v1/webhooks/github/:id returns 404 for wrong platform', async () => {
    const { app } = await buildApp(); // BASE_INTEGRATION.platform = 'telegram'
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/github/intg-1',
      payload: {},
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toContain('GitHub integration not found');
  });

  it('POST /api/v1/webhooks/github/:id returns 400 when headers missing', async () => {
    const manager = buildMockManager({
      ...BASE_INTEGRATION,
      platform: 'github',
    } as any);
    manager.getIntegration = vi.fn().mockResolvedValue({ ...BASE_INTEGRATION, platform: 'github' });
    const { app } = await buildApp(manager);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/github/intg-1',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Missing webhook headers');
  });

  it('POST /api/v1/webhooks/github/:id succeeds with correct headers', async () => {
    const manager = buildMockManager();
    manager.getIntegration = vi.fn().mockResolvedValue({ ...BASE_INTEGRATION, platform: 'github' });
    const { app } = await buildApp(manager);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/github/intg-1',
      headers: {
        'x-hub-signature-256': 'sha256=abc123',
        'x-github-event': 'push',
      },
      payload: { ref: 'refs/heads/main' },
    });
    // Returns 200 with received: true (dynamic import of GitHubIntegration but doesn't use it)
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.received).toBe(true);
    expect(body.event).toBe('push');
  });

  it('POST /api/v1/webhooks/gitlab/:id returns 404 for wrong platform', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/webhooks/gitlab/intg-1' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toContain('GitLab integration not found');
  });

  it('POST /api/v1/webhooks/gitlab/:id returns 400 when headers missing', async () => {
    const manager = buildMockManager();
    manager.getIntegration = vi.fn().mockResolvedValue({ ...BASE_INTEGRATION, platform: 'gitlab' });
    const { app } = await buildApp(manager);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/gitlab/intg-1',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Missing GitLab webhook headers');
  });

  it('POST /api/v1/webhooks/gitlab/:id returns 400 when adapter not running', async () => {
    const manager = buildMockManager();
    manager.getIntegration = vi.fn().mockResolvedValue({ ...BASE_INTEGRATION, platform: 'gitlab' });
    manager.getAdapter = vi.fn().mockReturnValue(null);
    const { app } = await buildApp(manager);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/gitlab/intg-1',
      headers: { 'x-gitlab-token': 'secret', 'x-gitlab-event': 'Push Hook' },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('GitLab integration is not running');
  });

  it('POST /api/v1/webhooks/jira/:id returns 404 for wrong platform', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/webhooks/jira/intg-1' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toContain('Jira integration not found');
  });

  it('POST /api/v1/webhooks/jira/:id returns 400 when adapter not running', async () => {
    const manager = buildMockManager();
    manager.getIntegration = vi.fn().mockResolvedValue({ ...BASE_INTEGRATION, platform: 'jira' });
    manager.getAdapter = vi.fn().mockReturnValue(null);
    const { app } = await buildApp(manager);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/jira/intg-1',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Jira integration is not running');
  });

  it('POST /api/v1/webhooks/azure/:id returns 404 for wrong platform', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/webhooks/azure/intg-1' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toContain('Azure DevOps integration not found');
  });

  it('POST /api/v1/webhooks/azure/:id returns 400 when adapter not running', async () => {
    const manager = buildMockManager();
    manager.getIntegration = vi.fn().mockResolvedValue({ ...BASE_INTEGRATION, platform: 'azure' });
    manager.getAdapter = vi.fn().mockReturnValue(null);
    const { app } = await buildApp(manager);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/azure/intg-1',
      payload: { eventType: 'git.push' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Azure DevOps integration is not running');
  });

  it('POST /api/v1/webhooks/custom/:id returns 404 for wrong platform', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/webhooks/custom/intg-1' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toContain('Webhook integration not found');
  });

  it('POST /api/v1/webhooks/custom/:id returns 400 when adapter not running', async () => {
    const manager = buildMockManager();
    manager.getIntegration = vi
      .fn()
      .mockResolvedValue({ ...BASE_INTEGRATION, platform: 'webhook' });
    manager.getAdapter = vi.fn().mockReturnValue(null);
    const { app } = await buildApp(manager);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/custom/intg-1',
      payload: { data: 'test' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Webhook integration is not running');
  });
});
