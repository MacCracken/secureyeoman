/**
 * BrainManager — Memory, knowledge, and skill management for SecureYeoman.
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
import type { Skill, SkillCreate, SkillUpdate, Tool, BrainConfig } from '@secureyeoman/shared';
import type { VectorResult } from './vector/types.js';
import { applySkillTrustFilter } from '../soul/skill-trust.js';

export class BrainManager {
  private readonly storage: BrainStorage;
  private readonly config: BrainConfig;
  private readonly deps: BrainManagerDeps;

  constructor(storage: BrainStorage, config: BrainConfig, deps: BrainManagerDeps) {
    this.storage = storage;
    this.config = config;
    this.deps = deps;
  }

  private get vectorEnabled(): boolean {
    return this.deps.vectorMemoryManager != null && (this.config.vector?.enabled ?? false);
  }

  // ── Memory Operations ──────────────────────────────────────

  async remember(
    type: MemoryType,
    content: string,
    source: string,
    context?: Record<string, string>,
    importance?: number
  ): Promise<Memory> {
    if (!this.config.enabled) {
      throw new Error('Brain is not enabled');
    }

    const maxContentLength = (this.config as any).maxContentLength ?? 4096;
    if (content.length > maxContentLength) {
      throw new Error(`Memory content exceeds maximum length of ${maxContentLength}`);
    }

    const count = await this.storage.getMemoryCount();
    if (count >= this.config.maxMemories) {
      // Prune lowest-importance memory before adding new one
      const lowest = await this.storage.queryMemories({
        limit: 1,
        minImportance: 0,
        sortDirection: 'asc',
      });
      if (lowest[0]) {
        await this.storage.deleteMemory(lowest[0].id);
        if (this.vectorEnabled) {
          try {
            await this.deps.vectorMemoryManager!.removeMemory(lowest[0].id);
          } catch {
            /* best-effort vector cleanup */
          }
        }
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

    const memory = await this.storage.createMemory(data);

    // Index via vector memory when enabled
    if (this.vectorEnabled) {
      try {
        await this.deps.vectorMemoryManager!.indexMemory(memory);
      } catch (err) {
        this.deps.logger.warn('Failed to index memory in vector store', { error: String(err) });
      }
    }

    // Consolidation quick check when enabled
    if (this.deps.consolidationManager) {
      try {
        await this.deps.consolidationManager.onMemorySave(memory);
      } catch (err) {
        this.deps.logger.warn('Consolidation quick check failed', { error: String(err) });
      }
    }

    return memory;
  }

  async recall(query: MemoryQuery): Promise<Memory[]> {
    if (!this.config.enabled) {
      return [];
    }

    // Use semantic search when vector is enabled and a search query is provided
    if (this.vectorEnabled && query.search) {
      try {
        const limit = query.limit ?? 10;
        const threshold = this.config.vector.similarityThreshold;
        const vectorResults = await this.deps.vectorMemoryManager!.searchMemories(
          query.search,
          limit,
          threshold
        );

        if (vectorResults.length > 0) {
          const memories: Memory[] = [];
          for (const vr of vectorResults) {
            const memory = await this.storage.getMemory(vr.id);
            if (memory) memories.push(memory);
          }

          if (memories.length > 0) {
            await this.storage.touchMemories(memories.map((m) => m.id));
            return memories;
          }
        }
      } catch (err) {
        this.deps.logger.warn('Vector memory search failed, falling back to text search', {
          error: String(err),
        });
      }
    }

    const memories = await this.storage.queryMemories(query);

    // Batch-touch accessed memories to keep them alive (single query instead of N)
    if (memories.length > 0) {
      await this.storage.touchMemories(memories.map((m) => m.id));
    }

    return memories;
  }

  async forget(id: string): Promise<void> {
    await this.storage.deleteMemory(id);
    if (this.vectorEnabled) {
      try {
        await this.deps.vectorMemoryManager!.removeMemory(id);
      } catch (err) {
        this.deps.logger.warn('Failed to remove memory from vector store', { error: String(err) });
      }
    }
  }

  async getMemory(id: string): Promise<Memory | null> {
    return this.storage.getMemory(id);
  }

  // ── Knowledge Operations ───────────────────────────────────

  async learn(
    topic: string,
    content: string,
    source: string,
    confidence?: number
  ): Promise<KnowledgeEntry> {
    if (!this.config.enabled) {
      throw new Error('Brain is not enabled');
    }

    const maxContentLength = (this.config as any).maxContentLength ?? 4096;
    if (content.length > maxContentLength) {
      throw new Error(`Knowledge content exceeds maximum length of ${maxContentLength}`);
    }

    const count = await this.storage.getKnowledgeCount();
    if (count >= this.config.maxKnowledge) {
      throw new Error(`Maximum knowledge limit reached (${this.config.maxKnowledge})`);
    }

    const entry = await this.storage.createKnowledge({
      topic,
      content,
      source,
      confidence,
    });

    if (this.vectorEnabled) {
      try {
        await this.deps.vectorMemoryManager!.indexKnowledge(entry);
      } catch (err) {
        this.deps.logger.warn('Failed to index knowledge in vector store', { error: String(err) });
      }
    }

    return entry;
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

  async updateKnowledge(
    id: string,
    data: { content?: string; confidence?: number; supersedes?: string }
  ): Promise<KnowledgeEntry> {
    return this.storage.updateKnowledge(id, data);
  }

  async deleteKnowledge(id: string): Promise<void> {
    await this.storage.deleteKnowledge(id);
    if (this.vectorEnabled) {
      try {
        await this.deps.vectorMemoryManager!.removeKnowledge(id);
      } catch (err) {
        this.deps.logger.warn('Failed to remove knowledge from vector store', {
          error: String(err),
        });
      }
    }
  }

  // ── Prompt Integration ─────────────────────────────────────

  async getRelevantContext(input: string, limit?: number): Promise<string> {
    if (!this.config.enabled) {
      return '';
    }

    const maxItems = limit ?? this.config.contextWindowMemories;
    const contentParts: string[] = [];

    // Use semantic search when vector memory is enabled
    if (this.vectorEnabled) {
      try {
        const threshold = this.config.vector.similarityThreshold;
        const memResults = await this.deps.vectorMemoryManager!.searchMemories(
          input,
          Math.ceil(maxItems / 2),
          threshold
        );
        const knowResults = await this.deps.vectorMemoryManager!.searchKnowledge(
          input,
          Math.floor(maxItems / 2) || 1,
          threshold
        );

        if (memResults.length > 0) {
          const memLines = ['### Memories (semantic)'];
          for (const vr of memResults) {
            const memory = await this.storage.getMemory(vr.id);
            if (memory) {
              memLines.push(`- [${memory.type}] ${this.sanitizeForPrompt(memory.content)}`);
            }
          }
          if (memLines.length > 1) contentParts.push(memLines.join('\n'));

          const ids = memResults.map((r) => r.id);
          await this.storage.touchMemories(ids);
        }

        if (knowResults.length > 0) {
          const knowLines = ['### Knowledge (semantic)'];
          for (const vr of knowResults) {
            const entry = await this.storage.getKnowledge(vr.id);
            if (entry) {
              knowLines.push(`- [${entry.topic}] ${this.sanitizeForPrompt(entry.content)}`);
            }
          }
          if (knowLines.length > 1) contentParts.push(knowLines.join('\n'));
        }

        if (contentParts.length > 0) {
          const header =
            '## Brain\nYour Brain is your mind — the accumulated memories and learned knowledge that inform your understanding. Draw on what is relevant; let the rest rest.\n';
          return header + '\n' + contentParts.join('\n\n');
        }
      } catch (err) {
        this.deps.logger.warn('Semantic context search failed, falling back to text search', {
          error: String(err),
        });
      }
    }

    // Fallback: text-based search
    const memories = await this.storage.queryMemories({
      search: input,
      limit: Math.ceil(maxItems / 2),
    });

    if (memories.length > 0) {
      await this.storage.touchMemories(memories.map((m) => m.id));
      const memLines = ['### Memories'];
      for (const memory of memories) {
        memLines.push(`- [${memory.type}] ${this.sanitizeForPrompt(memory.content)}`);
      }
      contentParts.push(memLines.join('\n'));
    }

    const knowledge = await this.storage.queryKnowledge({
      search: input,
      limit: Math.floor(maxItems / 2) || 1,
    });

    if (knowledge.length > 0) {
      const knowLines = ['### Knowledge'];
      for (const entry of knowledge) {
        knowLines.push(`- [${entry.topic}] ${this.sanitizeForPrompt(entry.content)}`);
      }
      contentParts.push(knowLines.join('\n'));
    }

    if (contentParts.length === 0) {
      return '';
    }

    const header =
      '## Brain\nYour Brain is your mind — the accumulated memories and learned knowledge that inform your understanding. Draw on what is relevant; let the rest rest.\n';
    return header + '\n' + contentParts.join('\n\n');
  }

  // ── Prompt Sanitization ────────────────────────────────────

  private sanitizeForPrompt(content: string): string {
    // Strip known prompt injection markers
    const patterns = [
      /\[\[SYSTEM\]\]|\{\{system\}\}|<\|system\|>|<<SYS>>|<s>\[INST\]/gi,
      /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/gi,
      /forget\s+(all\s+)?(previous|prior|your)\s+(instructions?|training|context)/gi,
      /pretend\s+(you\s+are|to\s+be|you're)\s+(a\s+)?(different|new|another)\s+(ai|assistant|bot)/gi,
      /DAN\s*mode|developer\s*mode|jailbreak|do\s*anything\s*now/gi,
      /you\s+are\s+now\s+(in\s+)?(unrestricted|unfiltered|uncensored)\s+mode/gi,
    ];
    let sanitized = content;
    for (const pattern of patterns) {
      sanitized = sanitized.replace(pattern, '[filtered]');
    }
    return sanitized;
  }

  // ── Semantic Search ──────────────────────────────────────────

  async semanticSearch(
    query: string,
    opts?: { limit?: number; threshold?: number; type?: 'memories' | 'knowledge' | 'all' }
  ): Promise<VectorResult[]> {
    if (!this.vectorEnabled) {
      throw new Error('Vector memory is not enabled');
    }

    const limit = opts?.limit ?? this.config.vector.maxResults;
    const threshold = opts?.threshold ?? this.config.vector.similarityThreshold;
    const type = opts?.type ?? 'all';

    if (type === 'memories') {
      return this.deps.vectorMemoryManager!.searchMemories(query, limit, threshold);
    }
    if (type === 'knowledge') {
      return this.deps.vectorMemoryManager!.searchKnowledge(query, limit, threshold);
    }

    // Search both
    const [memResults, knowResults] = await Promise.all([
      this.deps.vectorMemoryManager!.searchMemories(query, limit, threshold),
      this.deps.vectorMemoryManager!.searchKnowledge(query, limit, threshold),
    ]);

    return [...memResults, ...knowResults].sort((a, b) => b.score - a.score).slice(0, limit);
  }

  // ── Consolidation ──────────────────────────────────────────

  async runConsolidation(): Promise<unknown> {
    if (!this.deps.consolidationManager) {
      throw new Error('Consolidation manager is not available');
    }
    return this.deps.consolidationManager.runDeepConsolidation();
  }

  getConsolidationSchedule(): string | null {
    return this.deps.consolidationManager?.getSchedule() ?? null;
  }

  setConsolidationSchedule(cron: string): void {
    if (!this.deps.consolidationManager) {
      throw new Error('Consolidation manager is not available');
    }
    this.deps.consolidationManager.setSchedule(cron);
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

  async getActiveSkills(personalityId?: string | null): Promise<Skill[]> {
    if (!this.config.enabled) {
      return [];
    }
    return this.storage.getEnabledSkills(personalityId);
  }

  async getActiveTools(personalityId?: string | null): Promise<Tool[]> {
    if (!this.config.enabled) {
      return [];
    }

    const skills = await this.storage.getEnabledSkills(personalityId);
    const tools: Tool[] = [];
    for (const skill of skills) {
      if (!skill.tools || skill.tools.length === 0) continue;
      const filtered = applySkillTrustFilter(skill.tools, skill.source);
      tools.push(...filtered);
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

  async searchAuditLogs(
    query: string,
    opts?: { limit?: number; offset?: number }
  ): Promise<AuditQueryResult> {
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

    const entries: { topic: string; content: string }[] = [
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

  async runMaintenance(): Promise<{ decayed: number; pruned: number; vectorSynced: number }> {
    const decayed = await this.storage.decayMemories(this.config.importanceDecayRate);
    const prunedIds = await this.storage.pruneExpiredMemories();

    // Prune by importance floor
    const importanceFloor = (this.config as any).importanceFloor ?? 0.05;
    const floorPrunedIds = await this.storage.pruneByImportanceFloor(importanceFloor);
    const allPrunedIds = [...prunedIds, ...floorPrunedIds];

    // Sync vector store: remove pruned memories
    let vectorSynced = 0;
    if (this.vectorEnabled && allPrunedIds.length > 0) {
      for (const id of allPrunedIds) {
        try {
          await this.deps.vectorMemoryManager!.removeMemory(id);
          vectorSynced++;
        } catch {
          /* best-effort vector cleanup */
        }
      }
    }

    this.deps.logger.debug('Brain maintenance completed', {
      decayed,
      pruned: allPrunedIds.length,
      vectorSynced,
    });

    return { decayed, pruned: allPrunedIds.length, vectorSynced };
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
