import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerChatRoutes } from './chat-routes.js';
import type { SecureYeoman } from '../secureyeoman.js';

vi.mock('../logging/logger.js', () => ({
  getLogger: vi.fn().mockReturnValue({
    child: vi.fn().mockReturnThis(),
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  }),
}));

function createMockSecureYeoman(
  overrides: Partial<{
    aiClient: unknown;
    soulManager: unknown;
    brainManager: unknown;
    conversationStorage: unknown;
    hasAiClient: boolean;
    hasBrain: boolean;
    hasConversationStorage: boolean;
    mcpClient: unknown;
    mcpStorage: unknown;
  }> = {}
) {
  const mockAiClient = {
    chat: vi.fn().mockResolvedValue({
      id: 'resp-1',
      content: 'Hello! I am FRIDAY.',
      toolCalls: [],
      usage: { inputTokens: 100, outputTokens: 50, cachedTokens: 0, totalTokens: 150 },
      stopReason: 'end_turn',
      model: 'claude-sonnet-4-20250514',
      provider: 'anthropic',
    }),
  };

  const mockSoulManager = {
    composeSoulPrompt: vi.fn().mockReturnValue('You are FRIDAY.'),
    getActiveTools: vi.fn().mockReturnValue([]),
    getPersonality: vi.fn().mockReturnValue(null),
    getActivePersonality: vi.fn().mockReturnValue(null),
  };

  const mockBrainManager = {
    recall: vi.fn().mockReturnValue([]),
    queryKnowledge: vi.fn().mockReturnValue([]),
    remember: vi.fn().mockReturnValue({
      id: 'mem-1',
      type: 'episodic',
      content: 'test',
      source: 'dashboard_chat',
      importance: 0.5,
      createdAt: Date.now(),
    }),
  };

  const mockConversationStorage = overrides.conversationStorage ?? {
    addMessage: vi.fn().mockReturnValue({
      id: 'msg-1',
      conversationId: 'conv-1',
      role: 'user',
      content: 'test',
      model: null,
      provider: null,
      tokensUsed: null,
      attachments: [],
      brainContext: null,
      createdAt: Date.now(),
    }),
  };

  const mock = {
    getAIClient:
      overrides.hasAiClient === false
        ? vi.fn().mockImplementation(() => {
            throw new Error('AI client not available');
          })
        : vi.fn().mockReturnValue(overrides.aiClient ?? mockAiClient),
    getSoulManager: vi.fn().mockReturnValue(overrides.soulManager ?? mockSoulManager),
    getBrainManager:
      overrides.hasBrain === false
        ? vi.fn().mockImplementation(() => {
            throw new Error('Brain manager is not available');
          })
        : vi.fn().mockReturnValue(overrides.brainManager ?? mockBrainManager),
    getMcpClientManager: vi.fn().mockReturnValue(overrides.mcpClient ?? null),
    getMcpStorage: vi.fn().mockReturnValue(overrides.mcpStorage ?? null),
    getConversationStorage:
      overrides.hasConversationStorage === false
        ? vi.fn().mockReturnValue(null)
        : vi.fn().mockReturnValue(mockConversationStorage),
  } as unknown as SecureYeoman;

  return { mock, mockAiClient, mockSoulManager, mockBrainManager, mockConversationStorage };
}

