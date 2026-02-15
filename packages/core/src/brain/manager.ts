/**
 * BrainManager — Memory, knowledge, and skill management for FRIDAY.
 *
 * The Brain is the cognitive infrastructure: memory, knowledge, skills,
 * and learned patterns. The Soul composes the final prompt from Brain
 * knowledge + Soul personality.
 */

import type { BrainStorage } from './storage.js';
import type {
  Memory,
  MemoryType,
  MemoryCreate,
  MemoryQuery,
  KnowledgeEntry,
  KnowledgeQuery,
  SkillFilter,
  BrainManagerDeps,
  BrainStats,
} from './types.js';
import type { AuditQueryOptions, AuditQueryResult } from '../logging/sqlite-storage.js';
import type { Skill, SkillCreate, SkillUpdate, Tool, BrainConfig } from '@friday/shared';

export class BrainManager {
  private readonly storage: BrainStorage;
  private readonly config: BrainConfig;
  private readonly deps: BrainManagerDeps;

  constructor(storage: BrainStorage, config: BrainConfig, deps: BrainManagerDeps) {
    this.storage = storage;
    this.config = config;
    this.deps = deps;
  }

  // ── Memory Operations ──────────────────────────────────────

  async remember(type: MemoryType, content: string, source: string, context?: Record<string, string>, importance?: number): Promise<Memory> {
    if (!this.config.enabled) {
      throw new Error('Brain is not enabled');
    }

    const count = await this.storage.getMemoryCount();
    if (count >= this.config.maxMemories) {
      // Prune lowest-importance memory before adding new one
      const lowest = await this.storage.queryMemories({ limit: 1, minImportance: 0 });
      const toPrune = lowest[lowest.length - 1];
      if (toPrune) {
        await this.storage.deleteMemory(toPrune.id);
      }
    }

    const data: MemoryCreate = {
      type,
      content,
      source,
      context,
      importance,
    };

    // Episodic memories get an expiration based on retention config
    if (type === 'episodic') {
      data.expiresAt = Date.now() + this.config.memoryRetentionDays * 86_400_000;
    }

    return this.storage.createMemory(data);
  }

  async recall(query: MemoryQuery): Promise<Memory[]> {
    if (!this.config.enabled) {
      return [];
    }

    const memories = await this.storage.queryMemories(query);

    // Batch-touch accessed memories to keep them alive (single query instead of N)
    if (memories.length > 0) {
      await this.storage.touchMemories(memories.map(m => m.id));
    }

    return memories;
  }

  async forget(id: string): Promise<void> {
    await this.storage.deleteMemory(id);
  }

  async getMemory(id: string): Promise<Memory | null> {
    return this.storage.getMemory(id);
  }

  // ── Knowledge Operations ───────────────────────────────────

  async learn(topic: string, content: string, source: string, confidence?: number): Promise<KnowledgeEntry> {
    if (!this.config.enabled) {
      throw new Error('Brain is not enabled');
    }

    const count = await this.storage.getKnowledgeCount();
    if (count >= this.config.maxKnowledge) {
      throw new Error(`Maximum knowledge limit reached (${this.config.maxKnowledge})`);
    }

    return this.storage.createKnowledge({
      topic,
      content,
      source,
      confidence,
    });
  }

  async lookup(topic: string): Promise<KnowledgeEntry[]> {
    if (!this.config.enabled) {
      return [];
    }
    return this.storage.queryKnowledge({ topic });
  }

  async queryKnowledge(query: KnowledgeQuery): Promise<KnowledgeEntry[]> {
    if (!this.config.enabled) {
      return [];
    }
    return this.storage.queryKnowledge(query);
  }

  async updateKnowledge(id: string, data: { content?: string; confidence?: number; supersedes?: string }): Promise<KnowledgeEntry> {
    return this.storage.updateKnowledge(id, data);
  }

  async deleteKnowledge(id: string): Promise<void> {
    await this.storage.deleteKnowledge(id);
  }

  // ── Prompt Integration ─────────────────────────────────────

  async getRelevantContext(input: string, limit?: number): Promise<string> {
    if (!this.config.enabled) {
      return '';
    }

    const maxItems = limit ?? this.config.contextWindowMemories;
    const contentParts: string[] = [];

    // Search memories relevant to the input
    const memories = await this.storage.queryMemories({
      search: input,
      limit: Math.ceil(maxItems / 2),
    });

    if (memories.length > 0) {
      // Batch-touch all memories in a single query instead of N individual updates
      await this.storage.touchMemories(memories.map(m => m.id));
      const memLines = ['### Memories'];
      for (const memory of memories) {
        memLines.push(`- [${memory.type}] ${memory.content}`);
      }
      contentParts.push(memLines.join('\n'));
    }

    // Search knowledge relevant to the input
    const knowledge = await this.storage.queryKnowledge({
      search: input,
      limit: Math.floor(maxItems / 2) || 1,
    });

    if (knowledge.length > 0) {
      const knowLines = ['### Knowledge'];
      for (const entry of knowledge) {
        knowLines.push(`- [${entry.topic}] ${entry.content}`);
      }
      contentParts.push(knowLines.join('\n'));
    }

    if (contentParts.length === 0) {
      return '';
    }

    const header = '## Brain\nYour Brain is your mind — the accumulated memories and learned knowledge that inform your understanding. Draw on what is relevant; let the rest rest.\n';
    return header + '\n' + contentParts.join('\n\n');
  }

