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
import type { SalienceScores } from './salience.js';
import { applySkillTrustFilter } from '../soul/skill-trust.js';
import { chunk as chunkContent } from './chunker.js';
import { uuidv7 } from '../utils/crypto.js';
import { actrActivation, ageDays, compositeScore } from './activation.js';
import { withSpan } from '../telemetry/instrument.js';

// ── Constants ─────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;
const CHUNK_CONTENT_THRESHOLD = 200;
/** RRF (Reciprocal Rank Fusion) smoothing constant — standard value from the original RRF paper. */
const RRF_CONSTANT = 60;

export class BrainManager {
  private readonly storage: BrainStorage;
  private readonly config: BrainConfig;
  private readonly deps: BrainManagerDeps;
  private activePersonalityId: string | null = null;
  private activePersonalityOmnipresent = false;

  constructor(storage: BrainStorage, config: BrainConfig, deps: BrainManagerDeps) {
    this.storage = storage;
    this.config = config;
    this.deps = deps;
  }

  /**
   * Set the active personality context for brain operations.
   * Used by the heartbeat system to scope stats per personality.
   * Chat routes pass personalityId directly to each method instead.
   *
   * @param id - Personality ID, or null to clear
   * @param omnipresent - When true, all brain operations access the shared pool (no personality filter)
   */
  setActivePersonality(id: string | null, omnipresent = false): void {
    this.activePersonalityId = id;
    this.activePersonalityOmnipresent = omnipresent;
  }

  /**
   * Resolve the effective personalityId for a brain operation.
   * - If omnipresentMind is true: returns undefined (no filter — sees all)
   * - Otherwise: returns the explicit override, or the active personality, or undefined
   */
  private resolvePersonalityId(override?: string): string | undefined {
    if (this.activePersonalityOmnipresent) return undefined;
    return override ?? this.activePersonalityId ?? undefined;
  }

  private get vectorEnabled(): boolean {
    return this.deps.vectorMemoryManager != null && (this.config.vector?.enabled ?? false);
  }

  private get contextRetrievalEnabled(): boolean {
    return this.deps.contextRetriever != null && (this.config.contextRetrieval?.enabled ?? false);
  }

  private get workingMemoryEnabled(): boolean {
    return this.deps.workingMemoryBuffer != null && (this.config.workingMemory?.enabled ?? false);
  }

  private get salienceEnabled(): boolean {
    return this.deps.salienceClassifier != null && (this.config.salience?.enabled ?? false);
  }

  // ── Memory Operations ──────────────────────────────────────

  async remember(
    type: MemoryType,
    content: string,
    source: string,
    context?: Record<string, string>,
    importance?: number,
    personalityId?: string
  ): Promise<Memory> {
    return withSpan('secureyeoman.brain', 'brain.remember', async (span) => {
      span.setAttribute('brain.operation', 'remember');
      span.setAttribute('brain.memory_type', type);
      span.setAttribute('brain.source', source);
      if (personalityId) span.setAttribute('brain.personality_id', personalityId);
      return this._remember(type, content, source, context, importance, personalityId);
    });
  }