describe('Chat Routes', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(() => {
    app = Fastify();
  });

  it('POST /api/v1/chat returns assistant response', async () => {
    const { mock } = createMockSecureYeoman();
    registerChatRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chat',
      payload: { message: 'Hello!' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.role).toBe('assistant');
    expect(body.content).toBe('Hello! I am FRIDAY.');
    expect(body.model).toBe('claude-sonnet-4-20250514');
    expect(body.provider).toBe('anthropic');
    expect(body.tokensUsed).toBe(150);
  });

  it('POST /api/v1/chat includes system prompt from soul', async () => {
    const { mock, mockAiClient, mockSoulManager } = createMockSecureYeoman();
    registerChatRoutes(app, { secureYeoman: mock });

    await app.inject({
      method: 'POST',
      url: '/api/v1/chat',
      payload: { message: 'Hi there' },
    });

    expect(mockSoulManager.composeSoulPrompt).toHaveBeenCalledWith('Hi there', undefined);
    const chatCall = mockAiClient.chat.mock.calls[0][0];
    expect(chatCall.messages[0]).toEqual({ role: 'system', content: 'You are FRIDAY.' });
    expect(chatCall.messages[1]).toEqual({ role: 'user', content: 'Hi there' });
  });

  it('POST /api/v1/chat includes history in messages', async () => {
    const { mock, mockAiClient } = createMockSecureYeoman();
    registerChatRoutes(app, { secureYeoman: mock });

    await app.inject({
      method: 'POST',
      url: '/api/v1/chat',
      payload: {
        message: 'Follow up question',
        history: [
          { role: 'user', content: 'First message' },
          { role: 'assistant', content: 'First response' },
        ],
      },
    });

    const chatCall = mockAiClient.chat.mock.calls[0][0];
    // system + 2 history + 1 new user message = 4
    expect(chatCall.messages).toHaveLength(4);
    expect(chatCall.messages[1]).toEqual({ role: 'user', content: 'First message' });
    expect(chatCall.messages[2]).toEqual({ role: 'assistant', content: 'First response' });
    expect(chatCall.messages[3]).toEqual({ role: 'user', content: 'Follow up question' });
  });

  it('POST /api/v1/chat returns 400 for empty message', async () => {
    const { mock } = createMockSecureYeoman();
    registerChatRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chat',
      payload: { message: '' },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload).message).toBe('Message is required');
  });

  it('POST /api/v1/chat returns 400 for missing message', async () => {
    const { mock } = createMockSecureYeoman();
    registerChatRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chat',
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });

  it('POST /api/v1/chat returns 503 when AI client unavailable', async () => {
    const { mock } = createMockSecureYeoman({ hasAiClient: false });
    registerChatRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chat',
      payload: { message: 'Hello!' },
    });

    expect(res.statusCode).toBe(503);
  });

  it('POST /api/v1/chat passes personalityId to composeSoulPrompt', async () => {
    const { mock, mockSoulManager } = createMockSecureYeoman();
    registerChatRoutes(app, { secureYeoman: mock });

    await app.inject({
      method: 'POST',
      url: '/api/v1/chat',
      payload: { message: 'Hello!', personalityId: 'p-custom' },
    });

    expect(mockSoulManager.composeSoulPrompt).toHaveBeenCalledWith('Hello!', 'p-custom');
  });

  it('POST /api/v1/chat omits personalityId when not provided', async () => {
    const { mock, mockSoulManager } = createMockSecureYeoman();
    registerChatRoutes(app, { secureYeoman: mock });

    await app.inject({
      method: 'POST',
      url: '/api/v1/chat',
      payload: { message: 'Hello!' },
    });

    expect(mockSoulManager.composeSoulPrompt).toHaveBeenCalledWith('Hello!', undefined);
  });

  it('POST /api/v1/chat returns 502 on AI error', async () => {
    const failingClient = {
      chat: vi.fn().mockRejectedValue(new Error('Provider down')),
    };
    const { mock } = createMockSecureYeoman({ aiClient: failingClient });
    registerChatRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chat',
      payload: { message: 'Hello!' },
    });

    expect(res.statusCode).toBe(502);
    expect(JSON.parse(res.payload).message).toContain('Provider down');
  });

  // ── Brain integration tests ─────────────────────────────────

  it('POST /api/v1/chat includes brainContext when Brain has relevant context', async () => {
    const mockBrainManager = {
      recall: vi
        .fn()
        .mockReturnValue([{ id: 'm1', type: 'episodic', content: 'User likes TypeScript' }]),
      queryKnowledge: vi
        .fn()
        .mockReturnValue([
          { id: 'k1', topic: 'coding', content: 'TypeScript is a typed superset of JS' },
        ]),
      remember: vi.fn(),
    };
    const { mock } = createMockSecureYeoman({ brainManager: mockBrainManager });
    registerChatRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chat',
      payload: { message: 'Tell me about TypeScript' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.brainContext).toBeDefined();
    expect(body.brainContext.memoriesUsed).toBe(1);
    expect(body.brainContext.knowledgeUsed).toBe(1);
    expect(body.brainContext.contextSnippets).toHaveLength(2);
    expect(body.brainContext.contextSnippets[0]).toContain('User likes TypeScript');
  });

  it('POST /api/v1/chat returns empty brainContext when Brain has no relevant context', async () => {
    const { mock } = createMockSecureYeoman();
    registerChatRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chat',
      payload: { message: 'Hello!' },
    });

    const body = JSON.parse(res.payload);
    expect(body.brainContext).toEqual({
      memoriesUsed: 0,
      knowledgeUsed: 0,
      contextSnippets: [],
    });
  });

  it('POST /api/v1/chat returns empty brainContext when Brain is unavailable', async () => {
    const { mock } = createMockSecureYeoman({ hasBrain: false });
    registerChatRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chat',
      payload: { message: 'Hello!' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.brainContext).toEqual({
      memoriesUsed: 0,
      knowledgeUsed: 0,
      contextSnippets: [],
    });
  });

  it('POST /api/v1/chat with saveAsMemory stores the exchange', async () => {
    const { mock, mockBrainManager } = createMockSecureYeoman();
    registerChatRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chat',
      payload: { message: 'Remember this!', saveAsMemory: true },
    });

    expect(res.statusCode).toBe(200);
    expect(mockBrainManager.remember).toHaveBeenCalledWith(
      'episodic',
      expect.stringContaining('Remember this!'),
      'dashboard_chat',
      { personalityId: 'default' }
    );
  });

  // ── /chat/remember endpoint tests ────────────────────────────

  it('POST /api/v1/chat/remember stores a memory', async () => {
    const { mock, mockBrainManager } = createMockSecureYeoman();
    registerChatRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chat/remember',
      payload: { content: 'Important fact to remember' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.memory).toBeDefined();
    expect(mockBrainManager.remember).toHaveBeenCalledWith(
      'episodic',
      'Important fact to remember',
      'dashboard_chat',
      undefined
    );
  });

  it('POST /api/v1/chat/remember returns 400 for empty content', async () => {
    const { mock } = createMockSecureYeoman();
    registerChatRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chat/remember',
      payload: { content: '' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('POST /api/v1/chat/remember returns 503 when Brain unavailable', async () => {
    const { mock } = createMockSecureYeoman({ hasBrain: false });
    registerChatRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chat/remember',
      payload: { content: 'Something to remember' },
    });

    expect(res.statusCode).toBe(503);
  });

  // ── Conversation persistence tests ────────────────────────────

  it('POST /api/v1/chat persists messages when conversationId is provided', async () => {
    const { mock, mockConversationStorage } = createMockSecureYeoman();
    registerChatRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chat',
      payload: { message: 'Hello!', conversationId: 'conv-123' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.conversationId).toBe('conv-123');

    // Should have been called twice: once for user message, once for assistant
    const addMessage = (mockConversationStorage as any).addMessage;
    expect(addMessage).toHaveBeenCalledTimes(2);

    // First call: user message
    expect(addMessage.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        conversationId: 'conv-123',
        role: 'user',
        content: 'Hello!',
      })
    );

    // Second call: assistant message
    expect(addMessage.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        conversationId: 'conv-123',
        role: 'assistant',
        content: 'Hello! I am FRIDAY.',
        model: 'claude-sonnet-4-20250514',
        provider: 'anthropic',
        tokensUsed: 150,
      })
    );
  });

  it('POST /api/v1/chat does not persist messages when conversationId is omitted', async () => {
    const { mock, mockConversationStorage } = createMockSecureYeoman();
    registerChatRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chat',
      payload: { message: 'Hello!' },
    });

    expect(res.statusCode).toBe(200);
    const addMessage = (mockConversationStorage as any).addMessage;
    expect(addMessage).not.toHaveBeenCalled();
  });

  it('POST /api/v1/chat persists brainContext on assistant messages', async () => {
    const mockBrainManager = {
      recall: vi
        .fn()
        .mockReturnValue([{ id: 'm1', type: 'episodic', content: 'User likes TypeScript' }]),
      queryKnowledge: vi.fn().mockReturnValue([]),
      remember: vi.fn(),
    };
    const { mock, mockConversationStorage } = createMockSecureYeoman({
      brainManager: mockBrainManager,
    });
    registerChatRoutes(app, { secureYeoman: mock });

    await app.inject({
      method: 'POST',
      url: '/api/v1/chat',
      payload: { message: 'TypeScript?', conversationId: 'conv-brain' },
    });

    const addMessage = (mockConversationStorage as any).addMessage;
    // The assistant message (second call) should include brainContext
    expect(addMessage.mock.calls[1][0].brainContext).toEqual(
      expect.objectContaining({
        memoriesUsed: 1,
        knowledgeUsed: 0,
      })
    );
  });

  it('POST /api/v1/chat with memoryEnabled=false skips brain context', async () => {
    const { mock, mockBrainManager } = createMockSecureYeoman();
    registerChatRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chat',
      payload: { message: 'hello', memoryEnabled: false },
    });
    expect(res.statusCode).toBe(200);
    expect(mockBrainManager.recall).not.toHaveBeenCalled();
  });

  // ── Feedback endpoint ──────────────────────────────────────────────────────

  it('POST /api/v1/chat/feedback returns stored:true on success', async () => {
    const { mock } = createMockSecureYeoman();
    registerChatRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chat/feedback',
      payload: {
        conversationId: 'conv-1',
        messageId: 'msg-1',
        feedback: 'positive',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().stored).toBe(true);
  });

  it('POST /api/v1/chat/feedback returns 400 for missing required fields', async () => {
    const { mock } = createMockSecureYeoman();
    registerChatRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chat/feedback',
      payload: { conversationId: 'conv-1', messageId: 'msg-1' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('required');
  });

  it('POST /api/v1/chat/feedback returns 400 for invalid feedback type', async () => {
    const { mock } = createMockSecureYeoman();
    registerChatRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chat/feedback',
      payload: {
        conversationId: 'conv-1',
        messageId: 'msg-1',
        feedback: 'invalid-type',
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('feedback must be one of');
  });

  it('POST /api/v1/chat/feedback returns 503 when brain unavailable', async () => {
    const { mock } = createMockSecureYeoman({ hasBrain: false });
    registerChatRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chat/feedback',
      payload: {
        conversationId: 'conv-1',
        messageId: 'msg-1',
        feedback: 'negative',
      },
    });
    expect(res.statusCode).toBe(503);
  });

  it('POST /api/v1/chat/feedback accepts correction feedback with details', async () => {
    const { mock } = createMockSecureYeoman();
    registerChatRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chat/feedback',
      payload: {
        conversationId: 'conv-1',
        messageId: 'msg-1',
        feedback: 'correction',
        details: 'The answer was wrong',
      },
    });
    expect(res.statusCode).toBe(200);
  });
});

