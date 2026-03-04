/**
 * Group Chat Routes Tests
 *
 * Unit tests for the group chat REST API routes using Fastify inject.
 */

import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { registerGroupChatRoutes } from './group-chat-routes.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeStorage(overrides: Record<string, unknown> = {}) {
  return {
    listChannels: vi.fn().mockResolvedValue({ channels: [], total: 0 }),
    listMessages: vi.fn().mockResolvedValue({ messages: [], total: 0 }),
    ...overrides,
  };
}

function makeIntegrationManager(overrides: Record<string, unknown> = {}) {
  return {
    getIntegration: vi.fn().mockResolvedValue({ id: 'int-1', platform: 'slack' }),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function buildApp(
  storageOverrides: Record<string, unknown> = {},
  managerOverrides: Record<string, unknown> = {}
) {
  const app = Fastify({ logger: false });
  registerGroupChatRoutes(app, {
    groupChatStorage: makeStorage(storageOverrides) as any,
    integrationManager: makeIntegrationManager(managerOverrides) as any,
  });
  return app;
}

// ─── GET /channels ────────────────────────────────────────────────────────────

describe('GET /api/v1/group-chat/channels', () => {
  it('returns channel list', async () => {
    const app = buildApp({
      listChannels: vi.fn().mockResolvedValue({ channels: [{ id: 'c1' }], total: 1 }),
    });
    const res = await app.inject({ method: 'GET', url: '/api/v1/group-chat/channels' });
    expect(res.statusCode).toBe(200);
    expect(res.json().channels).toHaveLength(1);
  });

  it('passes query params to storage', async () => {
    const listChannelsSpy = vi.fn().mockResolvedValue({ channels: [], total: 0 });
    const app = buildApp({ listChannels: listChannelsSpy });
    await app.inject({
      method: 'GET',
      url: '/api/v1/group-chat/channels?platform=slack&limit=10&offset=5',
    });
    expect(listChannelsSpy).toHaveBeenCalledWith({
      platform: 'slack',
      integrationId: undefined,
      limit: 10,
      offset: 5,
    });
  });
});

// ─── GET /channels/:integrationId/:chatId/messages ────────────────────────────

describe('GET /api/v1/group-chat/channels/:integrationId/:chatId/messages', () => {
  it('returns messages', async () => {
    const app = buildApp({
      listMessages: vi.fn().mockResolvedValue({ messages: [{ id: 'm1' }], total: 1 }),
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/group-chat/channels/int-1/chat-1/messages',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().messages).toHaveLength(1);
  });

  it('returns 404 when integration not found', async () => {
    const app = buildApp({}, { getIntegration: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/group-chat/channels/int-missing/chat-1/messages',
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().message).toContain('Integration not found');
  });

  it('passes query params to storage', async () => {
    const listMessagesSpy = vi.fn().mockResolvedValue({ messages: [], total: 0 });
    const app = buildApp({ listMessages: listMessagesSpy });
    await app.inject({
      method: 'GET',
      url: '/api/v1/group-chat/channels/int-1/chat-1/messages?limit=20&offset=0&before=1700000000000',
    });
    expect(listMessagesSpy).toHaveBeenCalledWith('int-1', 'chat-1', {
      limit: 20,
      offset: 0,
      before: 1700000000000,
    });
  });
});

// ─── POST /channels/:integrationId/:chatId/messages ──────────────────────────

describe('POST /api/v1/group-chat/channels/:integrationId/:chatId/messages', () => {
  it('sends message and returns 201', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/group-chat/channels/int-1/chat-1/messages',
      payload: { text: 'Hello!' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().success).toBe(true);
    expect(res.json().text).toBe('Hello!');
  });

  it('returns 400 when text is empty', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/group-chat/channels/int-1/chat-1/messages',
      payload: { text: '   ' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when text is missing', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/group-chat/channels/int-1/chat-1/messages',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when integration not found', async () => {
    const app = buildApp({}, { getIntegration: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/group-chat/channels/int-missing/chat-1/messages',
      payload: { text: 'Hi' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 500 when sendMessage throws', async () => {
    const app = buildApp(
      {},
      { sendMessage: vi.fn().mockRejectedValue(new Error('Network error')) }
    );
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/group-chat/channels/int-1/chat-1/messages',
      payload: { text: 'Hi' },
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().message).toBe('An internal error occurred');
  });

  it('trims whitespace from text', async () => {
    const sendSpy = vi.fn().mockResolvedValue(undefined);
    const app = buildApp({}, { sendMessage: sendSpy });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/group-chat/channels/int-1/chat-1/messages',
      payload: { text: '  hello  ' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().text).toBe('hello');
    expect(sendSpy).toHaveBeenCalledWith('int-1', 'chat-1', 'hello', {
      source: 'group_chat_dashboard',
    });
  });
});
