import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { BrainStorage } from './storage.js';
import { BrainManager } from './manager.js';
import type { BrainConfig } from '@friday/shared';
import type { BrainManagerDeps } from './types.js';
import type { SecureLogger } from '../logging/logger.js';
import { AuditChain, InMemoryAuditStorage } from '../logging/audit-chain.js';
import { setupTestDb, teardownTestDb, truncateAllTables } from '../test-setup.js';

// ── Helpers ──────────────────────────────────────────────────────

function noopLogger(): SecureLogger {
  const noop = () => {};
  return {
    trace: noop, debug: noop, info: noop, warn: noop, error: noop, fatal: noop,
    child: () => noopLogger(),
    level: 'silent',
  } as SecureLogger;
}

function defaultConfig(overrides?: Partial<BrainConfig>): BrainConfig {
  return {
    enabled: true,
    maxMemories: 10000,
    maxKnowledge: 5000,
    memoryRetentionDays: 90,
    importanceDecayRate: 0.01,
    contextWindowMemories: 10,
    ...overrides,
  };
}

function createDeps(): BrainManagerDeps {
  const auditStorage = new InMemoryAuditStorage();
  const auditChain = new AuditChain({ storage: auditStorage, signingKey: 'test-signing-key-must-be-at-least-32-chars!!' });
  return {
    auditChain,
    logger: noopLogger(),
  };
}

// ── BrainStorage Tests ────────────────────────────────────────────

