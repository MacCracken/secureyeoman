/**
 * Brain Storage — PostgreSQL-backed storage for memories, knowledge, and skills.
 *
 * Extends PgBaseStorage for shared pool access, async methods, and transactions.
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import type {
  Memory,
  MemoryCreate,
  MemoryQuery,
  MemoryType,
  KnowledgeEntry,
  KnowledgeCreate,
  KnowledgeQuery,
  SkillFilter,
  BrainStats,
} from './types.js';
import type { Skill, SkillCreate, SkillUpdate } from '@friday/shared';
import { uuidv7 } from '../utils/crypto.js';

// ── Row Types ────────────────────────────────────────────────

interface MemoryRow {
  id: string;
  personality_id: string | null;
  type: string;
  content: string;
  source: string;
  context: Record<string, string>;
  importance: number;
  access_count: number;
  last_accessed_at: number | null;
  expires_at: number | null;
  created_at: number;
  updated_at: number;
}

interface KnowledgeRow {
  id: string;
  topic: string;
  content: string;
  source: string;
  confidence: number;
  supersedes: string | null;
  created_at: number;
  updated_at: number;
}

interface SkillRow {
  id: string;
  name: string;
  description: string;
  instructions: string;
  tools: unknown[];
  trigger_patterns: string[];
  enabled: boolean;
  source: string;
  status: string;
  usage_count: number;
  last_used_at: number | null;
  created_at: number;
  updated_at: number;
}

// ── Helpers ──────────────────────────────────────────────────

function rowToMemory(row: MemoryRow): Memory {
  return {
    id: row.id,
    type: row.type as MemoryType,
    content: row.content,
    source: row.source,
    context: row.context ?? {},
    importance: row.importance,
    accessCount: row.access_count,
    lastAccessedAt: row.last_accessed_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToKnowledge(row: KnowledgeRow): KnowledgeEntry {
  return {
    id: row.id,
    topic: row.topic,
    content: row.content,
    source: row.source,
    confidence: row.confidence,
    supersedes: row.supersedes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToSkill(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    instructions: row.instructions,
    tools: (row.tools ?? []) as Skill['tools'],
    triggerPatterns: row.trigger_patterns ?? [],
    // ADR 021: Skill Actions
    actions: [],
    // ADR 022: Skill Triggers
    triggers: [],
    // Dependencies
    dependencies: [],
    provides: [],
    // Security
    requireApproval: false,
    allowedPermissions: [],
    enabled: row.enabled,
    source: row.source as Skill['source'],
    status: row.status as Skill['status'],
    usageCount: row.usage_count,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── BrainStorage ─────────────────────────────────────────────

export class BrainStorage extends PgBaseStorage {
  // ── Memories ─────────────────────────────────────────────────

  async createMemory(data: MemoryCreate, personalityId?: string): Promise<Memory> {
    const now = Date.now();
    const id = uuidv7();

    await this.query(
      `INSERT INTO brain.memories (id, personality_id, type, content, source, context, importance, access_count, last_accessed_at, expires_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, 0, NULL, $8, $9, $10)`,
      [
        id,
        personalityId ?? null,
        data.type,
        data.content,
        data.source,
        JSON.stringify(data.context ?? {}),
        data.importance ?? 0.5,
        data.expiresAt ?? null,
        now,
        now,
      ]
    );

    const result = await this.getMemory(id);
    if (!result) throw new Error(`Failed to retrieve memory after insert: ${id}`);
    return result;
  }

  async getMemory(id: string): Promise<Memory | null> {
    const row = await this.queryOne<MemoryRow>('SELECT * FROM brain.memories WHERE id = $1', [id]);
    return row ? rowToMemory(row) : null;
  }

  async deleteMemory(id: string): Promise<boolean> {
    const count = await this.execute('DELETE FROM brain.memories WHERE id = $1', [id]);
    return count > 0;
  }

  async queryMemories(query: MemoryQuery & { personalityId?: string } = {}): Promise<Memory[]> {
    let sql = 'SELECT * FROM brain.memories WHERE 1=1';
    const params: unknown[] = [];
    let idx = 1;

    if (query.personalityId) {
      sql += ` AND personality_id = $${idx++}`;
      params.push(query.personalityId);
    }
    if (query.type) {
      sql += ` AND type = $${idx++}`;
      params.push(query.type);
    }
    if (query.source) {
      sql += ` AND source = $${idx++}`;
      params.push(query.source);
    }
    if (query.minImportance !== undefined) {
      sql += ` AND importance >= $${idx++}`;
      params.push(query.minImportance);
    }
    if (query.search) {
      // Split into keywords (3+ chars) for better matching than full-string LIKE
      const keywords = query.search
        .split(/\s+/)
        .map((w) => w.replace(/[^a-zA-Z0-9]/g, ''))
        .filter((w) => w.length >= 3);
      if (keywords.length > 0) {
        const clauses = keywords.map((kw) => {
          params.push(`%${kw}%`);
          return `content ILIKE $${idx++}`;
        });
        sql += ` AND (${clauses.join(' OR ')})`;
      } else {
        sql += ` AND content ILIKE $${idx++}`;
        params.push(`%${query.search}%`);
      }
    }
    if (query.context) {
      for (const [key, value] of Object.entries(query.context)) {
        if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
          throw new Error(`Invalid context key: ${key}`);
        }
        sql += ` AND context::jsonb->>$${idx++} = $${idx++}`;
        params.push(key, value);
      }
    }

    const sortDir = query.sortDirection === 'asc' ? 'ASC' : 'DESC';
    sql += ` ORDER BY importance ${sortDir}, updated_at ${sortDir}`;

    if (query.limit) {
      sql += ` LIMIT $${idx++}`;
      params.push(query.limit);
    }

    if (query.offset) {
      sql += ` OFFSET $${idx++}`;
      params.push(query.offset);
    }

    const rows = await this.queryMany<MemoryRow>(sql, params);
    return rows.map(rowToMemory);
  }

  async touchMemory(id: string): Promise<void> {
    await this.execute(
      'UPDATE brain.memories SET access_count = access_count + 1, last_accessed_at = $1 WHERE id = $2',
      [Date.now(), id]
    );
  }

  async touchMemories(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const now = Date.now();
    await this.execute(
      `UPDATE brain.memories SET access_count = access_count + 1, last_accessed_at = $1 WHERE id = ANY($2::text[])`,
      [now, ids]
    );
  }

  async decayMemories(decayRate: number): Promise<number> {
    const now = Date.now();
    const oneDayMs = 86_400_000;

    // Reduce importance of memories not accessed in the last day
    const count = await this.execute(
      `UPDATE brain.memories SET importance = GREATEST(0, importance - $1), updated_at = $2
       WHERE (last_accessed_at IS NULL OR last_accessed_at < $3)
         AND importance > 0`,
      [decayRate, now, now - oneDayMs]
    );

    return count;
  }

  async pruneExpiredMemories(): Promise<string[]> {
    const now = Date.now();
    const rows = await this.queryMany<{ id: string }>(
      'DELETE FROM brain.memories WHERE expires_at IS NOT NULL AND expires_at < $1 RETURNING id',
      [now]
    );
    return rows.map((r) => r.id);
  }

  async pruneByImportanceFloor(floor: number): Promise<string[]> {
    const rows = await this.queryMany<{ id: string }>(
      'DELETE FROM brain.memories WHERE importance < $1 AND importance > 0 RETURNING id',
      [floor]
    );
    return rows.map((r) => r.id);
  }

  async getMemoryCount(): Promise<number> {
    const row = await this.queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM brain.memories'
    );
    return Number(row?.count ?? 0);
  }

  async getMemoryCountByType(): Promise<Record<string, number>> {
    const rows = await this.queryMany<{ type: string; count: string }>(
      'SELECT type, COUNT(*) as count FROM brain.memories GROUP BY type'
    );
    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.type] = Number(row.count);
    }
    return result;
  }

  // ── Knowledge ────────────────────────────────────────────────

  async createKnowledge(data: KnowledgeCreate): Promise<KnowledgeEntry> {
    const now = Date.now();
    const id = uuidv7();

    await this.query(
      `INSERT INTO brain.knowledge (id, topic, content, source, confidence, supersedes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NULL, $6, $7)`,
      [id, data.topic, data.content, data.source, data.confidence ?? 0.8, now, now]
    );

    const result = await this.getKnowledge(id);
    if (!result) throw new Error(`Failed to retrieve knowledge after insert: ${id}`);
    return result;
  }

  async getKnowledge(id: string): Promise<KnowledgeEntry | null> {
    const row = await this.queryOne<KnowledgeRow>('SELECT * FROM brain.knowledge WHERE id = $1', [
      id,
    ]);
    return row ? rowToKnowledge(row) : null;
  }

  async queryKnowledge(query: KnowledgeQuery = {}): Promise<KnowledgeEntry[]> {
    let sql = 'SELECT * FROM brain.knowledge WHERE 1=1';
    const params: unknown[] = [];
    let idx = 1;

    if (query.topic) {
      sql += ` AND topic = $${idx++}`;
      params.push(query.topic);
    }
    if (query.search) {
      const keywords = query.search
        .split(/\s+/)
        .map((w) => w.replace(/[^a-zA-Z0-9]/g, ''))
        .filter((w) => w.length >= 3);
      if (keywords.length > 0) {
        const clauses = keywords.map((kw) => {
          params.push(`%${kw}%`);
          return `(content ILIKE $${idx} OR topic ILIKE $${idx++})`;
        });
        sql += ` AND (${clauses.join(' OR ')})`;
      } else {
        params.push(`%${query.search}%`);
        sql += ` AND (content ILIKE $${idx} OR topic ILIKE $${idx++})`;
      }
    }
    if (query.minConfidence !== undefined) {
      sql += ` AND confidence >= $${idx++}`;
      params.push(query.minConfidence);
    }

    sql += ' ORDER BY confidence DESC, updated_at DESC';

    if (query.limit) {
      sql += ` LIMIT $${idx++}`;
      params.push(query.limit);
    }

    const rows = await this.queryMany<KnowledgeRow>(sql, params);
    return rows.map(rowToKnowledge);
  }

  async updateKnowledge(
    id: string,
    data: { content?: string; confidence?: number; supersedes?: string }
  ): Promise<KnowledgeEntry> {
    const existing = await this.getKnowledge(id);
    if (!existing) throw new Error(`Knowledge not found: ${id}`);

    const now = Date.now();
    await this.execute(
      `UPDATE brain.knowledge SET content = $1, confidence = $2, supersedes = $3, updated_at = $4 WHERE id = $5`,
      [
        data.content ?? existing.content,
        data.confidence ?? existing.confidence,
        data.supersedes ?? existing.supersedes,
        now,
        id,
      ]
    );

    const result = await this.getKnowledge(id);
    if (!result) throw new Error(`Failed to retrieve knowledge after update: ${id}`);
    return result;
  }

  async deleteKnowledge(id: string): Promise<boolean> {
    const count = await this.execute('DELETE FROM brain.knowledge WHERE id = $1', [id]);
    return count > 0;
  }

  async getKnowledgeCount(): Promise<number> {
    const row = await this.queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM brain.knowledge'
    );
    return Number(row?.count ?? 0);
  }

  // ── Skills ───────────────────────────────────────────────────

  async createSkill(data: SkillCreate): Promise<Skill> {
    const now = Date.now();
    const id = uuidv7();

    await this.query(
      `INSERT INTO brain.skills (id, name, description, instructions, tools, trigger_patterns, enabled, source, status, usage_count, last_used_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, 0, NULL, $10, $11)`,
      [
        id,
        data.name,
        data.description ?? '',
        data.instructions ?? '',
        JSON.stringify(data.tools ?? []),
        JSON.stringify(data.triggerPatterns ?? []),
        data.enabled,
        data.source ?? 'user',
        data.status ?? 'active',
        now,
        now,
      ]
    );

    const result = await this.getSkill(id);
    if (!result) throw new Error(`Failed to retrieve skill after insert: ${id}`);
    return result;
  }

  async getSkill(id: string): Promise<Skill | null> {
    const row = await this.queryOne<SkillRow>('SELECT * FROM brain.skills WHERE id = $1', [id]);
    return row ? rowToSkill(row) : null;
  }

  async updateSkill(id: string, data: SkillUpdate): Promise<Skill> {
    const existing = await this.getSkill(id);
    if (!existing) throw new Error(`Skill not found: ${id}`);

    const now = Date.now();
    await this.execute(
      `UPDATE brain.skills SET
         name = $1,
         description = $2,
         instructions = $3,
         tools = $4::jsonb,
         trigger_patterns = $5::jsonb,
         enabled = $6,
         source = $7,
         status = $8,
         updated_at = $9
       WHERE id = $10`,
      [
        data.name ?? existing.name,
        data.description ?? existing.description,
        data.instructions ?? existing.instructions,
        JSON.stringify(data.tools ?? existing.tools),
        JSON.stringify(data.triggerPatterns ?? existing.triggerPatterns),
        data.enabled !== undefined ? data.enabled : existing.enabled,
        data.source ?? existing.source,
        data.status ?? existing.status,
        now,
        id,
      ]
    );

    const result = await this.getSkill(id);
    if (!result) throw new Error(`Failed to retrieve skill after update: ${id}`);
    return result;
  }

  async deleteSkill(id: string): Promise<boolean> {
    const count = await this.execute('DELETE FROM brain.skills WHERE id = $1', [id]);
    return count > 0;
  }

  async listSkills(filter?: SkillFilter): Promise<Skill[]> {
    let sql = 'SELECT * FROM brain.skills WHERE 1=1';
    const params: unknown[] = [];
    let idx = 1;

    if (filter?.status) {
      sql += ` AND status = $${idx++}`;
      params.push(filter.status);
    }
    if (filter?.source) {
      sql += ` AND source = $${idx++}`;
      params.push(filter.source);
    }
    if (filter?.enabled !== undefined) {
      sql += ` AND enabled = $${idx++}`;
      params.push(filter.enabled);
    }

    sql += ' ORDER BY usage_count DESC, created_at DESC';

    const rows = await this.queryMany<SkillRow>(sql, params);
    return rows.map(rowToSkill);
  }

  async getEnabledSkills(): Promise<Skill[]> {
    const rows = await this.queryMany<SkillRow>(
      "SELECT * FROM brain.skills WHERE enabled = true AND status = 'active' ORDER BY usage_count DESC, created_at DESC"
    );
    return rows.map(rowToSkill);
  }

  async getPendingSkills(): Promise<Skill[]> {
    const rows = await this.queryMany<SkillRow>(
      "SELECT * FROM brain.skills WHERE status = 'pending_approval' ORDER BY created_at DESC"
    );
    return rows.map(rowToSkill);
  }

  async incrementUsage(skillId: string): Promise<void> {
    await this.execute(
      'UPDATE brain.skills SET usage_count = usage_count + 1, last_used_at = $1 WHERE id = $2',
      [Date.now(), skillId]
    );
  }

  async getSkillCount(): Promise<number> {
    const row = await this.queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM brain.skills'
    );
    return Number(row?.count ?? 0);
  }

  // ── Vector Similarity ───────────────────────────────────────────

  async queryMemoriesBySimilarity(
    embedding: number[],
    limit: number,
    threshold: number
  ): Promise<(Memory & { similarity: number })[]> {
    const vectorStr = `[${embedding.join(',')}]`;
    const rows = await this.queryMany<MemoryRow & { similarity: number }>(
      `SELECT *, 1 - (embedding <=> $1::vector) AS similarity
       FROM brain.memories
       WHERE embedding IS NOT NULL
         AND 1 - (embedding <=> $1::vector) >= $2
       ORDER BY similarity DESC
       LIMIT $3`,
      [vectorStr, threshold, limit]
    );
    return rows.map((row) => ({
      ...rowToMemory(row),
      similarity: row.similarity,
    }));
  }

  async queryKnowledgeBySimilarity(
    embedding: number[],
    limit: number,
    threshold: number
  ): Promise<(KnowledgeEntry & { similarity: number })[]> {
    const vectorStr = `[${embedding.join(',')}]`;
    const rows = await this.queryMany<KnowledgeRow & { similarity: number }>(
      `SELECT *, 1 - (embedding <=> $1::vector) AS similarity
       FROM brain.knowledge
       WHERE embedding IS NOT NULL
         AND 1 - (embedding <=> $1::vector) >= $2
       ORDER BY similarity DESC
       LIMIT $3`,
      [vectorStr, threshold, limit]
    );
    return rows.map((row) => ({
      ...rowToKnowledge(row),
      similarity: row.similarity,
    }));
  }

  async updateMemoryEmbedding(id: string, embedding: number[]): Promise<void> {
    const vectorStr = `[${embedding.join(',')}]`;
    await this.execute('UPDATE brain.memories SET embedding = $1::vector WHERE id = $2', [
      vectorStr,
      id,
    ]);
  }

  async updateKnowledgeEmbedding(id: string, embedding: number[]): Promise<void> {
    const vectorStr = `[${embedding.join(',')}]`;
    await this.execute('UPDATE brain.knowledge SET embedding = $1::vector WHERE id = $2', [
      vectorStr,
      id,
    ]);
  }

  // ── Brain Meta ───────────────────────────────────────────────

  async getMeta(key: string): Promise<string | null> {
    const row = await this.queryOne<{ value: string }>(
      'SELECT value FROM brain.meta WHERE key = $1',
      [key]
    );
    return row?.value ?? null;
  }

  async setMeta(key: string, value: string): Promise<void> {
    await this.execute(
      `INSERT INTO brain.meta (key, value, updated_at) VALUES ($1, $2, $3)
       ON CONFLICT(key) DO UPDATE SET value = $2, updated_at = $3`,
      [key, value, Date.now()]
    );
  }

  // ── Stats ────────────────────────────────────────────────────

  async getStats(): Promise<BrainStats> {
    return {
      memories: {
        total: await this.getMemoryCount(),
        byType: await this.getMemoryCountByType(),
      },
      knowledge: {
        total: await this.getKnowledgeCount(),
      },
      skills: {
        total: await this.getSkillCount(),
      },
    };
  }
}