// ── MCP tool gathering ─────────────────────────────────────────────────────────

describe('Chat Routes — MCP tool gathering', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(() => {
    app = Fastify();
  });

  const mcpPersonality = {
    id: 'p-mcp',
    name: 'MCP Personality',
    defaultModel: null,
    modelFallbacks: [],
    body: {
      enabled: true,
      selectedServers: ['external-server'],
      mcpFeatures: {
        exposeGit: false,
        exposeFilesystem: false,
        exposeWeb: true,
        exposeWebScraping: false,
        exposeWebSearch: false,
        exposeBrowser: false,
      },
    },
  };

  const buildMcpSoulManager = (personality: unknown) => ({
    composeSoulPrompt: vi.fn().mockReturnValue('System.'),
    getActiveTools: vi.fn().mockReturnValue([]),
    getPersonality: vi.fn().mockReturnValue(null),
    getActivePersonality: vi.fn().mockReturnValue(personality),
  });

  it('includes tools from selectedServers when body.enabled=true', async () => {
    const mockMcpClient = {
      getAllTools: vi.fn().mockReturnValue([
        {
          name: 'my_tool',
          serverName: 'external-server',
          description: 'A tool',
          inputSchema: { type: 'object', properties: {} },
        },
      ]),
    };
    const { mock, mockAiClient } = createMockSecureYeoman({
      soulManager: buildMcpSoulManager(mcpPersonality),
      mcpClient: mockMcpClient,
      mcpStorage: {
        getConfig: vi.fn().mockResolvedValue({ exposeGit: false, exposeFilesystem: false }),
      },
    });
    registerChatRoutes(app, { secureYeoman: mock });
    await app.inject({ method: 'POST', url: '/api/v1/chat', payload: { message: 'hello' } });
    const chatCall = mockAiClient.chat.mock.calls[0][0];
    expect(chatCall.tools).toHaveLength(1);
    expect(chatCall.tools[0].name).toBe('my_tool');
  });

  it('excludes tools from servers not in selectedServers', async () => {
    const mockMcpClient = {
      getAllTools: vi.fn().mockReturnValue([
        {
          name: 'other_tool',
          serverName: 'not-selected',
          description: 'A tool',
          inputSchema: { type: 'object', properties: {} },
        },
      ]),
    };
    const { mock, mockAiClient } = createMockSecureYeoman({
      soulManager: buildMcpSoulManager(mcpPersonality),
      mcpClient: mockMcpClient,
      mcpStorage: {
        getConfig: vi.fn().mockResolvedValue({ exposeGit: false, exposeFilesystem: false }),
      },
    });
    registerChatRoutes(app, { secureYeoman: mock });
    await app.inject({ method: 'POST', url: '/api/v1/chat', payload: { message: 'hello' } });
    const chatCall = mockAiClient.chat.mock.calls[0][0];
    expect(chatCall.tools ?? []).toHaveLength(0);
  });

  it('excludes YEOMAN MCP git tools when exposeGit is disabled globally', async () => {
    const yeomanPersonality = {
      ...mcpPersonality,
      body: { ...mcpPersonality.body, selectedServers: ['YEOMAN MCP'] },
    };
    const mockMcpClient = {
      getAllTools: vi.fn().mockReturnValue([
        {
          name: 'git_status',
          serverName: 'YEOMAN MCP',
          description: 'Git status',
          inputSchema: {},
        },
        {
          name: 'git_commit',
          serverName: 'YEOMAN MCP',
          description: 'Git commit',
          inputSchema: {},
        },
      ]),
    };
    const { mock, mockAiClient } = createMockSecureYeoman({
      soulManager: buildMcpSoulManager(yeomanPersonality),
      mcpClient: mockMcpClient,
      mcpStorage: {
        getConfig: vi.fn().mockResolvedValue({ exposeGit: false, exposeFilesystem: false }),
      },
    });
    registerChatRoutes(app, { secureYeoman: mock });
    await app.inject({ method: 'POST', url: '/api/v1/chat', payload: { message: 'hello' } });
    const chatCall = mockAiClient.chat.mock.calls[0][0];
    expect(chatCall.tools ?? []).toHaveLength(0);
  });

  it('excludes YEOMAN MCP filesystem tools when exposeFilesystem is disabled', async () => {
    const yeomanPersonality = {
      ...mcpPersonality,
      body: { ...mcpPersonality.body, selectedServers: ['YEOMAN MCP'] },
    };
    const mockMcpClient = {
      getAllTools: vi.fn().mockReturnValue([
        { name: 'fs_read', serverName: 'YEOMAN MCP', description: 'File read', inputSchema: {} },
        {
          name: 'file_write',
          serverName: 'YEOMAN MCP',
          description: 'File write',
          inputSchema: {},
        },
        {
          name: 'filesystem_list',
          serverName: 'YEOMAN MCP',
          description: 'List files',
          inputSchema: {},
        },
      ]),
    };
    const { mock, mockAiClient } = createMockSecureYeoman({
      soulManager: buildMcpSoulManager(yeomanPersonality),
      mcpClient: mockMcpClient,
      mcpStorage: {
        getConfig: vi.fn().mockResolvedValue({ exposeGit: false, exposeFilesystem: false }),
      },
    });
    registerChatRoutes(app, { secureYeoman: mock });
    await app.inject({ method: 'POST', url: '/api/v1/chat', payload: { message: 'hello' } });
    const chatCall = mockAiClient.chat.mock.calls[0][0];
    expect(chatCall.tools ?? []).toHaveLength(0);
  });

  it('includes YEOMAN MCP non-git/non-fs tools regardless of feature gates', async () => {
    const yeomanPersonality = {
      ...mcpPersonality,
      body: { ...mcpPersonality.body, selectedServers: ['YEOMAN MCP'] },
    };
    const mockMcpClient = {
      getAllTools: vi.fn().mockReturnValue([
        {
          name: 'web_search',
          serverName: 'YEOMAN MCP',
          description: 'Web search',
          inputSchema: {},
        },
      ]),
    };
    const { mock, mockAiClient } = createMockSecureYeoman({
      soulManager: buildMcpSoulManager(yeomanPersonality),
      mcpClient: mockMcpClient,
      mcpStorage: {
        getConfig: vi.fn().mockResolvedValue({ exposeGit: false, exposeFilesystem: false }),
      },
    });
    registerChatRoutes(app, { secureYeoman: mock });
    await app.inject({ method: 'POST', url: '/api/v1/chat', payload: { message: 'hello' } });
    const chatCall = mockAiClient.chat.mock.calls[0][0];
    expect(chatCall.tools).toHaveLength(1);
    expect(chatCall.tools[0].name).toBe('web_search');
  });

  it('skips MCP gathering when personality.body.enabled is false', async () => {
    const disabledBodyPersonality = {
      ...mcpPersonality,
      body: { ...mcpPersonality.body, enabled: false },
    };
    const mockMcpClient = {
      getAllTools: vi.fn().mockReturnValue([
        {
          name: 'my_tool',
          serverName: 'external-server',
          description: 'A tool',
          inputSchema: {},
        },
      ]),
    };
    const { mock } = createMockSecureYeoman({
      soulManager: buildMcpSoulManager(disabledBodyPersonality),
      mcpClient: mockMcpClient,
      mcpStorage: { getConfig: vi.fn().mockResolvedValue({}) },
    });
    registerChatRoutes(app, { secureYeoman: mock });
    await app.inject({ method: 'POST', url: '/api/v1/chat', payload: { message: 'hello' } });
    expect(mockMcpClient.getAllTools).not.toHaveBeenCalled();
  });

  it('skips MCP gathering when selectedServers is empty', async () => {
    const noServersPersonality = {
      ...mcpPersonality,
      body: { ...mcpPersonality.body, selectedServers: [] },
    };
    const mockMcpClient = {
      getAllTools: vi.fn().mockReturnValue([
        {
          name: 'my_tool',
          serverName: 'external-server',
          description: 'A tool',
          inputSchema: {},
        },
      ]),
    };
    const { mock } = createMockSecureYeoman({
      soulManager: buildMcpSoulManager(noServersPersonality),
      mcpClient: mockMcpClient,
      mcpStorage: { getConfig: vi.fn().mockResolvedValue({}) },
    });
    registerChatRoutes(app, { secureYeoman: mock });
    await app.inject({ method: 'POST', url: '/api/v1/chat', payload: { message: 'hello' } });
    expect(mockMcpClient.getAllTools).not.toHaveBeenCalled();
  });
});

