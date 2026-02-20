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
