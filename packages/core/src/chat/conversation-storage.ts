/**
 * Conversation Storage — PostgreSQL-backed persistence for chat conversations.
 *
 * Uses PgBaseStorage base class with shared connection pool.
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import { uuidv7 } from '../utils/crypto.js';
import type { BranchTreeNode, ReplayJob, ReplayResult } from '@secureyeoman/shared';

// ── Row Types ────────────────────────────────────────────────

interface ConversationRow {
  id: string;
  title: string;
  personality_id: string | null;
  message_count: number;
  parent_conversation_id: string | null;
  fork_message_index: number | null;
  branch_label: string | null;
  created_at: number;
  updated_at: number;
}

interface ReplayJobRow {
  id: string;
  status: string;
  source_conversation_ids: string[];
  replay_model: string;
  replay_provider: string;
  replay_personality_id: string | null;
  total_conversations: number;
  completed_conversations: number;
  failed_conversations: number;
  error_message: string | null;
  created_at: number;
  updated_at: number;
}

interface ReplayResultRow {
  id: string;
  replay_job_id: string;
  source_conversation_id: string;
  replay_conversation_id: string;
  source_model: string | null;
  replay_model: string;
  source_quality_score: number | null;
  replay_quality_score: number | null;
  pairwise_winner: string | null;
  pairwise_reason: string | null;
  created_at: number;
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
  creation_events_json: unknown | null;
  thinking_content: string | null;
  tool_calls_json: unknown | null;
  injection_score: number | null;
  created_at: number;
}

// ── Domain Types ─────────────────────────────────────────────

export interface Conversation {
  id: string;
  title: string;
  personalityId: string | null;
  messageCount: number;
  parentConversationId: string | null;
  forkMessageIndex: number | null;
  branchLabel: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface BrainContextMeta {
  memoriesUsed: number;
  knowledgeUsed: number;
  contextSnippets: string[];
}

export interface ToolCallRecord {
  toolName: string;
  label: string;
  serverName?: string;
  isMcp: boolean;
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
  creationEvents: { tool: string; label: string; name: string; id?: string }[] | null;
  thinkingContent: string | null;
  toolCalls: ToolCallRecord[] | null;
  /** Injection risk score [0, 1] from InputValidator. Null for assistant messages. */
  injectionScore: number | null;
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
    parentConversationId: row.parent_conversation_id ?? null,
    forkMessageIndex: row.fork_message_index ?? null,
    branchLabel: row.branch_label ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToReplayJob(row: ReplayJobRow): ReplayJob {
  return {
    id: row.id,
    status: row.status as ReplayJob['status'],
    sourceConversationIds: row.source_conversation_ids,
    replayModel: row.replay_model,
    replayProvider: row.replay_provider,
    replayPersonalityId: row.replay_personality_id,
    totalConversations: row.total_conversations,
    completedConversations: row.completed_conversations,
    failedConversations: row.failed_conversations,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToReplayResult(row: ReplayResultRow): ReplayResult {
  return {
    id: row.id,
    replayJobId: row.replay_job_id,
    sourceConversationId: row.source_conversation_id,
    replayConversationId: row.replay_conversation_id,
    sourceModel: row.source_model,
    replayModel: row.replay_model,
    sourceQualityScore: row.source_quality_score,
    replayQualityScore: row.replay_quality_score,
    pairwiseWinner: row.pairwise_winner as ReplayResult['pairwiseWinner'],
    pairwiseReason: row.pairwise_reason,
    createdAt: row.created_at,
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
    brainContext: row.brain_context_json
      ? safeJsonParse<BrainContextMeta | null>(row.brain_context_json, null)
      : null,
    creationEvents: row.creation_events_json
      ? safeJsonParse<{ tool: string; label: string; name: string; id?: string }[] | null>(
          row.creation_events_json,
          null
        )
      : null,
    thinkingContent: row.thinking_content ?? null,
    toolCalls: row.tool_calls_json
      ? safeJsonParse<ToolCallRecord[] | null>(row.tool_calls_json, null)
      : null,
    injectionScore: row.injection_score ?? null,
    createdAt: row.created_at,
  };
}

// ── ConversationStorage ──────────────────────────────────────

export class ConversationStorage extends PgBaseStorage {
  constructor() {
    super();
  }

  // ── Conversations ──────────────────────────────────────────

  async createConversation(data: {
    title: string;
    personalityId?: string | null;
    parentConversationId?: string | null;
    forkMessageIndex?: number | null;
    branchLabel?: string | null;
  }): Promise<Conversation> {
    const now = Date.now();
    const id = uuidv7();

    await this.execute(
      `INSERT INTO chat.conversations (id, title, personality_id, message_count, parent_conversation_id, fork_message_index, branch_label, created_at, updated_at)
       VALUES ($1, $2, $3, 0, $4, $5, $6, $7, $8)`,
      [
        id,
        data.title,
        data.personalityId ?? null,
        data.parentConversationId ?? null,
        data.forkMessageIndex ?? null,
        data.branchLabel ?? null,
        now,
        now,
      ]
    );

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return (await this.getConversation(id))!;
  }

  async getConversation(id: string): Promise<Conversation | null> {
    const row = await this.queryOne<ConversationRow>(
      'SELECT * FROM chat.conversations WHERE id = $1',
      [id]
    );
    return row ? rowToConversation(row) : null;
  }

  async listConversations(
    opts: {
      limit?: number;
      offset?: number;
      personalityId?: string;
    } = {}
  ): Promise<{
    conversations: Conversation[];
    total: number;
  }> {
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;

    if (opts.personalityId) {
      const totalRow = await this.queryOne<{ count: string }>(
        'SELECT COUNT(*) as count FROM chat.conversations WHERE personality_id = $1',
        [opts.personalityId]
      );
      const rows = await this.queryMany<ConversationRow>(
        'SELECT * FROM chat.conversations WHERE personality_id = $1 ORDER BY updated_at DESC LIMIT $2 OFFSET $3',
        [opts.personalityId, limit, offset]
      );
      return {
        conversations: rows.map(rowToConversation),
        total: Number(totalRow?.count ?? 0),
      };
    }

    const totalRow = await this.queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM chat.conversations'
    );
    const rows = await this.queryMany<ConversationRow>(
      'SELECT * FROM chat.conversations ORDER BY updated_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
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
    await this.execute('UPDATE chat.conversations SET title = $1, updated_at = $2 WHERE id = $3', [
      data.title ?? existing.title,
      now,
      id,
    ]);

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return (await this.getConversation(id))!;
  }

  async deleteConversation(id: string): Promise<boolean> {
    const changes = await this.execute('DELETE FROM chat.conversations WHERE id = $1', [id]);
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
    creationEvents?: { tool: string; label: string; name: string; id?: string }[] | null;
    thinkingContent?: string | null;
    toolCalls?: ToolCallRecord[] | null;
    injectionScore?: number | null;
  }): Promise<ConversationMessage> {
    const now = Date.now();
    const id = uuidv7();

    await this.withTransaction(async (client) => {
      await client.query(
        `INSERT INTO chat.messages (id, conversation_id, role, content, model, provider, tokens_used, attachments_json, brain_context_json, creation_events_json, thinking_content, tool_calls_json, injection_score, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
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
          data.creationEvents && data.creationEvents.length > 0
            ? JSON.stringify(data.creationEvents)
            : null,
          data.thinkingContent ?? null,
          data.toolCalls && data.toolCalls.length > 0 ? JSON.stringify(data.toolCalls) : null,
          data.injectionScore ?? null,
          now,
        ]
      );

      await client.query(
        'UPDATE chat.conversations SET message_count = message_count + 1, updated_at = $1 WHERE id = $2',
        [now, data.conversationId]
      );
    });

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return (await this.getMessage(id))!;
  }

  async getMessage(id: string): Promise<ConversationMessage | null> {
    const row = await this.queryOne<MessageRow>('SELECT * FROM chat.messages WHERE id = $1', [id]);
    return row ? rowToMessage(row) : null;
  }

  async getMessages(
    conversationId: string,
    opts: { limit?: number; offset?: number } = {}
  ): Promise<ConversationMessage[]> {
    const limit = opts.limit ?? 1000;
    const offset = opts.offset ?? 0;

    const rows = await this.queryMany<MessageRow>(
      'SELECT * FROM chat.messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT $2 OFFSET $3',
      [conversationId, limit, offset]
    );

    return rows.map(rowToMessage);
  }

  // ── Branching ─────────────────────────────────────────────

  async branchFromMessage(
    sourceId: string,
    messageIndex: number,
    opts?: { title?: string; branchLabel?: string }
  ): Promise<Conversation> {
    const source = await this.getConversation(sourceId);
    if (!source) throw new Error(`Source conversation not found: ${sourceId}`);

    const messages = await this.getMessages(sourceId);
    if (messageIndex < 0 || messageIndex >= messages.length) {
      throw new Error(`Invalid message index: ${messageIndex}`);
    }

    return await this.withTransaction(async (client) => {
      const now = Date.now();
      const newId = uuidv7();
      const title = opts?.title ?? `Branch of: ${source.title}`;

      await client.query(
        `INSERT INTO chat.conversations (id, title, personality_id, message_count, parent_conversation_id, fork_message_index, branch_label, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          newId,
          title,
          source.personalityId,
          messageIndex + 1,
          sourceId,
          messageIndex,
          opts?.branchLabel ?? null,
          now,
          now,
        ]
      );

      // Copy messages[0..messageIndex] into the new conversation
      const toCopy = messages.slice(0, messageIndex + 1);
      for (const msg of toCopy) {
        const msgId = uuidv7();
        await client.query(
          `INSERT INTO chat.messages (id, conversation_id, role, content, model, provider, tokens_used, attachments_json, brain_context_json, creation_events_json, thinking_content, tool_calls_json, injection_score, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [
            msgId,
            newId,
            msg.role,
            msg.content,
            msg.model,
            msg.provider,
            msg.tokensUsed,
            JSON.stringify(msg.attachments),
            msg.brainContext ? JSON.stringify(msg.brainContext) : null,
            msg.creationEvents ? JSON.stringify(msg.creationEvents) : null,
            msg.thinkingContent,
            msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
            msg.injectionScore,
            msg.createdAt,
          ]
        );
      }

      const row = await client.query<ConversationRow>(
        'SELECT * FROM chat.conversations WHERE id = $1',
        [newId]
      );
      return rowToConversation(row.rows[0]);
    });
  }

  async getBranchTree(rootId: string): Promise<BranchTreeNode> {
    const rows = await this.queryMany<
      ConversationRow & { quality_score: number | null }
    >(
      `WITH RECURSIVE tree AS (
        SELECT c.*, cq.quality_score
        FROM chat.conversations c
        LEFT JOIN training.conversation_quality cq ON cq.conversation_id = c.id
        WHERE c.id = $1
        UNION ALL
        SELECT c2.*, cq2.quality_score
        FROM chat.conversations c2
        LEFT JOIN training.conversation_quality cq2 ON cq2.conversation_id = c2.id
        JOIN tree t ON c2.parent_conversation_id = t.id
      )
      SELECT * FROM tree`,
      [rootId]
    );

    if (rows.length === 0) {
      throw new Error(`Conversation not found: ${rootId}`);
    }

    // Build tree in memory
    const nodeMap = new Map<string, BranchTreeNode>();
    for (const r of rows) {
      // Determine model from most recent assistant message — we'll use the conversation data we have
      nodeMap.set(r.id, {
        conversationId: r.id,
        title: r.title,
        forkMessageIndex: r.fork_message_index,
        branchLabel: r.branch_label,
        model: null, // Will be populated below if needed
        qualityScore: r.quality_score ?? null,
        messageCount: r.message_count,
        children: [],
      });
    }

    for (const r of rows) {
      if (r.parent_conversation_id && nodeMap.has(r.parent_conversation_id)) {
        nodeMap.get(r.parent_conversation_id)!.children.push(nodeMap.get(r.id)!);
      }
    }

    return nodeMap.get(rootId)!;
  }

  async getChildBranches(id: string): Promise<Conversation[]> {
    const rows = await this.queryMany<ConversationRow>(
      'SELECT * FROM chat.conversations WHERE parent_conversation_id = $1 ORDER BY created_at ASC',
      [id]
    );
    return rows.map(rowToConversation);
  }

  async getRootConversation(id: string): Promise<Conversation> {
    const row = await this.queryOne<ConversationRow>(
      `WITH RECURSIVE chain AS (
        SELECT * FROM chat.conversations WHERE id = $1
        UNION ALL
        SELECT c.* FROM chat.conversations c
        JOIN chain ch ON ch.parent_conversation_id = c.id
      )
      SELECT * FROM chain WHERE parent_conversation_id IS NULL LIMIT 1`,
      [id]
    );
    if (!row) throw new Error(`Conversation not found: ${id}`);
    return rowToConversation(row);
  }

  // ── Replay Storage ──────────────────────────────────────────

  async createReplayJob(data: {
    sourceConversationIds: string[];
    replayModel: string;
    replayProvider: string;
    replayPersonalityId?: string | null;
  }): Promise<ReplayJob> {
    const now = Date.now();
    const id = uuidv7();

    await this.execute(
      `INSERT INTO chat.replay_jobs (id, status, source_conversation_ids, replay_model, replay_provider, replay_personality_id, total_conversations, completed_conversations, failed_conversations, created_at, updated_at)
       VALUES ($1, 'pending', $2, $3, $4, $5, $6, 0, 0, $7, $8)`,
      [
        id,
        data.sourceConversationIds,
        data.replayModel,
        data.replayProvider,
        data.replayPersonalityId ?? null,
        data.sourceConversationIds.length,
        now,
        now,
      ]
    );

    const row = await this.queryOne<ReplayJobRow>(
      'SELECT * FROM chat.replay_jobs WHERE id = $1',
      [id]
    );
    return rowToReplayJob(row!);
  }

  async getReplayJob(id: string): Promise<ReplayJob | null> {
    const row = await this.queryOne<ReplayJobRow>(
      'SELECT * FROM chat.replay_jobs WHERE id = $1',
      [id]
    );
    return row ? rowToReplayJob(row) : null;
  }

  async updateReplayJob(
    id: string,
    data: Partial<{
      status: string;
      completedConversations: number;
      failedConversations: number;
      errorMessage: string | null;
    }>
  ): Promise<void> {
    const sets: string[] = ['updated_at = $2'];
    const values: unknown[] = [id, Date.now()];
    let idx = 3;

    if (data.status !== undefined) {
      sets.push(`status = $${idx++}`);
      values.push(data.status);
    }
    if (data.completedConversations !== undefined) {
      sets.push(`completed_conversations = $${idx++}`);
      values.push(data.completedConversations);
    }
    if (data.failedConversations !== undefined) {
      sets.push(`failed_conversations = $${idx++}`);
      values.push(data.failedConversations);
    }
    if (data.errorMessage !== undefined) {
      sets.push(`error_message = $${idx++}`);
      values.push(data.errorMessage);
    }

    await this.execute(
      `UPDATE chat.replay_jobs SET ${sets.join(', ')} WHERE id = $1`,
      values
    );
  }

  async listReplayJobs(): Promise<ReplayJob[]> {
    const rows = await this.queryMany<ReplayJobRow>(
      'SELECT * FROM chat.replay_jobs ORDER BY created_at DESC'
    );
    return rows.map(rowToReplayJob);
  }

  async createReplayResult(data: {
    replayJobId: string;
    sourceConversationId: string;
    replayConversationId: string;
    sourceModel?: string | null;
    replayModel: string;
    sourceQualityScore?: number | null;
    replayQualityScore?: number | null;
    pairwiseWinner?: string | null;
    pairwiseReason?: string | null;
  }): Promise<ReplayResult> {
    const now = Date.now();
    const id = uuidv7();

    await this.execute(
      `INSERT INTO chat.replay_results (id, replay_job_id, source_conversation_id, replay_conversation_id, source_model, replay_model, source_quality_score, replay_quality_score, pairwise_winner, pairwise_reason, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        id,
        data.replayJobId,
        data.sourceConversationId,
        data.replayConversationId,
        data.sourceModel ?? null,
        data.replayModel,
        data.sourceQualityScore ?? null,
        data.replayQualityScore ?? null,
        data.pairwiseWinner ?? null,
        data.pairwiseReason ?? null,
        now,
      ]
    );

    const row = await this.queryOne<ReplayResultRow>(
      'SELECT * FROM chat.replay_results WHERE id = $1',
      [id]
    );
    return rowToReplayResult(row!);
  }

  async getReplayResults(jobId: string): Promise<ReplayResult[]> {
    const rows = await this.queryMany<ReplayResultRow>(
      'SELECT * FROM chat.replay_results WHERE replay_job_id = $1 ORDER BY created_at ASC',
      [jobId]
    );
    return rows.map(rowToReplayResult);
  }

  // ── Cleanup ────────────────────────────────────────────────

  override close(): void {
    // no-op — pool lifecycle is managed globally
  }
}