describe('BrainStorage', () => {
  let storage: BrainStorage;

  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await truncateAllTables();
    storage = new BrainStorage();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  describe('memories', () => {
    it('should create and retrieve a memory', async () => {
      const m = await storage.createMemory({
        type: 'episodic',
        content: 'User asked about deploying to production',
        source: 'conversation',
      });
      expect(m.id).toBeDefined();
      expect(m.type).toBe('episodic');
      expect(m.content).toContain('deploying');
      expect(m.source).toBe('conversation');
      expect(m.importance).toBe(0.5);
      expect(m.accessCount).toBe(0);

      const retrieved = await storage.getMemory(m.id);
      expect(retrieved).toEqual(m);
    });

    it('should return null for non-existent memory', async () => {
      expect(await storage.getMemory('nonexistent')).toBeNull();
    });

    it('should create memory with custom importance', async () => {
      const m = await storage.createMemory({
        type: 'semantic',
        content: 'Project uses React 18',
        source: 'observation',
        importance: 0.9,
      });
      expect(m.importance).toBe(0.9);
    });

    it('should create memory with context', async () => {
      const m = await storage.createMemory({
        type: 'preference',
        content: 'User prefers concise answers',
        source: 'user',
        context: { userId: 'user1', topic: 'style' },
      });
      expect(m.context).toEqual({ userId: 'user1', topic: 'style' });
    });

    it('should create memory with expiration', async () => {
      const expires = Date.now() + 86_400_000;
      const m = await storage.createMemory({
        type: 'episodic',
        content: 'Temporary event',
        source: 'event',
        expiresAt: expires,
      });
      expect(m.expiresAt).toBe(expires);
    });

    it('should delete a memory', async () => {
      const m = await storage.createMemory({
        type: 'semantic',
        content: 'Test',
        source: 'test',
      });
      expect(await storage.deleteMemory(m.id)).toBe(true);
      expect(await storage.getMemory(m.id)).toBeNull();
    });

    it('should return false deleting non-existent memory', async () => {
      expect(await storage.deleteMemory('nonexistent')).toBe(false);
    });

    it('should query memories by type', async () => {
      await storage.createMemory({ type: 'episodic', content: 'Event 1', source: 'test' });
      await storage.createMemory({ type: 'semantic', content: 'Fact 1', source: 'test' });
      await storage.createMemory({ type: 'episodic', content: 'Event 2', source: 'test' });

      const episodic = await storage.queryMemories({ type: 'episodic' });
      expect(episodic).toHaveLength(2);
    });

    it('should query memories by search', async () => {
      await storage.createMemory({ type: 'semantic', content: 'React 18 framework', source: 'test' });
      await storage.createMemory({ type: 'semantic', content: 'Vue 3 framework', source: 'test' });

      const results = await storage.queryMemories({ search: 'React' });
      expect(results).toHaveLength(1);
      expect(results[0].content).toContain('React');
    });

    it('should query memories with minImportance', async () => {
      await storage.createMemory({ type: 'semantic', content: 'Low', source: 'test', importance: 0.2 });
      await storage.createMemory({ type: 'semantic', content: 'High', source: 'test', importance: 0.8 });

      const results = await storage.queryMemories({ minImportance: 0.5 });
      expect(results).toHaveLength(1);
      expect(results[0].content).toBe('High');
    });

    it('should query memories with limit', async () => {
      for (let i = 0; i < 5; i++) {
        await storage.createMemory({ type: 'episodic', content: `Event ${i}`, source: 'test' });
      }
      const results = await storage.queryMemories({ limit: 3 });
      expect(results).toHaveLength(3);
    });

    it('should touch memory (update access count)', async () => {
      const m = await storage.createMemory({ type: 'semantic', content: 'Test', source: 'test' });
      await storage.touchMemory(m.id);
      await storage.touchMemory(m.id);

      const updated = await storage.getMemory(m.id);
      expect(updated?.accessCount).toBe(2);
      expect(updated?.lastAccessedAt).toBeGreaterThan(0);
    });

    it('should batch-touch multiple memories in a single call', async () => {
      const m1 = await storage.createMemory({ type: 'semantic', content: 'Memory 1', source: 'test' });
      const m2 = await storage.createMemory({ type: 'semantic', content: 'Memory 2', source: 'test' });
      const m3 = await storage.createMemory({ type: 'episodic', content: 'Memory 3', source: 'test' });

      await storage.touchMemories([m1.id, m2.id, m3.id]);

      expect((await storage.getMemory(m1.id))?.accessCount).toBe(1);
      expect((await storage.getMemory(m2.id))?.accessCount).toBe(1);
      expect((await storage.getMemory(m3.id))?.accessCount).toBe(1);
      expect((await storage.getMemory(m1.id))?.lastAccessedAt).toBeGreaterThan(0);
    });

    it('should handle empty array in touchMemories', async () => {
      // Should not throw
      await storage.touchMemories([]);
    });

    it('should decay memories', async () => {
      const m = await storage.createMemory({
        type: 'semantic',
        content: 'Old fact',
        source: 'test',
        importance: 0.5,
      });

      const decayed = await storage.decayMemories(0.1);
      expect(decayed).toBe(1);

      const updated = await storage.getMemory(m.id);
      expect(updated?.importance).toBe(0.4);
    });

    it('should prune expired memories', async () => {
      await storage.createMemory({
        type: 'episodic',
        content: 'Expired',
        source: 'test',
        expiresAt: Date.now() - 1000,
      });
      await storage.createMemory({
        type: 'semantic',
        content: 'Active',
        source: 'test',
      });

      const pruned = await storage.pruneExpiredMemories();
      expect(pruned).toBe(1);
      expect(await storage.getMemoryCount()).toBe(1);
    });

    it('should count memories', async () => {
      expect(await storage.getMemoryCount()).toBe(0);
      await storage.createMemory({ type: 'semantic', content: 'Test', source: 'test' });
      expect(await storage.getMemoryCount()).toBe(1);
    });

    it('should count memories by type', async () => {
      await storage.createMemory({ type: 'episodic', content: 'E1', source: 'test' });
      await storage.createMemory({ type: 'episodic', content: 'E2', source: 'test' });
      await storage.createMemory({ type: 'semantic', content: 'S1', source: 'test' });

      const counts = await storage.getMemoryCountByType();
      expect(counts.episodic).toBe(2);
      expect(counts.semantic).toBe(1);
    });
  });

  describe('knowledge', () => {
    it('should create and retrieve knowledge', async () => {
      const k = await storage.createKnowledge({
        topic: 'deployment',
        content: 'Production uses Docker Compose',
        source: 'documentation',
      });
      expect(k.id).toBeDefined();
      expect(k.topic).toBe('deployment');
      expect(k.confidence).toBe(0.8);

      const retrieved = await storage.getKnowledge(k.id);
      expect(retrieved).toEqual(k);
    });

    it('should return null for non-existent knowledge', async () => {
      expect(await storage.getKnowledge('nonexistent')).toBeNull();
    });

    it('should create knowledge with custom confidence', async () => {
      const k = await storage.createKnowledge({
        topic: 'api',
        content: 'REST endpoint on port 18789',
        source: 'config',
        confidence: 1.0,
      });
      expect(k.confidence).toBe(1.0);
    });

    it('should query knowledge by topic', async () => {
      await storage.createKnowledge({ topic: 'deployment', content: 'Docker', source: 'test' });
      await storage.createKnowledge({ topic: 'security', content: 'TLS', source: 'test' });

      const results = await storage.queryKnowledge({ topic: 'deployment' });
      expect(results).toHaveLength(1);
      expect(results[0].topic).toBe('deployment');
    });

    it('should query knowledge by search', async () => {
      await storage.createKnowledge({ topic: 'tech', content: 'Uses React 18', source: 'test' });
      await storage.createKnowledge({ topic: 'tech', content: 'Uses Vue 3', source: 'test' });

      const results = await storage.queryKnowledge({ search: 'React' });
      expect(results).toHaveLength(1);
    });

    it('should update knowledge', async () => {
      const k = await storage.createKnowledge({
        topic: 'api',
        content: 'Port 3000',
        source: 'test',
      });
      const updated = await storage.updateKnowledge(k.id, { content: 'Port 18789', confidence: 0.95 });
      expect(updated.content).toBe('Port 18789');
      expect(updated.confidence).toBe(0.95);
    });

    it('should update knowledge with supersedes', async () => {
      const old = await storage.createKnowledge({ topic: 'api', content: 'v1', source: 'test' });
      const newer = await storage.createKnowledge({ topic: 'api', content: 'v2', source: 'test' });
      const updated = await storage.updateKnowledge(newer.id, { supersedes: old.id });
      expect(updated.supersedes).toBe(old.id);
    });

    it('should throw when updating non-existent knowledge', async () => {
      await expect(storage.updateKnowledge('nonexistent', { content: 'X' })).rejects.toThrow('Knowledge not found');
    });

    it('should delete knowledge', async () => {
      const k = await storage.createKnowledge({ topic: 'test', content: 'Test', source: 'test' });
      expect(await storage.deleteKnowledge(k.id)).toBe(true);
      expect(await storage.getKnowledge(k.id)).toBeNull();
    });

    it('should count knowledge', async () => {
      expect(await storage.getKnowledgeCount()).toBe(0);
      await storage.createKnowledge({ topic: 'test', content: 'Test', source: 'test' });
      expect(await storage.getKnowledgeCount()).toBe(1);
    });
  });

  describe('skills', () => {
    it('should create and retrieve a skill', async () => {
      const s = await storage.createSkill({
        name: 'code-review',
        description: 'Reviews code',
        instructions: 'Review the code carefully.',
        tools: [],
        triggerPatterns: ['review'],
        enabled: true,
        source: 'user',
        status: 'active',
      });
      expect(s.id).toBeDefined();
      expect(s.name).toBe('code-review');

      const retrieved = await storage.getSkill(s.id);
      expect(retrieved).toEqual(s);
    });

    it('should list enabled skills', async () => {
      await storage.createSkill({ name: 's1', enabled: true, source: 'user', status: 'active' });
      await storage.createSkill({ name: 's2', enabled: false, source: 'user', status: 'active' });

      const enabled = await storage.getEnabledSkills();
      expect(enabled).toHaveLength(1);
      expect(enabled[0].name).toBe('s1');
    });

    it('should increment usage', async () => {
      const s = await storage.createSkill({ name: 's1', source: 'user', status: 'active' });
      await storage.incrementUsage(s.id);
      const updated = await storage.getSkill(s.id);
      expect(updated?.usageCount).toBe(1);
    });
  });

  describe('brain meta', () => {
    it('should get and set meta', async () => {
      expect(await storage.getMeta('test')).toBeNull();
      await storage.setMeta('test', 'value');
      expect(await storage.getMeta('test')).toBe('value');
    });

    it('should overwrite meta', async () => {
      await storage.setMeta('key', 'v1');
      await storage.setMeta('key', 'v2');
      expect(await storage.getMeta('key')).toBe('v2');
    });
  });

  describe('stats', () => {
    it('should return brain stats', async () => {
      await storage.createMemory({ type: 'semantic', content: 'Test', source: 'test' });
      await storage.createKnowledge({ topic: 'test', content: 'Test', source: 'test' });
      await storage.createSkill({ name: 's1', source: 'user', status: 'active' });

      const stats = await storage.getStats();
      expect(stats.memories.total).toBe(1);
      expect(stats.knowledge.total).toBe(1);
      expect(stats.skills.total).toBe(1);
    });
  });
});