// ── Context compaction ─────────────────────────────────────────────────────────

describe('Chat Routes — context compaction', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(() => {
    app = Fastify();
  });

  // ~750 tokens each; 10 messages × 754 ≈ 7,540 tokens > 6,553 (80% of 8,192 default window)
  const longContent = 'x'.repeat(3000);
  const largeHistory = Array.from({ length: 10 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: longContent,
  }));

  it('compacts large message histories — calls AI twice (summary + response)', async () => {
    const { mock, mockAiClient } = createMockSecureYeoman();
    registerChatRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chat',
      payload: { message: 'Short message', history: largeHistory },
    });

    expect(res.statusCode).toBe(200);
    // Once for context summary, once for the actual response
    expect(mockAiClient.chat).toHaveBeenCalledTimes(2);
  });

  it('continues with original messages when compaction summariser throws', async () => {
    const failingThenSucceedingClient = {
      chat: vi
        .fn()
        .mockRejectedValueOnce(new Error('summarizer failed'))
        .mockResolvedValueOnce({
          id: 'resp-1',
          content: 'Hello!',
          toolCalls: [],
          usage: { inputTokens: 100, outputTokens: 50, cachedTokens: 0, totalTokens: 150 },
          stopReason: 'end_turn',
          model: 'claude-sonnet',
          provider: 'anthropic',
        }),
    };
    const { mock } = createMockSecureYeoman({ aiClient: failingThenSucceedingClient });
    registerChatRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chat',
      payload: { message: 'Short message', history: largeHistory },
    });

    // Compaction error is swallowed; falls through to normal response
    expect(res.statusCode).toBe(200);
    expect(failingThenSucceedingClient.chat).toHaveBeenCalledTimes(2);
  });
});

