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
    expect(res.json().message).toContain('Invalid platform');
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
    expect(res.json().message).toContain('Cannot reload');
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
    expect(res.json().message).toContain('Missing path');
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
    expect(res.json().message).toContain('File not found');
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
    expect(res.json().message).toContain('Already running');
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
    expect(res.json().message).toContain('Not running');
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
    registerIntegrationRoutes(app, {
      integrationManager: manager,
      integrationStorage: mockStorage,
    });
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
    expect(res.json().message).toContain('Send failed');
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
    expect(res.json().message).toContain('GitHub integration not found');
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
    expect(res.json().message).toContain('Missing webhook headers');
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
    expect(res.json().message).toContain('GitLab integration not found');
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
    expect(res.json().message).toContain('Missing GitLab webhook headers');
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
    expect(res.json().message).toContain('GitLab integration is not running');
  });

  it('POST /api/v1/webhooks/jira/:id returns 404 for wrong platform', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/webhooks/jira/intg-1' });
    expect(res.statusCode).toBe(404);
    expect(res.json().message).toContain('Jira integration not found');
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
    expect(res.json().message).toContain('Jira integration is not running');
  });

  it('POST /api/v1/webhooks/azure/:id returns 404 for wrong platform', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/webhooks/azure/intg-1' });
    expect(res.statusCode).toBe(404);
    expect(res.json().message).toContain('Azure DevOps integration not found');
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
    expect(res.json().message).toContain('Azure DevOps integration is not running');
  });

  it('POST /api/v1/webhooks/custom/:id returns 404 for wrong platform', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/webhooks/custom/intg-1' });
    expect(res.statusCode).toBe(404);
    expect(res.json().message).toContain('Webhook integration not found');
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
    expect(res.json().message).toContain('Webhook integration is not running');
  });

  it('POST /api/v1/webhooks/github/:id stringifies object body', async () => {
    const manager = buildMockManager();
    manager.getIntegration = vi.fn().mockResolvedValue({ ...BASE_INTEGRATION, platform: 'github' });
    const { app } = await buildApp(manager);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/github/intg-1',
      headers: {
        'x-hub-signature-256': 'sha256=abc',
        'x-github-event': 'ping',
      },
      payload: { zen: 'Keep it simple.' },
    });
    // body is an object → JSON.stringify branch → returns received: true
    expect(res.statusCode).toBe(200);
    expect(res.json().received).toBe(true);
  });
});

// ── maskIntegration edge case ─────────────────────────────────────────────────

describe('maskIntegration — no config field', () => {
  it('GET /api/v1/integrations returns integration without config unchanged', async () => {
    const noConfigIntegration = { ...BASE_INTEGRATION, config: undefined as any };
    const manager = buildMockManager(noConfigIntegration);
    const { app } = await buildApp(manager);
    const res = await app.inject({ method: 'GET', url: '/api/v1/integrations' });
    expect(res.statusCode).toBe(200);
    // maskIntegration returns early when config is undefined/null
    const body = res.json();
    expect(body.integrations[0].config).toBeUndefined();
  });
});

// ── Webhook Transform routes ──────────────────────────────────────────────────

function buildTransformStorage() {
  const RULE = { id: 'tr-1', name: 'Rule 1', enabled: true };
  return {
    listRules: vi.fn().mockResolvedValue([RULE]),
    getRule: vi.fn().mockResolvedValue(RULE),
    createRule: vi.fn().mockResolvedValue(RULE),
    updateRule: vi.fn().mockResolvedValue(RULE),
    deleteRule: vi.fn().mockResolvedValue(true),
  } as any;
}

async function buildAppWithTransforms(
  transformStorageOverrides: Record<string, ReturnType<typeof vi.fn>> = {}
) {
  const app = Fastify({ logger: false });
  const mockStorage = { listMessages: vi.fn().mockResolvedValue([]) } as any;
  const wts = { ...buildTransformStorage(), ...transformStorageOverrides };
  registerIntegrationRoutes(app, {
    integrationManager: buildMockManager(),
    integrationStorage: mockStorage,
    webhookTransformStorage: wts,
  });
  await app.ready();
  return { app, wts };
}

