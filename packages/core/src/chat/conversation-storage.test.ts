import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { ConversationStorage } from './conversation-storage.js';
import { setupTestDb, teardownTestDb, truncateAllTables } from '../test-setup.js';

describe('ConversationStorage', () => {
  let storage: ConversationStorage;

  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await truncateAllTables();
    storage = new ConversationStorage();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  // ── Conversation CRUD ──────────────────────────────────────────

  it('creates and retrieves a conversation', async () => {
    const conv = await storage.createConversation({ title: 'Test Chat' });
    expect(conv.id).toBeTruthy();
    expect(conv.title).toBe('Test Chat');
    expect(conv.messageCount).toBe(0);
    expect(conv.personalityId).toBeNull();

    const fetched = await storage.getConversation(conv.id);
    expect(fetched).toEqual(conv);
  });

  it('creates a conversation with personalityId', async () => {
    const conv = await storage.createConversation({ title: 'With personality', personalityId: 'p-1' });
    expect(conv.personalityId).toBe('p-1');
  });

  it('lists conversations ordered by updated_at DESC', async () => {
    const c1 = await storage.createConversation({ title: 'First' });
    const c2 = await storage.createConversation({ title: 'Second' });

    // Add a message to c1 to give it a later updated_at
    await storage.addMessage({ conversationId: c1.id, role: 'user', content: 'bump' });

    const { conversations, total } = await storage.listConversations();
    expect(total).toBe(2);
    // c1 was updated last (via addMessage), so it should come first
    expect(conversations[0].id).toBe(c1.id);
    expect(conversations[1].id).toBe(c2.id);
  });

  it('paginates conversations', async () => {
    for (let i = 0; i < 5; i++) {
      await storage.createConversation({ title: `Chat ${i}` });
    }

    const page1 = await storage.listConversations({ limit: 2, offset: 0 });
    expect(page1.conversations).toHaveLength(2);
    expect(page1.total).toBe(5);

    const page2 = await storage.listConversations({ limit: 2, offset: 2 });
    expect(page2.conversations).toHaveLength(2);
  });

  it('updates a conversation title', async () => {
    const conv = await storage.createConversation({ title: 'Old Title' });
    const updated = await storage.updateConversation(conv.id, { title: 'New Title' });
    expect(updated.title).toBe('New Title');
    expect(updated.updatedAt).toBeGreaterThanOrEqual(conv.updatedAt);
  });

  it('throws when updating non-existent conversation', async () => {
    await expect(storage.updateConversation('nonexistent', { title: 'X' }))
      .rejects.toThrow('Conversation not found');
  });

  it('deletes a conversation', async () => {
    const conv = await storage.createConversation({ title: 'To Delete' });
    expect(await storage.deleteConversation(conv.id)).toBe(true);
    expect(await storage.getConversation(conv.id)).toBeNull();
  });

  it('returns false when deleting non-existent conversation', async () => {
    expect(await storage.deleteConversation('nonexistent')).toBe(false);
  });

  // ── Message CRUD ───────────────────────────────────────────────

  it('adds and retrieves messages', async () => {
    const conv = await storage.createConversation({ title: 'Chat' });

    const userMsg = await storage.addMessage({
      conversationId: conv.id,
      role: 'user',
      content: 'Hello!',
    });
    expect(userMsg.role).toBe('user');
    expect(userMsg.content).toBe('Hello!');
    expect(userMsg.conversationId).toBe(conv.id);

    const assistantMsg = await storage.addMessage({
      conversationId: conv.id,
      role: 'assistant',
      content: 'Hi there!',
      model: 'claude-sonnet',
      provider: 'anthropic',
      tokensUsed: 150,
    });
    expect(assistantMsg.model).toBe('claude-sonnet');
    expect(assistantMsg.tokensUsed).toBe(150);

    const messages = await storage.getMessages(conv.id);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('user');
    expect(messages[1].role).toBe('assistant');
  });

  it('increments messageCount when adding messages', async () => {
    const conv = await storage.createConversation({ title: 'Chat' });
    await storage.addMessage({ conversationId: conv.id, role: 'user', content: 'Hi' });
    await storage.addMessage({ conversationId: conv.id, role: 'assistant', content: 'Hello' });

    const updated = await storage.getConversation(conv.id);
    expect(updated?.messageCount).toBe(2);
  });

  it('cascades message deletion when conversation is deleted', async () => {
    const conv = await storage.createConversation({ title: 'Chat' });
    const msg = await storage.addMessage({ conversationId: conv.id, role: 'user', content: 'Hi' });
    await storage.deleteConversation(conv.id);
    expect(await storage.getMessage(msg.id)).toBeNull();
  });

  // ── Brain Context ──────────────────────────────────────────────

  it('persists brainContext on messages', async () => {
    const conv = await storage.createConversation({ title: 'Brain Test' });

    const brainContext = {
      memoriesUsed: 2,
      knowledgeUsed: 1,
      contextSnippets: ['[episodic] likes TypeScript', '[coding] TS is typed JS'],
    };

    const msg = await storage.addMessage({
      conversationId: conv.id,
      role: 'assistant',
      content: 'Response with brain context',
      brainContext,
    });

    expect(msg.brainContext).toEqual(brainContext);

    // Verify it roundtrips through getMessages
    const messages = await storage.getMessages(conv.id);
    expect(messages[0].brainContext).toEqual(brainContext);
  });

  it('returns null brainContext when not provided', async () => {
    const conv = await storage.createConversation({ title: 'No Brain' });

    const msg = await storage.addMessage({
      conversationId: conv.id,
      role: 'user',
      content: 'Hello',
    });

    expect(msg.brainContext).toBeNull();
  });
});