// ── Resource action recording ──────────────────────────────────────────────────
//
// When the agentic loop executes a recognised creation tool successfully, the
// chat route should:
//   1. Push a sparkle CreationEvent to the response (visible in the chat bubble)
//   2. Write a task history entry via taskStorage.storeTask()
//
// Status in the history entry comes from the result item (e.g. 'pending' for a
// newly created task); everything else defaults to 'completed'.
//
// chat-routes owns ALL persistence — creation-tool-executor never calls storeTask.

describe('Chat Routes — resource action recording', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(() => {
    app = Fastify();
  });

  /** Mock AI that emits one tool call then a normal end_turn response. */
  function makeAgentAiClient(toolName: string, toolArgs: Record<string, unknown>) {
    const toolResponse = {
      id: 'resp-tool',
      content: '',
      toolCalls: [{ id: 'tc-1', name: toolName, arguments: toolArgs }],
      usage: { inputTokens: 50, outputTokens: 30, cachedTokens: 0, totalTokens: 80 },
      stopReason: 'tool_use',
      model: 'claude-sonnet-4-20250514',
      provider: 'anthropic',
    };
    const finalResponse = {
      id: 'resp-final',
      content: 'Done.',
      toolCalls: [],
      usage: { inputTokens: 50, outputTokens: 30, cachedTokens: 0, totalTokens: 80 },
      stopReason: 'end_turn',
      model: 'claude-sonnet-4-20250514',
      provider: 'anthropic',
    };
    return { chat: vi.fn().mockResolvedValueOnce(toolResponse).mockResolvedValueOnce(finalResponse) };
  }

  /** Extend a base SecureYeoman mock with the extra managers needed by the executor. */
  function withExecutorManagers(
    baseMock: ReturnType<typeof createMockSecureYeoman>['mock'],
    extras: {
      taskStorage?: { storeTask: ReturnType<typeof vi.fn> } | null;
      taskExecutor?: unknown;
      soulManagerExtras?: Record<string, unknown>;
    } = {}
  ) {
    const mock = baseMock as any;
    mock.getTaskStorage = vi.fn().mockReturnValue(extras.taskStorage ?? null);
    mock.getTaskExecutor = vi.fn().mockReturnValue(extras.taskExecutor ?? null);
    mock.getSubAgentManager = vi.fn().mockReturnValue(null);
    mock.getSwarmManager = vi.fn().mockReturnValue(null);
    mock.getExperimentManager = vi.fn().mockReturnValue(null);
    mock.getA2AManager = vi.fn().mockReturnValue(null);
    mock.getWorkflowManager = vi.fn().mockReturnValue(null);
    mock.getDynamicToolManager = vi.fn().mockReturnValue(null);
    // Merge any extra soul manager methods (e.g. createSkill)
    if (extras.soulManagerExtras) {
      const sm = mock.getSoulManager();
      Object.assign(sm, extras.soulManagerExtras);
    }
    return mock;
  }

  it('emits a sparkle CreationEvent for create_skill', async () => {
    const mockSkill = { id: 'sk-1', name: 'Test Skill' };
    const aiClient = makeAgentAiClient('create_skill', {
      name: 'test_skill',
      description: 'A skill',
      instructions: 'Do stuff',
    });
    const { mock: baseMock } = createMockSecureYeoman({ aiClient });
    const mock = withExecutorManagers(baseMock, {
      soulManagerExtras: { createSkill: vi.fn().mockResolvedValue(mockSkill) },
    });
    registerChatRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chat',
      payload: { message: 'create a skill' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.creationEvents).toHaveLength(1);
    expect(body.creationEvents[0]).toMatchObject({
      tool: 'create_skill',
      label: 'Skill',
      action: 'Created',
      name: 'Test Skill',
      id: 'sk-1',
    });
  });

  it('writes a COMPLETED task history entry for create_skill', async () => {
    const mockTaskStorage = { storeTask: vi.fn().mockResolvedValue(undefined) };
    const mockSkill = { id: 'sk-1', name: 'My Skill' };
    const aiClient = makeAgentAiClient('create_skill', {
      name: 'my_skill',
      description: '',
      instructions: '',
    });
    const { mock: baseMock } = createMockSecureYeoman({ aiClient });
    const mock = withExecutorManagers(baseMock, {
      taskStorage: mockTaskStorage,
      soulManagerExtras: { createSkill: vi.fn().mockResolvedValue(mockSkill) },
    });
    registerChatRoutes(app, { secureYeoman: mock });

    await app.inject({
      method: 'POST',
      url: '/api/v1/chat',
      payload: { message: 'create a skill' },
    });

    expect(mockTaskStorage.storeTask).toHaveBeenCalledTimes(1);
    expect(mockTaskStorage.storeTask).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Skill Created: My Skill',
        description: 'create_skill',
        status: 'completed',
        completedAt: expect.any(Number),
      })
    );
  });

  it('writes a PENDING task history entry for create_task — status from result item', async () => {
    // No taskExecutor → executor falls back, returns { task: { status: 'pending', ... } }
    const mockTaskStorage = { storeTask: vi.fn().mockResolvedValue(undefined) };
    const aiClient = makeAgentAiClient('create_task', {
      name: 'My New Task',
      type: 'execute',
    });
    const { mock: baseMock } = createMockSecureYeoman({ aiClient });
    const mock = withExecutorManagers(baseMock, { taskStorage: mockTaskStorage });
    registerChatRoutes(app, { secureYeoman: mock });

    await app.inject({
      method: 'POST',
      url: '/api/v1/chat',
      payload: { message: 'create a task' },
    });

    expect(mockTaskStorage.storeTask).toHaveBeenCalledTimes(1);
    expect(mockTaskStorage.storeTask).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Task Created: My New Task',
        description: 'create_task',
        status: 'pending',
      })
    );
    // completedAt should NOT be present for a pending entry
    const call = mockTaskStorage.storeTask.mock.calls[0][0];
    expect(call.completedAt).toBeUndefined();
  });

  it('records delete_skill with action "Deleted"', async () => {
    const mockTaskStorage = { storeTask: vi.fn().mockResolvedValue(undefined) };
    const aiClient = makeAgentAiClient('delete_skill', { id: 'sk-99' });
    const { mock: baseMock } = createMockSecureYeoman({ aiClient });
    const mock = withExecutorManagers(baseMock, {
      taskStorage: mockTaskStorage,
      soulManagerExtras: { deleteSkill: vi.fn().mockResolvedValue(undefined) },
    });
    registerChatRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chat',
      payload: { message: 'delete that skill' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.creationEvents[0]).toMatchObject({ action: 'Deleted', label: 'Skill' });
    expect(mockTaskStorage.storeTask).toHaveBeenCalledWith(
      expect.objectContaining({ name: expect.stringContaining('Skill Deleted:') })
    );
  });

  it('does not record anything when result is an error', async () => {
    // createSkill throwing causes the executor to return isError=true
    const mockTaskStorage = { storeTask: vi.fn().mockResolvedValue(undefined) };
    const aiClient = makeAgentAiClient('create_skill', { name: 'bad_skill' });
    const { mock: baseMock } = createMockSecureYeoman({ aiClient });
    const mock = withExecutorManagers(baseMock, {
      taskStorage: mockTaskStorage,
      soulManagerExtras: {
        createSkill: vi.fn().mockRejectedValue(new Error('name conflict')),
      },
    });
    registerChatRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chat',
      payload: { message: 'create a skill' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.creationEvents ?? []).toHaveLength(0);
    expect(mockTaskStorage.storeTask).not.toHaveBeenCalled();
  });

  it('emits sparkle but skips storeTask when taskStorage is unavailable', async () => {
    const mockSkill = { id: 'sk-2', name: 'No Storage Skill' };
    const aiClient = makeAgentAiClient('create_skill', {
      name: 'no_storage_skill',
      description: '',
      instructions: '',
    });
    const { mock: baseMock } = createMockSecureYeoman({ aiClient });
    // taskStorage: null (unavailable)
    const mock = withExecutorManagers(baseMock, {
      taskStorage: null,
      soulManagerExtras: { createSkill: vi.fn().mockResolvedValue(mockSkill) },
    });
    registerChatRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chat',
      payload: { message: 'create skill' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    // Sparkle still emitted
    expect(body.creationEvents).toHaveLength(1);
    // No storeTask — taskStorage was null
    // (no mock to assert on; test passes if no error thrown)
  });
});