// ── BrainManager Tests ────────────────────────────────────────────

describe('BrainManager', () => {
  let storage: BrainStorage;
  let manager: BrainManager;

  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await truncateAllTables();
    storage = new BrainStorage();
    manager = new BrainManager(storage, defaultConfig(), createDeps());
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  describe('memory operations', () => {
    it('should remember and recall', async () => {
      const m = await manager.remember('semantic', 'React is a UI framework', 'learning');
      expect(m.type).toBe('semantic');

      const recalled = await manager.recall({ type: 'semantic' });
      expect(recalled).toHaveLength(1);
      expect(recalled[0].content).toContain('React');
    });

    it('should forget a memory', async () => {
      const m = await manager.remember('episodic', 'Test event', 'test');
      await manager.forget(m.id);
      expect(await manager.getMemory(m.id)).toBeNull();
    });

    it('should add expiration to episodic memories', async () => {
      const m = await manager.remember('episodic', 'Event', 'test');
      expect(m.expiresAt).toBeGreaterThan(Date.now());
    });

    it('should not add expiration to semantic memories', async () => {
      const m = await manager.remember('semantic', 'Fact', 'test');
      expect(m.expiresAt).toBeNull();
    });

    it('should touch memories on recall', async () => {
      const m = await manager.remember('semantic', 'Test', 'test');
      await manager.recall({ type: 'semantic' });

      const updated = await manager.getMemory(m.id);
      expect(updated?.accessCount).toBe(1);
    });

    it('should batch-touch memories on recall', async () => {
      const m1 = await manager.remember('semantic', 'First memory', 'test');
      const m2 = await manager.remember('semantic', 'Second memory', 'test');
      const m3 = await manager.remember('semantic', 'Third memory', 'test');

      await manager.recall({ type: 'semantic' });

      // All memories should be touched in a single batch
      expect((await manager.getMemory(m1.id))?.accessCount).toBe(1);
      expect((await manager.getMemory(m2.id))?.accessCount).toBe(1);
      expect((await manager.getMemory(m3.id))?.accessCount).toBe(1);
    });

    it('should throw when brain is disabled', async () => {
      const mgr = new BrainManager(storage, defaultConfig({ enabled: false }), createDeps());
      await expect(mgr.remember('semantic', 'Test', 'test')).rejects.toThrow('Brain is not enabled');
    });

    it('should return empty on recall when disabled', async () => {
      const mgr = new BrainManager(storage, defaultConfig({ enabled: false }), createDeps());
      expect(await mgr.recall({})).toEqual([]);
    });
  });

  describe('knowledge operations', () => {
    it('should learn and lookup', async () => {
      await manager.learn('deployment', 'Uses Docker', 'docs');
      const results = await manager.lookup('deployment');
      expect(results).toHaveLength(1);
      expect(results[0].content).toBe('Uses Docker');
    });

    it('should throw when max knowledge reached', async () => {
      const mgr = new BrainManager(storage, defaultConfig({ maxKnowledge: 2 }), createDeps());
      await mgr.learn('t1', 'c1', 's');
      await mgr.learn('t2', 'c2', 's');
      await expect(mgr.learn('t3', 'c3', 's')).rejects.toThrow('Maximum knowledge limit');
    });

    it('should update knowledge', async () => {
      const k = await manager.learn('api', 'Port 3000', 'test');
      const updated = await manager.updateKnowledge(k.id, { content: 'Port 18789' });
      expect(updated.content).toBe('Port 18789');
    });

    it('should delete knowledge', async () => {
      const k = await manager.learn('test', 'Test', 'test');
      await manager.deleteKnowledge(k.id);
      expect(await manager.lookup('test')).toHaveLength(0);
    });

    it('should query knowledge', async () => {
      await manager.learn('tech', 'React 18', 'test');
      await manager.learn('tech', 'Vue 3', 'test');

      const results = await manager.queryKnowledge({ search: 'React' });
      expect(results).toHaveLength(1);
    });
  });

  describe('prompt integration', () => {
    it('should return relevant context for input', async () => {
      await manager.remember('semantic', 'React is used for the frontend', 'observation');
      await manager.learn('frontend', 'React 18 framework', 'docs');

      const context = await manager.getRelevantContext('React');
      expect(context).toContain('## Brain');
      expect(context).toContain('Your Brain is your mind');
      expect(context).toContain('### Memories');
      expect(context).toContain('React');
    });

    it('should return empty when disabled', async () => {
      const mgr = new BrainManager(storage, defaultConfig({ enabled: false }), createDeps());
      expect(await mgr.getRelevantContext('anything')).toBe('');
    });

    it('should return empty when no matches', async () => {
      const context = await manager.getRelevantContext('nonexistent topic xyz');
      expect(context).toBe('');
    });

    it('should batch-touch memories in getRelevantContext', async () => {
      const m1 = await manager.remember('semantic', 'React component lifecycle', 'test');
      const m2 = await manager.remember('semantic', 'React hooks patterns', 'test');

      await manager.getRelevantContext('React');

      // Both memories should have been touched via batch update
      expect((await manager.getMemory(m1.id))?.accessCount).toBe(1);
      expect((await manager.getMemory(m2.id))?.accessCount).toBe(1);
    });
  });

  describe('skill operations', () => {
    it('should create and get skills', async () => {
      const s = await manager.createSkill({ name: 'test-skill', source: 'user', status: 'active' });
      expect((await manager.getSkill(s.id))?.name).toBe('test-skill');
    });

    it('should list and filter skills', async () => {
      await manager.createSkill({ name: 's1', source: 'user', status: 'active' });
      await manager.createSkill({ name: 's2', source: 'ai_proposed', status: 'pending_approval' });

      expect(await manager.listSkills()).toHaveLength(2);
      expect(await manager.listSkills({ source: 'user' })).toHaveLength(1);
    });

    it('should enable and disable skills', async () => {
      const s = await manager.createSkill({ name: 's1', source: 'user', status: 'active' });
      await manager.disableSkill(s.id);
      expect((await manager.getSkill(s.id))?.enabled).toBe(false);
      await manager.enableSkill(s.id);
      expect((await manager.getSkill(s.id))?.enabled).toBe(true);
    });

    it('should approve pending skills', async () => {
      const s = await manager.createSkill({ name: 's1', source: 'ai_proposed', status: 'pending_approval', enabled: false });
      const approved = await manager.approveSkill(s.id);
      expect(approved.status).toBe('active');
    });

    it('should reject pending skills', async () => {
      const s = await manager.createSkill({ name: 's1', source: 'ai_proposed', status: 'pending_approval', enabled: false });
      await manager.rejectSkill(s.id);
      expect(await manager.getSkill(s.id)).toBeNull();
    });

    it('should throw when approving non-pending skill', async () => {
      const s = await manager.createSkill({ name: 's1', source: 'user', status: 'active' });
      await expect(manager.approveSkill(s.id)).rejects.toThrow('not pending approval');
    });

    it('should get active tools from enabled skills', async () => {
      await manager.createSkill({
        name: 's1',
        source: 'user',
        status: 'active',
        tools: [{ name: 'search', description: 'Search', parameters: { type: 'object', properties: {} } }],
      });
      const tools = await manager.getActiveTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('search');
    });

    it('should increment skill usage', async () => {
      const s = await manager.createSkill({ name: 's1', source: 'user', status: 'active' });
      await manager.incrementSkillUsage(s.id);
      expect((await manager.getSkill(s.id))?.usageCount).toBe(1);
    });
  });

  describe('maintenance', () => {
    it('should run maintenance (decay + prune)', async () => {
      await manager.remember('episodic', 'Old event', 'test');
      const result = await manager.runMaintenance();
      expect(result).toHaveProperty('decayed');
      expect(result).toHaveProperty('pruned');
    });
  });

  describe('seedBaseKnowledge', () => {
    it('should seed foundational knowledge entries', async () => {
      await manager.seedBaseKnowledge();
      const all = await manager.queryKnowledge({});
      expect(all.length).toBeGreaterThanOrEqual(4);

      const topics = all.map(k => k.topic);
      expect(topics).toContain('self-identity');
      expect(topics).toContain('hierarchy');
      expect(topics).toContain('purpose');
      expect(topics).toContain('interaction');
    });

    it('should be idempotent on repeat calls', async () => {
      await manager.seedBaseKnowledge();
      const firstCount = (await manager.queryKnowledge({})).length;
      await manager.seedBaseKnowledge();
      const secondCount = (await manager.queryKnowledge({})).length;
      expect(secondCount).toBe(firstCount);
    });

    it('should not seed when brain is disabled', async () => {
      const mgr = new BrainManager(storage, defaultConfig({ enabled: false }), createDeps());
      await mgr.seedBaseKnowledge();
      expect(await storage.getKnowledgeCount()).toBe(0);
    });
  });

  describe('stats', () => {
    it('should return stats', async () => {
      await manager.remember('semantic', 'Test', 'test');
      await manager.learn('topic', 'Content', 'test');

      const stats = await manager.getStats();
      expect(stats.memories.total).toBe(1);
      expect(stats.knowledge.total).toBe(1);
    });
  });
});
