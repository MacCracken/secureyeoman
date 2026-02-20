import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerConversationRoutes } from './conversation-routes.js';
import type { ConversationStorage } from './conversation-storage.js';

// ── Mock data ────────────────────────────────────────────────────────

const CONVERSATION = {
  id: 'conv-1',
  title: 'My Conversation',
  personalityId: null,
  createdAt: 1000,
  updatedAt: 1000,
};

const MESSAGE = {
  id: 'msg-1',
  conversationId: 'conv-1',
  role: 'user',
  content: 'Hello',
  createdAt: 1000,
};

function makeMockStorage(overrides?: Partial<ConversationStorage>): ConversationStorage {
  return {
    listConversations: vi.fn().mockResolvedValue({ conversations: [CONVERSATION], total: 1 }),
    createConversation: vi.fn().mockResolvedValue(CONVERSATION),
    getConversation: vi.fn().mockResolvedValue(CONVERSATION),
    updateConversation: vi.fn().mockResolvedValue(CONVERSATION),
    deleteConversation: vi.fn().mockResolvedValue(true),
    getMessages: vi.fn().mockResolvedValue([MESSAGE]),
    ...overrides,
  } as unknown as ConversationStorage;
}

function makeMockCompressor(overrides?: Record<string, unknown>) {
  return {
    getHistory: vi.fn().mockResolvedValue([]),
    sealCurrentTopic: vi.fn().mockResolvedValue(undefined),
    getContext: vi.fn().mockResolvedValue({ context: '', tokens: 0 }),
    ...overrides,
  };
}

function buildApp(storageOverrides?: Partial<ConversationStorage>, withCompressor = true) {
  const app = Fastify();
  registerConversationRoutes(app, {
    conversationStorage: makeMockStorage(storageOverrides),
    historyCompressor: withCompressor ? (makeMockCompressor() as any) : undefined,
  });
  return app;
}

// ── Tests ────────────────────────────────────────────────────────────

describe('GET /api/v1/conversations', () => {
  it('lists conversations', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/conversations' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.conversations).toHaveLength(1);
  });

  it('passes limit and offset query params', async () => {
    const storage = makeMockStorage();
    const app = Fastify();
    registerConversationRoutes(app, { conversationStorage: storage });
    await app.inject({ method: 'GET', url: '/api/v1/conversations?limit=10&offset=5' });
    expect(storage.listConversations).toHaveBeenCalledWith({ limit: 10, offset: 5 });
  });
});

describe('POST /api/v1/conversations', () => {
  it('creates a new conversation', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/conversations',
      payload: { title: 'New Chat' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().title).toBe('My Conversation');
  });

  it('returns 400 when title is missing', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/conversations',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when title is blank', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/conversations',
      payload: { title: '   ' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/v1/conversations/:id', () => {
  it('returns conversation with messages', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/conversations/conv-1' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe('conv-1');
    expect(body.messages).toHaveLength(1);
  });

  it('returns 404 when not found', async () => {
    const app = buildApp({ getConversation: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/conversations/missing' });
    expect(res.statusCode).toBe(404);
  });
});

describe('PUT /api/v1/conversations/:id', () => {
  it('updates conversation title', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/conversations/conv-1',
      payload: { title: 'Renamed Chat' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('returns 400 when title is missing', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/conversations/conv-1',
      payload: { title: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when storage throws', async () => {
    const app = buildApp({
      updateConversation: vi.fn().mockRejectedValue(new Error('not found')),
    });
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/conversations/missing',
      payload: { title: 'New title' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /api/v1/conversations/:id', () => {
  it('deletes conversation and returns 204', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/conversations/conv-1' });
    expect(res.statusCode).toBe(204);
  });

  it('returns 404 when conversation not found', async () => {
    const app = buildApp({ deleteConversation: vi.fn().mockResolvedValue(false) });
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/conversations/missing' });
    expect(res.statusCode).toBe(404);
  });
});

describe('compression routes — without compressor', () => {
  it('GET /history returns 503 when compressor not configured', async () => {
    const app = buildApp(undefined, false);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/conversations/conv-1/history',
    });
    expect(res.statusCode).toBe(503);
  });

  it('POST /seal-topic returns 503 when compressor not configured', async () => {
    const app = buildApp(undefined, false);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/conversations/conv-1/seal-topic',
    });
    expect(res.statusCode).toBe(503);
  });

  it('GET /compressed-context returns 503 when compressor not configured', async () => {
    const app = buildApp(undefined, false);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/conversations/conv-1/compressed-context',
    });
    expect(res.statusCode).toBe(503);
  });
});

describe('compression routes — with compressor', () => {
  it('GET /history returns entries', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/conversations/conv-1/history',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.entries).toBeDefined();
  });

  it('GET /history filters by tier query param', async () => {
    const compressor = makeMockCompressor({
      getHistory: vi.fn().mockResolvedValue([
        { tier: 'message', content: 'a' },
        { tier: 'topic', content: 'b' },
      ]),
    });
    const app = Fastify();
    registerConversationRoutes(app, {
      conversationStorage: makeMockStorage(),
      historyCompressor: compressor as any,
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/conversations/conv-1/history?tier=message',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].tier).toBe('message');
  });

  it('POST /seal-topic seals topic and returns message', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/conversations/conv-1/seal-topic',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toContain('sealed');
  });

  it('GET /compressed-context returns context', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/conversations/conv-1/compressed-context?maxTokens=2000',
    });
    expect(res.statusCode).toBe(200);
  });
});