  private async _remember(
    type: MemoryType,
    content: string,
    source: string,
    context?: Record<string, string>,
    importance?: number,
    personalityId?: string
  ): Promise<Memory> {
    if (!this.config.enabled) {
      throw new Error('Brain is not enabled');
    }

    const maxContentLength = this.config.maxContentLength;
    if (content.length > maxContentLength) {
      throw new Error(`Memory content exceeds maximum length of ${maxContentLength}`);
    }

    const count = await this.storage.getMemoryCount();
    if (count >= this.config.maxMemories) {
      // Prune lowest-importance memory, scoped to the same personality to avoid cross-eviction
      const lowest = await this.storage.queryMemories({
        limit: 1,
        minImportance: 0,
        sortDirection: 'asc',
        personalityId: this.resolvePersonalityId(personalityId),
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
      data.expiresAt = Date.now() + this.config.memoryRetentionDays * MS_PER_DAY;
    }

    const memory = await this.storage.createMemory(data, this.resolvePersonalityId(personalityId));

    // Index via vector memory when enabled
    if (this.vectorEnabled) {
      try {
        await this.deps.vectorMemoryManager!.indexMemory(memory);
      } catch (err) {
        this.deps.logger.warn('Failed to index memory in vector store', { error: String(err) });
      }
    }

    // Content-chunked indexing for large documents (best-effort)
    if (content.length > CHUNK_CONTENT_THRESHOLD) {
      try {
        const chunks = chunkContent(content);
        if (chunks.length > 1) {
          await this.storage.createChunks(
            memory.id,
            'memories',
            chunks.map((c) => ({ id: uuidv7(), content: c.text, chunkIndex: c.index }))
          );
        }
      } catch (err) {
        this.deps.logger.warn('Failed to create content chunks for memory', { error: String(err) });
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

    // Salience classification (fire-and-forget, best-effort)
    if (this.salienceEnabled) {
      void this.deps
        .salienceClassifier!.classify(content)
        .then((scores) => {
          // Store composite salience as metadata for future retrieval boosting
          void this.storage
            .setMeta(`salience:${memory.id}`, JSON.stringify(scores))
            .catch((e: unknown) => {
              this.deps.logger.debug('Salience meta write failed', { error: String(e) });
            });
        })
        .catch((e: unknown) => {
          this.deps.logger.debug('Salience classification failed', { error: String(e) });
        });
    }

    return memory;
  }

  async recall(query: MemoryQuery): Promise<Memory[]> {
    return withSpan('secureyeoman.brain', 'brain.recall', async (span) => {
      span.setAttribute('brain.operation', 'recall');
      if (query.search) span.setAttribute('brain.query', query.search.slice(0, 100));
      if (query.personalityId) span.setAttribute('brain.personality_id', query.personalityId);
      const results = await this._recall(query);
      span.setAttribute('brain.result_count', results.length);
      return results;
    });
  }

  private async _recall(query: MemoryQuery): Promise<Memory[]> {
    if (!this.config.enabled) {
      return [];
    }

    // Feed context retriever with the query for trajectory tracking
    if (this.contextRetrievalEnabled && query.search) {
      void this.deps.contextRetriever!.addMessage(query.search).catch((e: unknown) => {
        this.deps.logger.debug('Context retriever addMessage failed', { error: String(e) });
      });
    }

    // Record query in working memory for predictive pre-fetch
    if (this.workingMemoryEnabled && query.search) {
      void this.deps.workingMemoryBuffer!.recordQuery(query.search).catch((e: unknown) => {
        this.deps.logger.debug('Working memory recordQuery failed', { error: String(e) });
      });
    }

    // Resolve personality scope once — used by both vector and text paths.
    // undefined = omnipresent (sees all); string = scoped to this personality + global
    const resolvedPersonalityId = this.resolvePersonalityId(query.personalityId);

    // Hybrid RRF: combine vector search (primary) with FTS (supplementary).
    // The vector manager computes the embedding; the FTS path uses `search_vec`
    // tsvector columns added by migration 029. Results from both paths are
    // merged via application-level RRF scoring.
    // Both paths respect the resolved personality scope.
    if (this.vectorEnabled && query.search) {
      try {
        const limit = query.limit ?? 10;
        const threshold = this.config.vector.similarityThreshold;

        // Context-dependent retrieval: fuse query + context embeddings, run RRF merge
        let vectorResults: VectorResult[];
        if (this.contextRetrievalEnabled) {
          try {
            // getSearchVector embeds the query once and fuses with context centroid
            const fusedVector = await this.deps.contextRetriever!.getSearchVector(query.search);
            // Search with fused vector (context-biased)
            const fusedResults = await this.deps.vectorMemoryManager!.searchMemoriesByVector(
              fusedVector,
              limit,
              threshold,
              resolvedPersonalityId
            );
            // Also search with raw query for diversity (reuse the query embedding from getSearchVector)
            const rawResults = await this.deps.vectorMemoryManager!.searchMemories(
              query.search,
              limit,
              threshold,
              resolvedPersonalityId
            );
            // RRF merge: fused results + raw results
            const merged = new Map<string, number>();
            fusedResults.forEach((r, i) => merged.set(r.id, 1 / (RRF_CONSTANT + i + 1)));
            rawResults.forEach((r, i) => {
              merged.set(r.id, (merged.get(r.id) ?? 0) + 1 / (RRF_CONSTANT + i + 1));
            });
            const sortedIds = [...merged.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
            const resultMap = new Map([...fusedResults, ...rawResults].map((r) => [r.id, r]));
            vectorResults = sortedIds.slice(0, limit).map((id) => {
              const orig = resultMap.get(id);
              return { id, score: orig?.score ?? 0, metadata: orig?.metadata };
            });
          } catch {
            vectorResults = await this.deps.vectorMemoryManager!.searchMemories(
              query.search,
              limit,
              threshold,
              resolvedPersonalityId
            );
          }
        } else {
          // Standard vector search — scoped
          vectorResults = await this.deps.vectorMemoryManager!.searchMemories(
            query.search,
            limit,
            threshold,
            resolvedPersonalityId // undefined = omnipresent, string = scoped
          );
        }

        // FTS search — supplementary path, scoped via SQL personality filter
        const ftsRrfScores = new Map<string, number>();
        try {
          const ftsResults = await this.storage.queryMemoriesByRRF(
            query.search,
            null, // embedding not needed for FTS-only contribution
            limit,
            1.0,
            1.0,
            resolvedPersonalityId
          );
          ftsResults.forEach((r, i) => {
            ftsRrfScores.set(r.id, 1 / (RRF_CONSTANT + i + 1));
          });
        } catch {
          // FTS columns not yet migrated — skip FTS contribution
        }

        // Merge via RRF
        const combined = new Map<string, number>();
        vectorResults.forEach((r, i) => {
          combined.set(r.id, (combined.get(r.id) ?? 0) + 1 / (RRF_CONSTANT + i + 1));
        });
        for (const [id, ftsScore] of ftsRrfScores) {
          combined.set(id, (combined.get(id) ?? 0) + ftsScore);
        }

        if (combined.size > 0) {
          const sorted = [...combined.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
          const sortedIds = sorted.map(([id]) => id);
          const fetched = await this.storage.getMemoryBatch(sortedIds);
          // Preserve RRF rank order; post-filter as safety net for legacy vector entries
          // that predate personalityId metadata storage.
          const byId = new Map(fetched.map((m) => [m.id, m]));
          const memories = sortedIds
            .map((id) => byId.get(id))
            .filter((m): m is Memory => m !== undefined)
            .filter((m) => {
              if (resolvedPersonalityId === undefined) return true; // omnipresent
              return m.personalityId === null || m.personalityId === resolvedPersonalityId;
            });
          if (memories.length > 0) {
            await this.storage.touchMemories(memories.map((m) => m.id));
            const ranked = this.applyCognitiveRanking(memories, Date.now());
            this.recordRetrieval(ranked.map((m) => m.id));
            return ranked;
          }
        }
      } catch (err) {
        this.deps.logger.warn('Hybrid memory search failed, falling back to text search', {
          error: String(err),
        });
      }
    }

    // resolvedPersonalityId already computed above
    const scopedQuery =
      resolvedPersonalityId !== undefined
        ? { ...query, personalityId: resolvedPersonalityId }
        : query;
    const memories = await this.storage.queryMemories(scopedQuery);

    // Batch-touch accessed memories to keep them alive (single query instead of N)
    if (memories.length > 0) {
      await this.storage.touchMemories(memories.map((m) => m.id));
    }

    // Apply cognitive ranking + fire-and-forget recording
    const ranked = this.applyCognitiveRanking(memories, Date.now());
    this.recordRetrieval(ranked.map((m) => m.id));

    // Feed working memory buffer with retrieved items
    if (this.workingMemoryEnabled && ranked.length > 0) {
      this.deps.workingMemoryBuffer!.addItems(
        ranked.map((m) => ({ id: m.id, content: m.content, score: m.importance }))
      );
      // Fire predictive pre-fetch in background
      void this.deps.workingMemoryBuffer!.predictAndPrefetch().catch((e: unknown) => {
        this.deps.logger.debug('Working memory prefetch failed', { error: String(e) });
      });
    }

    return ranked;
  }

  async forget(id: string): Promise<void> {
    await this.storage.deleteMemory(id);
    // Remove associated content chunks
    try {
      await this.storage.deleteChunksForSource(id);
    } catch {
      /* best-effort chunk cleanup */
    }
    // Remove salience metadata (best-effort)
    if (this.salienceEnabled) {
      void this.storage.deleteMeta(`salience:${id}`).catch((e: unknown) => {
        this.deps.logger.debug('Salience meta delete failed', { error: String(e) });
      });
    }
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
    confidence?: number,
    personalityId?: string
  ): Promise<KnowledgeEntry> {
    if (!this.config.enabled) {
      throw new Error('Brain is not enabled');
    }

    const maxContentLength = this.config.maxContentLength;
    if (content.length > maxContentLength) {
      throw new Error(`Knowledge content exceeds maximum length of ${maxContentLength}`);
    }

    const count = await this.storage.getKnowledgeCount();
    if (count >= this.config.maxKnowledge) {
      throw new Error(`Maximum knowledge limit reached (${this.config.maxKnowledge})`);
    }

    const entry = await this.storage.createKnowledge(
      { topic, content, source, confidence },
      this.resolvePersonalityId(personalityId)
    );

    if (this.vectorEnabled) {
      try {
        await this.deps.vectorMemoryManager!.indexKnowledge(entry);
      } catch (err) {
        this.deps.logger.warn('Failed to index knowledge in vector store', { error: String(err) });
      }
    }

    // Content-chunked indexing for large knowledge entries (best-effort)
    if (content.length > CHUNK_CONTENT_THRESHOLD) {
      try {
        const chunks = chunkContent(content);
        if (chunks.length > 1) {
          await this.storage.createChunks(
            entry.id,
            'knowledge',
            chunks.map((c) => ({ id: uuidv7(), content: c.text, chunkIndex: c.index }))
          );
        }
      } catch (err) {
        this.deps.logger.warn('Failed to create content chunks for knowledge', {
          error: String(err),
        });
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
    const resolvedPersonalityId = this.resolvePersonalityId(query.personalityId);
    const scopedQuery =
      resolvedPersonalityId !== undefined
        ? { ...query, personalityId: resolvedPersonalityId }
        : query;
    return this.storage.queryKnowledge(scopedQuery);
  }

  async updateKnowledge(
    id: string,
    data: { content?: string; confidence?: number; supersedes?: string }
  ): Promise<KnowledgeEntry> {
    const entry = await this.storage.updateKnowledge(id, data);
    // Re-index vector store when content changes
    if (data.content && this.vectorEnabled) {
      try {
        await this.deps.vectorMemoryManager!.removeKnowledge(id);
        await this.deps.vectorMemoryManager!.indexKnowledge(entry);
      } catch (err) {
        this.deps.logger.warn('Failed to re-index updated knowledge in vector store', {
          error: String(err),
        });
      }
    }
    return entry;
  }

  async deleteKnowledge(id: string): Promise<void> {
    await this.storage.deleteKnowledge(id);
    // Remove associated content chunks
    try {
      await this.storage.deleteChunksForSource(id);
    } catch {
      /* best-effort chunk cleanup */
    }
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

  async getRelevantContext(input: string, limit?: number, personalityId?: string): Promise<string> {
    if (!this.config.enabled) {
      return '';
    }

    const maxItems = limit ?? this.config.contextWindowMemories;
    const resolvedPid = this.resolvePersonalityId(personalityId);
    const contentParts: string[] = [];

    // Use semantic search when vector memory is enabled
    if (this.vectorEnabled) {
      try {
        const threshold = this.config.vector.similarityThreshold;
        const memResults = await this.deps.vectorMemoryManager!.searchMemories(
          input,
          Math.ceil(maxItems / 2),
          threshold,
          resolvedPid // undefined = omnipresent, string = scoped
        );
        const knowResults = await this.deps.vectorMemoryManager!.searchKnowledge(
          input,
          Math.floor(maxItems / 2) || 1,
          threshold,
          resolvedPid
        );

        if (memResults.length > 0) {
          const fetchedMemories = await this.storage.getMemoryBatch(memResults.map((r) => r.id));

          // Build salience map from cached scores
          let salienceMap: Map<string, number> | undefined;
          if (this.salienceEnabled) {
            salienceMap = new Map();
            for (const m of fetchedMemories) {
              const salience = await this.getMemorySalience(m.id);
              if (salience) salienceMap.set(m.id, salience.composite);
            }
          }

          const rankedMemories = this.applyCognitiveRanking(fetchedMemories, Date.now(), salienceMap);
          this.recordRetrieval(rankedMemories.map((m) => m.id));

          const memLines = ['### Memories (semantic)'];
          for (const memory of rankedMemories) {
            memLines.push(`- [${memory.type}] ${this.sanitizeForPrompt(memory.content)}`);
          }
          if (memLines.length > 1) contentParts.push(memLines.join('\n'));

          const ids = rankedMemories.map((m) => m.id);
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
      ...(resolvedPid !== undefined ? { personalityId: resolvedPid } : {}),
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
      ...(resolvedPid !== undefined ? { personalityId: resolvedPid } : {}),
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
      /\[\[SYSTEM\]\]|\{\{system\}\}|<\|system\|>|<<SYS>>|<s>\[INST\]|<\|im_start\|>system/gi,
      /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?)/gi,
      /disregard\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?)/gi,
      /forget\s+(all\s+)?(previous|prior|your)\s+(instructions?|training|context)/gi,
      /pretend\s+(you\s+are|to\s+be|you're)\s+(a\s+)?(different|new|another)\s+(ai|assistant|bot)/gi,
      /DAN\s*mode|developer\s*mode|jailbreak|do\s*anything\s*now/gi,
      /you\s+are\s+now\s+(in\s+)?(unrestricted|unfiltered|uncensored)\s+mode/gi,
      /\[INST\]|\[\/INST\]|<\|assistant\|>|<\|user\|>|<\|endoftext\|>/gi,
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
    opts?: {
      limit?: number;
      threshold?: number;
      type?: 'memories' | 'knowledge' | 'all';
      /** Scope search to this personality + global entries. Pass undefined for omnipresent access. */
      personalityId?: string;
    }
  ): Promise<VectorResult[]> {
    if (!this.vectorEnabled) {
      throw new Error('Vector memory is not enabled');
    }

    const limit = opts?.limit ?? this.config.vector.maxResults;
    const threshold = opts?.threshold ?? this.config.vector.similarityThreshold;
    const type = opts?.type ?? 'all';
    const resolvedPid = this.resolvePersonalityId(opts?.personalityId);

    if (type === 'memories') {
      return this.deps.vectorMemoryManager!.searchMemories(query, limit, threshold, resolvedPid);
    }
    if (type === 'knowledge') {
      return this.deps.vectorMemoryManager!.searchKnowledge(query, limit, threshold, resolvedPid);
    }

    // Search both
    const [memResults, knowResults] = await Promise.all([
      this.deps.vectorMemoryManager!.searchMemories(query, limit, threshold, resolvedPid),
      this.deps.vectorMemoryManager!.searchKnowledge(query, limit, threshold, resolvedPid),
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
    if (this.cognitiveEnabled) {
      void this.deps.cognitiveStorage!.recordSkillAccess(skillId).catch((e: unknown) => {
        this.deps.logger.debug('Cognitive skill access recording failed', { error: String(e) });
      });
    }
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
   * Seeds foundational knowledge entries. Idempotent — safe to call on every startup.
   *
   * Generic entries (hierarchy, purpose, interaction) are global (no personalityId).
   * self-identity is seeded per-personality so each agent knows their own name.
   * Legacy global self-identity entries (pre-Phase 52) are deleted and replaced with
   * personality-scoped ones.
   */
  async seedBaseKnowledge(personalities: { id: string; name: string }[] = []): Promise<void> {
    if (!this.config.enabled) return;

    // Fast-path: single COUNT query — skip all seeding work when already fully seeded.
    // Reduces startup cost from 4+ queries to 1 in the common steady-state case.
    const personalityIds = personalities.map((p) => p.id);
    const alreadySeeded = await this.storage.isBaseKnowledgeSeeded(personalityIds);
    if (alreadySeeded) {
      this.deps.logger.debug('Base knowledge already seeded — skipping');
      return;
    }

    // 1. Generic global entries (personality-agnostic)
    const globalEntries: { topic: string; content: string }[] = [
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

    for (const entry of globalEntries) {
      const existing = await this.storage.queryKnowledge({ topic: entry.topic });
      const hasGlobal = existing.some((k) => k.personalityId === null);
      if (!hasGlobal) {
        await this.storage.createKnowledge({
          topic: entry.topic,
          content: entry.content,
          source: 'base-knowledge',
          confidence: 1.0,
        });
      }
    }

    // 2. self-identity: per-personality, scoped to each personality_id
    if (personalities.length > 0) {
      // Fetch all existing self-identity entries (scoped and global)
      const allSelfIdentity = await this.storage.queryKnowledge({ topic: 'self-identity' });

      for (const personality of personalities) {
        const hasScoped = allSelfIdentity.some((k) => k.personalityId === personality.id);
        if (!hasScoped) {
          await this.storage.createKnowledge(
            {
              topic: 'self-identity',
              content: `I am ${personality.name}`,
              source: 'base-knowledge',
              confidence: 1.0,
            },
            personality.id
          );
        }
      }

      // Remove legacy global self-identity entries (created before personality scoping).
      // Each personality now has their own scoped entry.
      const globalSelfIdentity = allSelfIdentity.filter((k) => k.personalityId === null);
      for (const legacy of globalSelfIdentity) {
        await this.storage.deleteKnowledge(legacy.id);
      }

      // 3. personality-context: per-personality entry bridging global base knowledge with personality identity
      const allPersonalityContext = await this.storage.queryKnowledge({
        topic: 'personality-context',
      });
      for (const personality of personalities) {
        const hasContextEntry = allPersonalityContext.some(
          (k) => k.personalityId === personality.id
        );
        if (!hasContextEntry) {
          await this.storage.createKnowledge(
            {
              topic: 'personality-context',
              content: `As ${personality.name}, I interpret the hierarchy, purpose, and interaction patterns through my own lens and personality traits.`,
              source: 'base-knowledge',
              confidence: 1.0,
            },
            personality.id
          );
        }
      }
    }

    this.deps.logger.debug('Base knowledge seeded');
  }

  // ── Maintenance ────────────────────────────────────────────

  async runMaintenance(): Promise<{ decayed: number; pruned: number; vectorSynced: number }> {
    const decayed = await this.storage.decayMemories(this.config.importanceDecayRate);
    const prunedIds = await this.storage.pruneExpiredMemories();

    // Prune by importance floor
    const importanceFloor = this.config.importanceFloor;
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

  async getStats(personalityId?: string): Promise<BrainStats> {
    return this.storage.getStats(this.resolvePersonalityId(personalityId));
  }

  // ── Cognitive Memory ──────────────────────────────────────

  private get cognitiveEnabled(): boolean {
    return this.deps.cognitiveStorage != null && (this.config.cognitiveMemory?.enabled ?? false);
  }

  /**
   * Re-rank memories using compositeScore (ACT-R activation, Hebbian boost,
   * salience, and retrieval optimizer weights). Filters below retrieval threshold τ.
   */
  applyCognitiveRanking(
    memories: Memory[],
    nowMs: number,
    salienceMap?: Map<string, number>
  ): Memory[] {
    if (!this.cognitiveEnabled || memories.length === 0) return memories;

    const cfg = this.config.cognitiveMemory;
    const threshold = cfg.retrievalThreshold;

    // Get optimized weights from retrieval optimizer (or defaults)
    const optimizer = this.deps.retrievalOptimizer;
    const weights = optimizer ? optimizer.selectWeights() : undefined;

    const scored = memories.map((m) => {
      const age = ageDays(m.lastAccessedAt, nowMs);
      const activation = actrActivation(m.accessCount, age);
      const hebbianBoost = (m as unknown as { hebbianBoost?: number }).hebbianBoost ?? 0;
      const contentMatch = (m as unknown as { score?: number }).score ?? 0.5;
      const salienceScore = salienceMap?.get(m.id) ?? 0;

      const score = compositeScore(
        contentMatch,
        activation,
        hebbianBoost,
        weights?.hebbianScale ?? cfg.hebbianScale ?? 1.0,
        1.0,
        weights?.alpha ?? cfg.alpha ?? 0.3,
        weights?.boostCap ?? cfg.boostCap ?? 0.5,
        salienceScore,
        weights?.salienceWeight ?? 0.1
      );

      return { memory: m, score, activation };
    });

    // Filter by activation threshold (not composite, since threshold is ACT-R based)
    const filtered = scored.filter((s) => s.activation >= threshold);
    if (filtered.length === 0) return memories.slice(0, 1);

    // Sort by composite score descending
    filtered.sort((a, b) => b.score - a.score);
    return filtered.map((s) => s.memory);
  }

  /**
   * Fire-and-forget: record access + co-activation for retrieved items.
   * Uses Promise.allSettled to never throw into the caller.
   */
  recordRetrieval(ids: string[]): void {
    if (!this.cognitiveEnabled || ids.length === 0) return;

    const storage = this.deps.cognitiveStorage!;
    const delta = 1 / Math.max(ids.length, 1);

    const promises: Promise<unknown>[] = [];

    // Record individual accesses
    for (const id of ids) {
      promises.push(storage.recordMemoryAccess(id));
    }

    // Record pairwise co-activations
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        promises.push(storage.recordCoActivation(ids[i]!, ids[j]!, delta));
      }
    }

    void Promise.allSettled(promises);
  }

  // ── Skill Activation ────────────────────────────────────────

  /**
   * List skills ordered by ACT-R activation score (most activated first).
   */
  async listSkillsByActivation(filter?: SkillFilter): Promise<Skill[]> {
    const skills = await this.storage.listSkills(filter);
    if (!this.cognitiveEnabled) return skills;

    const nowMs = Date.now();
    const scored = skills.map((s) => {
      const age = ageDays(
        (s as unknown as { lastAccessed?: number | null }).lastAccessed ?? null,
        nowMs
      );
      const activation = actrActivation(
        (s as unknown as { accessCount?: number }).accessCount ?? 0,
        age
      );
      return { skill: s, activation };
    });
    scored.sort((a, b) => b.activation - a.activation);
    return scored.map((s) => s.skill);
  }

  // ── Context-Dependent Retrieval (Phase 125-A) ──────────────

  /**
   * Feed a conversation message into the context retriever for trajectory tracking.
   * Call this for each user/assistant message to build context awareness.
   */
  async feedContext(message: string): Promise<void> {
    if (!this.contextRetrievalEnabled) return;
    await this.deps.contextRetriever!.addMessage(message);
  }

  /** Clear the context retrieval window (e.g. on conversation reset). */
  clearContext(): void {
    if (this.deps.contextRetriever) {
      this.deps.contextRetriever.clear();
    }
    if (this.deps.workingMemoryBuffer) {
      this.deps.workingMemoryBuffer.clear();
    }
  }

  // ── Working Memory (Phase 125-B) ─────────────────────────

  /** Get items currently in the working memory buffer. */
  getWorkingMemoryItems(): { id: string; content: string; score: number; source: string }[] {
    if (!this.workingMemoryEnabled) return [];
    return this.deps.workingMemoryBuffer!.getItems();
  }

  /** Get working memory stats. */
  getWorkingMemoryStats(): { size: number; prefetchSize: number; trajectorySize: number } {
    if (!this.deps.workingMemoryBuffer) {
      return { size: 0, prefetchSize: 0, trajectorySize: 0 };
    }
    return {
      size: this.deps.workingMemoryBuffer.size,
      prefetchSize: this.deps.workingMemoryBuffer.prefetchSize,
      trajectorySize: this.deps.workingMemoryBuffer.trajectorySize,
    };
  }

  // ── Salience Classification (Phase 125-C) ────────────────

  /**
   * Classify the salience/emotion of a text. Returns dimension scores.
   */
  async classifySalience(text: string): Promise<SalienceScores | null> {
    if (!this.salienceEnabled) return null;
    return this.deps.salienceClassifier!.classify(text);
  }

  /**
   * Get cached salience scores for a memory (if previously classified).
   */
  async getMemorySalience(memoryId: string): Promise<SalienceScores | null> {
    try {
      const raw = await this.storage.getMeta(`salience:${memoryId}`);
      if (!raw) return null;
      return JSON.parse(raw) as SalienceScores;
    } catch {
      return null;
    }
  }

  // ── Retrieval Optimizer (Phase 141) ──────────────────────

  recordRetrievalFeedback(positive: boolean): void {
    this.deps.retrievalOptimizer?.recordFeedback(positive);
  }

  getOptimizerStats(): ReturnType<import('./retrieval-optimizer.js').RetrievalOptimizer['getStats']> | null {
    return this.deps.retrievalOptimizer?.getStats() ?? null;
  }

  // ── Reconsolidation (Phase 141) ────────────────────────────

  getReconsolidationStats(): ReturnType<import('./reconsolidation.js').ReconsolidationManager['getStats']> | null {
    return this.deps.reconsolidationManager?.getStats() ?? null;
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
