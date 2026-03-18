import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { SignJWT } from 'jose';
import {
  registerConversationExportRoutes,
  formatAsMarkdown,
  formatAsText,
  formatAsJson,
  _revokedShareIds,
} from '../conversation-export-routes.js';
import type { ConversationStorage } from '../conversation-storage.js';

// ── Fixtures ──────────────────────────────────────────────────

const CONVERSATION = {
  id: 'conv-1',
  title: 'Test Conversation',
  personalityId: null,
  strategyId: null,
  messageCount: 2,
  parentConversationId: null,
  forkMessageIndex: null,
  branchLabel: null,
  createdAt: 1700000000000,
  updatedAt: 1700000001000,
};

const MESSAGES = [
  {
    id: 'msg-1',
    conversationId: 'conv-1',
    role: 'user' as const,
    content: 'Hello there',
    model: null,
    provider: null,
    tokensUsed: null,
    attachments: [],
    brainContext: null,
    creationEvents: null,
    thinkingContent: null,
    toolCalls: null,
    injectionScore: null,
    citationsMeta: null,
    groundingScore: null,
    createdAt: 1700000000000,
  },
  {
    id: 'msg-2',
    conversationId: 'conv-1',
    role: 'assistant' as const,
    content: 'General Kenobi!',
    model: 'claude-3',
    provider: 'anthropic',
    tokensUsed: 42,
    attachments: [],
    brainContext: null,
    creationEvents: null,
    thinkingContent: null,
    toolCalls: null,
    injectionScore: null,
    citationsMeta: null,
    groundingScore: null,
    createdAt: 1700000001000,
  },
];

const JWT_SECRET = 'test-secret-that-is-long-enough-for-hs256';

// ── Mock Storage ──────────────────────────────────────────────

function makeMockStorage(overrides?: Partial<ConversationStorage>): ConversationStorage {
  return {
    getConversation: vi.fn().mockResolvedValue(CONVERSATION),
    getMessages: vi.fn().mockResolvedValue(MESSAGES),
    ...overrides,
  } as unknown as ConversationStorage;
}

function buildApp(overrides?: Partial<ConversationStorage>) {
  const app = Fastify();
  registerConversationExportRoutes(app, {
    conversationStorage: makeMockStorage(overrides),
  });
  return app;
}

beforeEach(() => {
  process.env.JWT_SECRET = JWT_SECRET;
  _revokedShareIds().clear();
});

// ── Unit tests for formatters ─────────────────────────────────

describe('formatAsMarkdown', () => {
  it('produces markdown with H1 title and role headers', () => {
    const md = formatAsMarkdown(CONVERSATION, MESSAGES);
    expect(md).toContain('# Test Conversation');
    expect(md).toContain('### User');
    expect(md).toContain('### Assistant');
    expect(md).toContain('Hello there');
    expect(md).toContain('General Kenobi!');
    expect(md).toContain('*Model: claude-3*');
  });
});

describe('formatAsText', () => {
  it('produces plain text with role labels', () => {
    const txt = formatAsText(CONVERSATION, MESSAGES);
    expect(txt).toContain('Test Conversation');
    expect(txt).toContain('[User]');
    expect(txt).toContain('[Assistant]');
    expect(txt).toContain('Hello there');
    expect(txt).toContain('General Kenobi!');
  });
});

describe('formatAsJson', () => {
  it('returns valid JSON structure with messages', () => {
    const json = formatAsJson(CONVERSATION, MESSAGES);
    expect(json.id).toBe('conv-1');
    expect(json.title).toBe('Test Conversation');
    expect(json.exportedAt).toBeTypeOf('number');
    expect(Array.isArray(json.messages)).toBe(true);
    const msgs = json.messages as { role: string; content: string }[];
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('user');
    expect(msgs[1].role).toBe('assistant');
  });
});

// ── Export route tests ────────────────────────────────────────

describe('GET /api/v1/conversations/:id/export', () => {
  it('returns markdown by default', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/conversations/conv-1/export',
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/markdown');
    expect(res.headers['content-disposition']).toContain('.md');
    expect(res.body).toContain('# Test Conversation');
  });

  it('returns JSON format', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/conversations/conv-1/export?format=json',
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    const body = res.json();
    expect(body.id).toBe('conv-1');
    expect(body.messages).toHaveLength(2);
  });

  it('returns text format', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/conversations/conv-1/export?format=text',
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.body).toContain('[User]');
  });

  it('returns 400 for invalid format', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/conversations/conv-1/export?format=pdf',
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 for nonexistent conversation', async () => {
    const app = buildApp({ getConversation: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/conversations/missing/export',
    });
    expect(res.statusCode).toBe(404);
  });
});

// ── Share link tests ──────────────────────────────────────────

describe('POST /api/v1/conversations/:id/share', () => {
  it('returns a share token with expiry', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/conversations/conv-1/share',
      payload: {},
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.shareId).toBeTypeOf('string');
    expect(body.shareId.length).toBeGreaterThan(10);
    expect(body.expiresAt).toBeTypeOf('number');
    expect(body.url).toContain('/api/v1/conversations/shared/');
  });

  it('returns 404 for nonexistent conversation', async () => {
    const app = buildApp({ getConversation: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/conversations/missing/share',
      payload: {},
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/v1/conversations/shared/:token', () => {
  it('returns conversation without auth for valid token', async () => {
    const app = buildApp();

    // Create a valid share token
    const secret = new TextEncoder().encode(JWT_SECRET);
    const token = await new SignJWT({
      conversationId: 'conv-1',
      type: 'conversation_share',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
      .sign(secret);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/conversations/shared/${token}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe('conv-1');
    expect(body.messages).toHaveLength(2);
  });

  it('returns 410 for expired token', async () => {
    const app = buildApp();

    const secret = new TextEncoder().encode(JWT_SECRET);
    const token = await new SignJWT({
      conversationId: 'conv-1',
      type: 'conversation_share',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(secret);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/conversations/shared/${token}`,
    });
    expect(res.statusCode).toBe(410);
  });

  it('returns 401 for invalid token', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/conversations/shared/not-a-real-token',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 410 for revoked token', async () => {
    const app = buildApp();

    const secret = new TextEncoder().encode(JWT_SECRET);
    const token = await new SignJWT({
      conversationId: 'conv-1',
      type: 'conversation_share',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
      .sign(secret);

    // Revoke the token
    _revokedShareIds().add(token);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/conversations/shared/${token}`,
    });
    expect(res.statusCode).toBe(410);
  });

  it('returns 401 for token with wrong type claim', async () => {
    const app = buildApp();

    const secret = new TextEncoder().encode(JWT_SECRET);
    const token = await new SignJWT({
      conversationId: 'conv-1',
      type: 'wrong_type',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
      .sign(secret);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/conversations/shared/${token}`,
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('DELETE /api/v1/conversations/:id/share', () => {
  it('revokes a share link and returns 204', async () => {
    const app = buildApp();

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/conversations/conv-1/share',
      payload: { shareId: 'some-token-to-revoke' },
    });
    expect(res.statusCode).toBe(204);
    expect(_revokedShareIds().has('some-token-to-revoke')).toBe(true);
  });

  it('returns 400 when shareId is missing', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/conversations/conv-1/share',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});