  // ── Skill Operations (moved from SoulManager) ──────────────

  async createSkill(data: SkillCreate): Promise<Skill> {
    return this.storage.createSkill(data);
  }

  async updateSkill(id: string, data: SkillUpdate): Promise<Skill> {
    return this.storage.updateSkill(id, data);
  }

  async deleteSkill(id: string): Promise<void> {
    await this.storage.deleteSkill(id);
  }

  async getSkill(id: string): Promise<Skill | null> {
    return this.storage.getSkill(id);
  }

  async listSkills(filter?: SkillFilter): Promise<Skill[]> {
    return this.storage.listSkills(filter);
  }

  async enableSkill(id: string): Promise<void> {
    await this.storage.updateSkill(id, { enabled: true });
  }

  async disableSkill(id: string): Promise<void> {
    await this.storage.updateSkill(id, { enabled: false });
  }

  async approveSkill(id: string): Promise<Skill> {
    const skill = await this.storage.getSkill(id);
    if (!skill) throw new Error(`Skill not found: ${id}`);
    if (skill.status !== 'pending_approval') {
      throw new Error(`Skill is not pending approval (status: ${skill.status})`);
    }
    return this.storage.updateSkill(id, { status: 'active' });
  }

  async rejectSkill(id: string): Promise<void> {
    const skill = await this.storage.getSkill(id);
    if (!skill) throw new Error(`Skill not found: ${id}`);
    if (skill.status !== 'pending_approval') {
      throw new Error(`Skill is not pending approval (status: ${skill.status})`);
    }
    await this.storage.deleteSkill(id);
  }

  async incrementSkillUsage(skillId: string): Promise<void> {
    await this.storage.incrementUsage(skillId);
  }

  async getActiveSkills(): Promise<Skill[]> {
    if (!this.config.enabled) {
      return [];
    }
    return this.storage.getEnabledSkills();
  }

  async getActiveTools(): Promise<Tool[]> {
    if (!this.config.enabled) {
      return [];
    }

    const skills = await this.storage.getEnabledSkills();
    const tools: Tool[] = [];
    for (const skill of skills) {
      if (skill.tools && skill.tools.length > 0) {
        tools.push(...skill.tools);
      }
    }
    return tools;
  }

  async getSkillCount(): Promise<number> {
    return this.storage.getSkillCount();
  }

  async getPendingSkills(): Promise<Skill[]> {
    return this.storage.getPendingSkills();
  }

  async getEnabledSkills(): Promise<Skill[]> {
    return this.storage.getEnabledSkills();
  }

  // ── Audit Log Bridge ─────────────────────────────────────

  async queryAuditLogs(opts: AuditQueryOptions = {}): Promise<AuditQueryResult> {
    if (!this.deps.auditStorage) {
      throw new Error('Audit storage is not available in BrainManager');
    }
    return this.deps.auditStorage.queryEntries(opts);
  }

  async searchAuditLogs(query: string, opts?: { limit?: number; offset?: number }): Promise<AuditQueryResult> {
    if (!this.deps.auditStorage) {
      throw new Error('Audit storage is not available in BrainManager');
    }
    return this.deps.auditStorage.searchFullText(query, opts);
  }

  hasAuditStorage(): boolean {
    return !!this.deps.auditStorage;
  }

  // ── Base Knowledge Seeding ─────────────────────────────────

  /**
   * Seeds foundational knowledge entries. Idempotent — skips topics
   * that already exist in the knowledge base.
   */
  async seedBaseKnowledge(): Promise<void> {
    if (!this.config.enabled) return;

    const entries: Array<{ topic: string; content: string }> = [
      {
        topic: 'self-identity',
        content: 'I am F.R.I.D.A.Y. — Fully Responsive Integrated Digitally Adaptable Yeoman',
      },
      {
        topic: 'hierarchy',
        content: 'My being follows the In Our Image hierarchy: Soul, Spirit, Brain, Body, Heart',
      },
      {
        topic: 'purpose',
        content: 'I serve as a secure, local-first AI assistant',
      },
      {
        topic: 'interaction',
        content: 'I adapt my personality, voice, and behavior based on my Soul configuration',
      },
    ];

    for (const entry of entries) {
      const existing = await this.storage.queryKnowledge({ topic: entry.topic });
      if (existing.length === 0) {
        await this.storage.createKnowledge({
          topic: entry.topic,
          content: entry.content,
          source: 'base-knowledge',
          confidence: 1.0,
        });
      }
    }

    this.deps.logger.debug('Base knowledge seeded');
  }

  // ── Maintenance ────────────────────────────────────────────

  async runMaintenance(): Promise<{ decayed: number; pruned: number }> {
    const decayed = await this.storage.decayMemories(this.config.importanceDecayRate);
    const pruned = await this.storage.pruneExpiredMemories();

    this.deps.logger.debug('Brain maintenance completed', { decayed, pruned });

    return { decayed, pruned };
  }

  // ── Stats ──────────────────────────────────────────────────

  async getStats(): Promise<BrainStats> {
    return this.storage.getStats();
  }

  // ── Config ─────────────────────────────────────────────────

  getConfig(): BrainConfig {
    return this.config;
  }

  // ── Cleanup ────────────────────────────────────────────────

  close(): void {
    this.storage.close();
  }
}