describe('webhook-transform routes', () => {
  it('GET /api/v1/webhook-transforms returns rules', async () => {
    const { app } = await buildAppWithTransforms();
    const res = await app.inject({ method: 'GET', url: '/api/v1/webhook-transforms' });
    expect(res.statusCode).toBe(200);
    expect(res.json().rules).toHaveLength(1);
  });

  it('GET /api/v1/webhook-transforms passes integrationId filter', async () => {
    const { app, wts } = await buildAppWithTransforms();
    await app.inject({ method: 'GET', url: '/api/v1/webhook-transforms?integrationId=int-1' });
    expect(wts.listRules).toHaveBeenCalledWith(expect.objectContaining({ integrationId: 'int-1' }));
  });

  it('GET /api/v1/webhook-transforms passes enabled filter', async () => {
    const { app, wts } = await buildAppWithTransforms();
    await app.inject({ method: 'GET', url: '/api/v1/webhook-transforms?enabled=true' });
    expect(wts.listRules).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
  });

  it('GET /api/v1/webhook-transforms/:id returns single rule', async () => {
    const { app } = await buildAppWithTransforms();
    const res = await app.inject({ method: 'GET', url: '/api/v1/webhook-transforms/tr-1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().rule.id).toBe('tr-1');
  });

  it('GET /api/v1/webhook-transforms/:id returns 404 when not found', async () => {
    const { app } = await buildAppWithTransforms({ getRule: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/webhook-transforms/nonexistent' });
    expect(res.statusCode).toBe(404);
  });

  it('POST /api/v1/webhook-transforms creates rule and returns 201', async () => {
    const { app } = await buildAppWithTransforms();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/webhook-transforms',
      payload: { name: 'New Rule', integrationId: 'int-1' },
    });
    expect(res.statusCode).toBe(201);
  });

  it('POST /api/v1/webhook-transforms returns 400 on storage error', async () => {
    const { app } = await buildAppWithTransforms({
      createRule: vi.fn().mockRejectedValue(new Error('duplicate key')),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/webhook-transforms',
      payload: { name: 'Rule' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('PUT /api/v1/webhook-transforms/:id updates rule', async () => {
    const { app } = await buildAppWithTransforms();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/webhook-transforms/tr-1',
      payload: { name: 'Updated' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('PUT /api/v1/webhook-transforms/:id returns 404 when not found', async () => {
    const { app } = await buildAppWithTransforms({ updateRule: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/webhook-transforms/nonexistent',
      payload: {},
    });
    expect(res.statusCode).toBe(404);
  });

  it('DELETE /api/v1/webhook-transforms/:id returns 204', async () => {
    const { app } = await buildAppWithTransforms();
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/webhook-transforms/tr-1' });
    expect(res.statusCode).toBe(204);
  });

  it('DELETE /api/v1/webhook-transforms/:id returns 404 when not found', async () => {
    const { app } = await buildAppWithTransforms({ deleteRule: vi.fn().mockResolvedValue(false) });
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/webhook-transforms/nonexistent',
    });
    expect(res.statusCode).toBe(404);
  });

  it('GET /api/v1/webhook-transforms passes null integrationId when empty string', async () => {
    const { app, wts } = await buildAppWithTransforms();
    await app.inject({ method: 'GET', url: '/api/v1/webhook-transforms?integrationId=' });
    expect(wts.listRules).toHaveBeenCalledWith(expect.objectContaining({ integrationId: null }));
  });
});

// ── Outbound Webhook routes ───────────────────────────────────────────────────

function buildOutboundStorage() {
  const HOOK = { id: 'ow-1', url: 'https://example.com/hook', enabled: true };
  return {
    listWebhooks: vi.fn().mockResolvedValue([HOOK]),
    getWebhook: vi.fn().mockResolvedValue(HOOK),
    createWebhook: vi.fn().mockResolvedValue(HOOK),
    updateWebhook: vi.fn().mockResolvedValue(HOOK),
    deleteWebhook: vi.fn().mockResolvedValue(true),
  } as any;
}

async function buildAppWithOutbound(
  outboundStorageOverrides: Record<string, ReturnType<typeof vi.fn>> = {}
) {
  const app = Fastify({ logger: false });
  const mockStorage = { listMessages: vi.fn().mockResolvedValue([]) } as any;
  const obs = { ...buildOutboundStorage(), ...outboundStorageOverrides };
  registerIntegrationRoutes(app, {
    integrationManager: buildMockManager(),
    integrationStorage: mockStorage,
    outboundWebhookStorage: obs,
  });
  await app.ready();
  return { app, obs };
}

describe('outbound-webhook routes', () => {
  it('GET /api/v1/outbound-webhooks returns webhooks', async () => {
    const { app } = await buildAppWithOutbound();
    const res = await app.inject({ method: 'GET', url: '/api/v1/outbound-webhooks' });
    expect(res.statusCode).toBe(200);
    expect(res.json().webhooks).toHaveLength(1);
  });

  it('GET /api/v1/outbound-webhooks passes enabled filter', async () => {
    const { app, obs } = await buildAppWithOutbound();
    await app.inject({ method: 'GET', url: '/api/v1/outbound-webhooks?enabled=false' });
    expect(obs.listWebhooks).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it('GET /api/v1/outbound-webhooks without filter omits enabled', async () => {
    const { app, obs } = await buildAppWithOutbound();
    await app.inject({ method: 'GET', url: '/api/v1/outbound-webhooks' });
    expect(obs.listWebhooks).toHaveBeenCalledWith({});
  });

  it('GET /api/v1/outbound-webhooks/:id returns webhook', async () => {
    const { app } = await buildAppWithOutbound();
    const res = await app.inject({ method: 'GET', url: '/api/v1/outbound-webhooks/ow-1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().webhook.id).toBe('ow-1');
  });

  it('GET /api/v1/outbound-webhooks/:id returns 404 when not found', async () => {
    const { app } = await buildAppWithOutbound({ getWebhook: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/outbound-webhooks/nonexistent' });
    expect(res.statusCode).toBe(404);
  });

  it('POST /api/v1/outbound-webhooks creates webhook and returns 201', async () => {
    const { app } = await buildAppWithOutbound();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/outbound-webhooks',
      payload: { url: 'https://example.com/hook', events: ['message'] },
    });
    expect(res.statusCode).toBe(201);
  });

  it('POST /api/v1/outbound-webhooks returns 400 for private/localhost URL', async () => {
    const { app } = await buildAppWithOutbound();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/outbound-webhooks',
      payload: { url: 'http://localhost:9000/hook', events: ['message'] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('PUT /api/v1/outbound-webhooks/:id updates webhook', async () => {
    const { app } = await buildAppWithOutbound();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/outbound-webhooks/ow-1',
      payload: { enabled: false },
    });
    expect(res.statusCode).toBe(200);
  });

  it('PUT /api/v1/outbound-webhooks/:id returns 404 when not found', async () => {
    const { app } = await buildAppWithOutbound({ updateWebhook: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/outbound-webhooks/nonexistent',
      payload: {},
    });
    expect(res.statusCode).toBe(404);
  });

  it('DELETE /api/v1/outbound-webhooks/:id returns 204', async () => {
    const { app } = await buildAppWithOutbound();
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/outbound-webhooks/ow-1' });
    expect(res.statusCode).toBe(204);
  });

  it('DELETE /api/v1/outbound-webhooks/:id returns 404 when not found', async () => {
    const { app } = await buildAppWithOutbound({ deleteWebhook: vi.fn().mockResolvedValue(false) });
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/outbound-webhooks/nonexistent',
    });
    expect(res.statusCode).toBe(404);
  });
});

// ── Test connection error catch ─────────────────────────────────────────────

describe('POST /api/v1/integrations/:id/test — error path', () => {
  it('returns error message when testConnection throws', async () => {
    const manager = buildMockManager();
    const mockAdapter = {
      isHealthy: vi.fn().mockReturnValue(true),
      testConnection: vi.fn().mockRejectedValue(new Error('Connection timed out')),
    };
    manager.getAdapter = vi.fn().mockReturnValue(mockAdapter);
    const { app } = await buildApp(manager);
    const res = await app.inject({ method: 'POST', url: '/api/v1/integrations/intg-1/test' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(false);
    expect(body.message).toContain('Connection timed out');
  });
});

// ── Custom webhook with transformer and signature verification ──────────────

describe('POST /api/v1/webhooks/custom/:id — advanced paths', () => {
  it('returns 401 when webhook signature is invalid', async () => {
    // We need a mock adapter that returns false for verifyWebhook
    const { GenericWebhookIntegration } = await import('./webhook/adapter.js').catch(() => ({
      GenericWebhookIntegration: class {
        verifyWebhook() {
          return false;
        }
        handleInbound() {
          return Promise.resolve();
        }
      },
    }));

    const manager = buildMockManager();
    manager.getIntegration = vi
      .fn()
      .mockResolvedValue({ ...BASE_INTEGRATION, platform: 'webhook' });
    const mockAdapter = Object.create(GenericWebhookIntegration.prototype);
    mockAdapter.verifyWebhook = vi.fn().mockReturnValue(false);
    mockAdapter.handleInbound = vi.fn().mockResolvedValue(undefined);
    manager.getAdapter = vi.fn().mockReturnValue(mockAdapter);

    const { app } = await buildApp(manager);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/custom/intg-1',
      headers: { 'x-webhook-signature': 'bad-sig' },
      payload: { data: 'test' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toContain('Invalid webhook signature');
  });

  it('handles custom webhook with valid signature and transformer', async () => {
    const { GenericWebhookIntegration } = await import('./webhook/adapter.js').catch(() => ({
      GenericWebhookIntegration: class {
        verifyWebhook() {
          return true;
        }
        handleInbound() {
          return Promise.resolve();
        }
      },
    }));

    const manager = buildMockManager();
    manager.getIntegration = vi
      .fn()
      .mockResolvedValue({ ...BASE_INTEGRATION, platform: 'webhook' });
    const mockAdapter = Object.create(GenericWebhookIntegration.prototype);
    mockAdapter.verifyWebhook = vi.fn().mockReturnValue(true);
    mockAdapter.handleInbound = vi.fn().mockResolvedValue(undefined);
    manager.getAdapter = vi.fn().mockReturnValue(mockAdapter);

    // Build app with webhookTransformStorage
    const app = Fastify({ logger: false });
    const mockStorage = { listMessages: vi.fn().mockResolvedValue([]) } as any;
    const wts = {
      listRules: vi.fn().mockResolvedValue([]),
      getRule: vi.fn().mockResolvedValue(null),
      createRule: vi.fn(),
      updateRule: vi.fn(),
      deleteRule: vi.fn(),
      getRulesForIntegration: vi.fn().mockResolvedValue([]),
    } as any;
    registerIntegrationRoutes(app, {
      integrationManager: manager,
      integrationStorage: mockStorage,
      webhookTransformStorage: wts,
    });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/custom/intg-1',
      headers: {
        'x-webhook-signature': 'valid-sig',
        'x-webhook-event': 'push',
      },
      payload: { data: 'test-payload' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().received).toBe(true);
  });

  it('handles custom webhook error gracefully', async () => {
    const { GenericWebhookIntegration } = await import('./webhook/adapter.js').catch(() => ({
      GenericWebhookIntegration: class {
        verifyWebhook() {
          return true;
        }
        handleInbound() {
          return Promise.reject(new Error('Processing failed'));
        }
      },
    }));

    const manager = buildMockManager();
    manager.getIntegration = vi
      .fn()
      .mockResolvedValue({ ...BASE_INTEGRATION, platform: 'webhook' });
    const mockAdapter = Object.create(GenericWebhookIntegration.prototype);
    mockAdapter.verifyWebhook = vi.fn().mockReturnValue(true);
    mockAdapter.handleInbound = vi.fn().mockRejectedValue(new Error('Processing failed'));
    manager.getAdapter = vi.fn().mockReturnValue(mockAdapter);

    const { app } = await buildApp(manager);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/custom/intg-1',
      headers: { 'x-webhook-signature': 'valid' },
      payload: { data: 'test' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('Processing failed');
  });
});

// ── Plugin hasConfigSchema branch ─────────────────────────────────────────────

describe('plugin endpoints — hasConfigSchema', () => {
  it('returns hasConfigSchema: true when configSchema is present', async () => {
    const manager = buildMockManager();
    manager.getLoadedPlugins = vi
      .fn()
      .mockReturnValue([
        { platform: 'custom', path: '/tmp/plugin.js', configSchema: { type: 'object' } },
      ]);
    const { app } = await buildApp(manager);
    const res = await app.inject({ method: 'GET', url: '/api/v1/integrations/plugins' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.plugins[0].hasConfigSchema).toBe(true);
  });

  it('returns hasConfigSchema: false when configSchema is undefined', async () => {
    const manager = buildMockManager();
    manager.getLoadedPlugins = vi
      .fn()
      .mockReturnValue([{ platform: 'custom', path: '/tmp/plugin.js', configSchema: undefined }]);
    const { app } = await buildApp(manager);
    const res = await app.inject({ method: 'GET', url: '/api/v1/integrations/plugins' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.plugins[0].hasConfigSchema).toBe(false);
  });
});

// ── GitHub webhook with string body ─────────────────────────────────────────

describe('webhook body string handling', () => {
  it('POST /api/v1/webhooks/github/:id handles string body', async () => {
    const manager = buildMockManager();
    manager.getIntegration = vi.fn().mockResolvedValue({ ...BASE_INTEGRATION, platform: 'github' });
    const { app } = await buildApp(manager);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/github/intg-1',
      headers: {
        'x-hub-signature-256': 'sha256=abc',
        'x-github-event': 'issues',
        'content-type': 'text/plain',
      },
      payload: '{"action":"opened"}',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().received).toBe(true);
  });
});

// ── Outbound webhook — createWebhook error path ────────────────────────────

describe('outbound-webhook error paths', () => {
  it('POST /api/v1/outbound-webhooks returns 400 on createWebhook error', async () => {
    const { app } = await buildAppWithOutbound({
      createWebhook: vi.fn().mockRejectedValue(new Error('duplicate')),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/outbound-webhooks',
      payload: { url: 'https://example.com/hook', events: ['message'] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('duplicate');
  });
});
