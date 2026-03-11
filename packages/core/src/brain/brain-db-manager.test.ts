import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { BrainStorage } from './storage.js';
import { BrainManager } from './manager.js';
import type { BrainConfig } from '@secureyeoman/shared';
import type { BrainManagerDeps } from './types.js';
import type { SecureLogger } from '../logging/logger.js';
import { AuditChain, InMemoryAuditStorage } from '../logging/audit-chain.js';
import { setupTestDb, teardownTestDb, truncateAllTables } from '../test-setup.js';

// ── Helpers ──────────────────────────────────────────────────────

function noopLogger(): SecureLogger {
  const noop = () => {};
  return {
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    child: () => noopLogger(),
    level: 'silent',
  } as SecureLogger;
}

function defaultConfig(overrides?: Partial<BrainConfig>): BrainConfig {
  return {
    enabled: true,
    maxMemories: 10000,
    maxKnowledge: 5000,
    maxContentLength: 4096,
    memoryRetentionDays: 90,
    importanceDecayRate: 0.01,
    contextWindowMemories: 10,
    ...overrides,
  };
}

function createDeps(): BrainManagerDeps {
  const auditStorage = new InMemoryAuditStorage();
  const auditChain = new AuditChain({
    storage: auditStorage,
    signingKey: 'test-signing-key-must-be-at-least-32-chars!!',
  });
  return {
    auditChain,
    logger: noopLogger(),
  };
}

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

    it('should reject oversized content', async () => {
      const mgr = new BrainManager(storage, defaultConfig(), createDeps());
      const oversized = 'x'.repeat(5000);
      await expect(mgr.remember('semantic', oversized, 'test')).rejects.toThrow(
        'exceeds maximum length'
      );
    });

    it('should prune lowest-importance memory when at capacity', async () => {
      const mgr = new BrainManager(storage, defaultConfig({ maxMemories: 3 }), createDeps());
      await mgr.remember('semantic', 'Low priority', 'test', {}, 0.1);
      await mgr.remember('semantic', 'Medium priority', 'test', {}, 0.5);
      await mgr.remember('semantic', 'High priority', 'test', {}, 0.9);

      // At capacity — adding a new one should prune the lowest (0.1)
      await mgr.remember('semantic', 'New entry', 'test', {}, 0.6);

      const all = await mgr.recall({});
      expect(all).toHaveLength(3);
      const contents = all.map((m) => m.content);
      expect(contents).not.toContain('Low priority');
      expect(contents).toContain('High priority');
      expect(contents).toContain('New entry');
    });

    it('should throw when brain is disabled', async () => {
      const mgr = new BrainManager(storage, defaultConfig({ enabled: false }), createDeps());
      await expect(mgr.remember('semantic', 'Test', 'test')).rejects.toThrow(
        'Brain is not enabled'
      );
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

    it('should reject oversized knowledge content', async () => {
      const oversized = 'x'.repeat(5000);
      await expect(manager.learn('topic', oversized, 'test')).rejects.toThrow(
        'exceeds maximum length'
      );
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
      const s = await manager.createSkill({
        name: 's1',
        source: 'ai_proposed',
        status: 'pending_approval',
        enabled: false,
      });
      const approved = await manager.approveSkill(s.id);
      expect(approved.status).toBe('active');
    });

    it('should reject pending skills', async () => {
      const s = await manager.createSkill({
        name: 's1',
        source: 'ai_proposed',
        status: 'pending_approval',
        enabled: false,
      });
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
        tools: [
          { name: 'search', description: 'Search', parameters: { type: 'object', properties: {} } },
        ],
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

    it('should return vectorSynced in maintenance result', async () => {
      await manager.remember('episodic', 'Event', 'test');
      const result = await manager.runMaintenance();
      expect(result).toHaveProperty('vectorSynced');
    });
  });

  describe('seedBaseKnowledge', () => {
    const personalities = [
      { id: 'p-friday', name: 'FRIDAY' },
      { id: 'p-tron', name: 'T.Ron' },
    ];

    it('should seed global entries and per-personality self-identity', async () => {
      await manager.seedBaseKnowledge(personalities);
      const all = await manager.queryKnowledge({});

      const topics = all.map((k) => k.topic);
      expect(topics).toContain('self-identity');
      expect(topics).toContain('hierarchy');
      expect(topics).toContain('purpose');
      expect(topics).toContain('interaction');

      // Each personality gets their own scoped self-identity
      const selfIds = all.filter((k) => k.topic === 'self-identity');
      expect(selfIds.some((k) => k.personalityId === 'p-friday')).toBe(true);
      expect(selfIds.some((k) => k.personalityId === 'p-tron')).toBe(true);

      // No global self-identity
      expect(selfIds.some((k) => k.personalityId === null)).toBe(false);
    });

    it('should seed correct name in self-identity content', async () => {
      await manager.seedBaseKnowledge(personalities);
      const all = await manager.queryKnowledge({});
      const fridayId = all.find(
        (k) => k.topic === 'self-identity' && k.personalityId === 'p-friday'
      );
      const tronId = all.find((k) => k.topic === 'self-identity' && k.personalityId === 'p-tron');
      expect(fridayId?.content).toBe('I am FRIDAY');
      expect(tronId?.content).toBe('I am T.Ron');
    });

    it('should be idempotent on repeat calls', async () => {
      await manager.seedBaseKnowledge(personalities);
      const firstCount = (await manager.queryKnowledge({})).length;
      await manager.seedBaseKnowledge(personalities);
      const secondCount = (await manager.queryKnowledge({})).length;
      expect(secondCount).toBe(firstCount);
    });

    it('should seed 3 generic entries without personalities', async () => {
      await manager.seedBaseKnowledge([]);
      const all = await manager.queryKnowledge({});
      expect(all.length).toBe(3);
      expect(all.map((k) => k.topic)).not.toContain('self-identity');
    });

    it('should not seed when brain is disabled', async () => {
      const mgr = new BrainManager(storage, defaultConfig({ enabled: false }), createDeps());
      await mgr.seedBaseKnowledge(personalities);
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
