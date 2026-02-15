/**
 * Conversation Storage — PostgreSQL-backed persistence for chat conversations.
 *
 * Uses PgBaseStorage base class with shared connection pool.
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import { uuidv7 } from '../utils/crypto.js';

// ── Row Types ────────────────────────────────────────────────

interface ConversationRow {
  id: string;
  title: string;
  personality_id: string | null;
  message_count: number;
  created_at: number;
  updated_at: number;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  model: string | null;
  provider: string | null;
  tokens_used: number | null;
  attachments_json: unknown;
  brain_context_json: unknown | null;
  created_at: number;
}

// ── Domain Types ─────────────────────────────────────────────

export interface Conversation {
  id: string;
  title: string;
  personalityId: string | null;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface BrainContextMeta {
  memoriesUsed: number;
  knowledgeUsed: number;
  contextSnippets: string[];
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  model: string | null;
  provider: string | null;
  tokensUsed: number | null;
  attachments: { type: 'image'; data: string; mimeType: string }[];
  brainContext: BrainContextMeta | null;
  createdAt: number;
}

// ── Helpers ──────────────────────────────────────────────────

function safeJsonParse<T>(json: unknown, fallback: T): T {
  if (json === null || json === undefined) return fallback;
  if (typeof json === 'object') return json as T;
  try {
    return JSON.parse(json as string) as T;
  } catch {
    return fallback;
  }
}

function rowToConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    title: row.title,
    personalityId: row.personality_id,
    messageCount: row.message_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToMessage(row: MessageRow): ConversationMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role as 'user' | 'assistant',
    content: row.content,
    model: row.model,
    provider: row.provider,
    tokensUsed: row.tokens_used,
    attachments: safeJsonParse(row.attachments_json, []),
    brainContext: row.brain_context_json ? safeJsonParse<BrainContextMeta | null>(row.brain_context_json, null) : null,
    createdAt: row.created_at,
  };
}

// ── ConversationStorage ──────────────────────────────────────

export class ConversationStorage extends PgBaseStorage {
  constructor() {
    super();
  }

  // ── Conversations ──────────────────────────────────────────

  async createConversation(data: { title: string; personalityId?: string | null }): Promise<Conversation> {
    const now = Date.now();
    const id = uuidv7();

    await this.execute(
      `INSERT INTO chat.conversations (id, title, personality_id, message_count, created_at, updated_at)
       VALUES ($1, $2, $3, 0, $4, $5)`,
      [id, data.title, data.personalityId ?? null, now, now],
    );

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return (await this.getConversation(id))!;
  }

  async getConversation(id: string): Promise<Conversation | null> {
    const row = await this.queryOne<ConversationRow>(
      'SELECT * FROM chat.conversations WHERE id = $1',
      [id],
    );
    return row ? rowToConversation(row) : null;
  }

  async listConversations(opts: { limit?: number; offset?: number } = {}): Promise<{
    conversations: Conversation[];
    total: number;
  }> {
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;

    const totalRow = await this.queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM chat.conversations',
    );

    const rows = await this.queryMany<ConversationRow>(
      'SELECT * FROM chat.conversations ORDER BY updated_at DESC LIMIT $1 OFFSET $2',
      [limit, offset],
    );

    return {
      conversations: rows.map(rowToConversation),
      total: Number(totalRow?.count ?? 0),
    };
  }

  async updateConversation(id: string, data: { title?: string }): Promise<Conversation> {
    const existing = await this.getConversation(id);
    if (!existing) throw new Error(`Conversation not found: ${id}`);

    const now = Date.now();
    await this.execute(
      'UPDATE chat.conversations SET title = $1, updated_at = $2 WHERE id = $3',
      [data.title ?? existing.title, now, id],
    );

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return (await this.getConversation(id))!;
  }

  async deleteConversation(id: string): Promise<boolean> {
    const changes = await this.execute(
      'DELETE FROM chat.conversations WHERE id = $1',
      [id],
    );
    return changes > 0;
  }

  // ── Messages ───────────────────────────────────────────────

  async addMessage(data: {
    conversationId: string;
    role: 'user' | 'assistant';
    content: string;
    model?: string | null;
    provider?: string | null;
    tokensUsed?: number | null;
    attachments?: { type: 'image'; data: string; mimeType: string }[];
    brainContext?: BrainContextMeta | null;
  }): Promise<ConversationMessage> {
    const now = Date.now();
    const id = uuidv7();

    await this.withTransaction(async (client) => {
      await client.query(
        `INSERT INTO chat.messages (id, conversation_id, role, content, model, provider, tokens_used, attachments_json, brain_context_json, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          id,
          data.conversationId,
          data.role,
          data.content,
          data.model ?? null,
          data.provider ?? null,
          data.tokensUsed ?? null,
          JSON.stringify(data.attachments ?? []),
          data.brainContext ? JSON.stringify(data.brainContext) : null,
          now,
        ],
      );

      await client.query(
        'UPDATE chat.conversations SET message_count = message_count + 1, updated_at = $1 WHERE id = $2',
        [now, data.conversationId],
      );
    });

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return (await this.getMessage(id))!;
  }

  async getMessage(id: string): Promise<ConversationMessage | null> {
    const row = await this.queryOne<MessageRow>(
      'SELECT * FROM chat.messages WHERE id = $1',
      [id],
    );
    return row ? rowToMessage(row) : null;
  }

  async getMessages(conversationId: string, opts: { limit?: number; offset?: number } = {}): Promise<ConversationMessage[]> {
    const limit = opts.limit ?? 1000;
    const offset = opts.offset ?? 0;

    const rows = await this.queryMany<MessageRow>(
      'SELECT * FROM chat.messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT $2 OFFSET $3',
      [conversationId, limit, offset],
    );

    return rows.map(rowToMessage);
  }

  // ── Cleanup ────────────────────────────────────────────────

  override close(): void {
    // no-op — pool lifecycle is managed globally
  }
}