// ── Additional branch coverage ─────────────────────────────────────────────────

describe('Chat Routes — additional branch coverage', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(() => {
    app = Fastify();
  });

  it('POST /api/v1/chat passes modelFallbacks (including unknown provider) to aiClient', async () => {
    const personalityWithFallbacks = {
      id: 'p-1',
      name: 'Test',
      defaultModel: null,
      modelFallbacks: [
        { provider: 'openai', model: 'gpt-4o' },
        { provider: 'ollama', model: 'llama3' }, // not in PROVIDER_KEY_ENV → apiKeyEnv = ''
      ],
    };
    const mockSoulManager = {
      composeSoulPrompt: vi.fn().mockReturnValue('System.'),
      getActiveTools: vi.fn().mockReturnValue([]),
      getPersonality: vi.fn().mockReturnValue(null),
      getActivePersonality: vi.fn().mockReturnValue(personalityWithFallbacks),
    };
    const { mock, mockAiClient } = createMockSecureYeoman({ soulManager: mockSoulManager });
    registerChatRoutes(app, { secureYeoman: mock });

    await app.inject({ method: 'POST', url: '/api/v1/chat', payload: { message: 'hello' } });

    expect(mockAiClient.chat).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.arrayContaining([
        expect.objectContaining({
          provider: 'openai',
          model: 'gpt-4o',
          apiKeyEnv: 'OPENAI_API_KEY',
        }),
        expect.objectContaining({ provider: 'ollama', model: 'llama3', apiKeyEnv: '' }),
      ])
    );
  });

  it('POST /api/v1/chat filters out history items with non-string content', async () => {
    const { mock, mockAiClient } = createMockSecureYeoman();
    registerChatRoutes(app, { secureYeoman: mock });

    await app.inject({
      method: 'POST',
      url: '/api/v1/chat',
      payload: {
        message: 'Hello',
        history: [
          { role: 'user', content: null as unknown as string },
          { role: 'user', content: 'Valid message' },
        ],
      },
    });

    const chatCall = mockAiClient.chat.mock.calls[0][0];
    // system + 1 valid history msg + new user = 3 (null-content entry filtered)
    expect(chatCall.messages).toHaveLength(3);
    expect(chatCall.messages[1].content).toBe('Valid message');
  });

  it('POST /api/v1/chat uses getPersonality result when personalityId provided and found', async () => {
    const specificPersonality = {
      id: 'p-specific',
      name: 'Specific',
      defaultModel: null,
      modelFallbacks: [],
    };
    const mockSoulManager = {
      composeSoulPrompt: vi.fn().mockReturnValue('System.'),
      getActiveTools: vi.fn().mockReturnValue([]),
      getPersonality: vi.fn().mockReturnValue(specificPersonality),
      getActivePersonality: vi.fn().mockReturnValue(null),
    };
    const { mock } = createMockSecureYeoman({ soulManager: mockSoulManager });
    registerChatRoutes(app, { secureYeoman: mock });

    await app.inject({
      method: 'POST',
      url: '/api/v1/chat',
      payload: { message: 'hello', personalityId: 'p-specific' },
    });

    expect(mockSoulManager.getPersonality).toHaveBeenCalledWith('p-specific');
    // getActivePersonality not called — getPersonality returned a value (no ?? fallback)
    expect(mockSoulManager.getActivePersonality).not.toHaveBeenCalled();
  });
});
