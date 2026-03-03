/**
 * BrainManager Performance Benchmarks
 *
 * Core operations with mocked dependencies: remember, recall, getEnabledSkills.
 *
 * Run:  cd packages/core && npx vitest bench
 */

import { bench, describe, vi } from 'vitest';
import { BrainManager } from './manager.js';
import type { BrainStorage } from './storage.js';
import type { BrainConfig } from '@secureyeoman/shared';

// ── Mocked storage ───────────────────────────────────────────────────────────

function makeMockStorage(): BrainStorage {
  return {
    storeMemory: vi.fn().mockResolvedValue({
      id: 'mem-1',
      type: 'episodic',
      content: 'test',
      source: 'bench',
      createdAt: Date.now(),
      importance: 0.5,
    }),
    queryMemories: vi.fn().mockResolvedValue([]),
    findMemoriesByType: vi.fn().mockResolvedValue([]),
    getMemoryStats: vi.fn().mockResolvedValue({ total: 100, byType: {} }),
    deleteMemory: vi.fn().mockResolvedValue(true),
    getSkill: vi.fn().mockResolvedValue(null),
    getSkillByName: vi.fn().mockResolvedValue(null),
    getEnabledSkills: vi.fn().mockResolvedValue([
      { id: 'sk-1', name: 'search', enabled: true, category: 'utility', instructions: 'Search.' },
      {
        id: 'sk-2',
        name: 'summarize',
        enabled: true,
        category: 'utility',
        instructions: 'Summarize.',
      },
      { id: 'sk-3', name: 'code', enabled: true, category: 'utility', instructions: 'Write code.' },
    ]),
    addSkill: vi.fn().mockResolvedValue({
      id: 'sk-new',
      name: 'test',
      enabled: true,
    }),
    updateSkill: vi.fn().mockResolvedValue(true),
    deleteSkill: vi.fn().mockResolvedValue(true),
    storeKnowledge: vi.fn().mockResolvedValue('k-1'),
    queryKnowledge: vi.fn().mockResolvedValue([]),
    deleteKnowledge: vi.fn().mockResolvedValue(true),
    getKnowledgeStats: vi.fn().mockResolvedValue({ totalEntries: 0 }),
    deleteKnowledgeBySourcePrefix: vi.fn().mockResolvedValue(0),
    logKnowledgeQuery: vi.fn().mockResolvedValue(undefined),
    getKnowledgeHealthStats: vi.fn().mockResolvedValue({ total: 0, avgScore: 0 }),
  } as unknown as BrainStorage;
}

const mockConfig = {
  enabled: true,
  maxMemories: 10000,
  maxKnowledge: 5000,
  memoryRetentionDays: 90,
  importanceDecayRate: 0.01,
  contextWindowMemories: 10,
  maxContentLength: 4096,
  importanceFloor: 0.05,
  consolidation: { enabled: false },
  vector: { enabled: false },
} as unknown as BrainConfig;

const mockDeps = {
  auditChain: { record: vi.fn() },
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
} as any;

// ── Benchmarks ────────────────────────────────────────────────────────────────

describe('BrainManager — remember (mocked storage)', () => {
  const manager = new BrainManager(makeMockStorage(), mockConfig, mockDeps);

  bench('remember short content', async () => {
    await manager.remember('episodic', 'Short fact about security.', 'bench');
  });

  bench('remember medium content (500 chars)', async () => {
    const content = 'Security is important for web applications. '.repeat(11);
    await manager.remember('episodic', content, 'bench');
  });
});

describe('BrainManager — recall (mocked storage)', () => {
  const manager = new BrainManager(makeMockStorage(), mockConfig, mockDeps);

  bench('recall with empty results', async () => {
    await manager.recall({ search: 'What do you know about security?' });
  });
});

describe('BrainManager — getEnabledSkills (mocked storage)', () => {
  const manager = new BrainManager(makeMockStorage(), mockConfig, mockDeps);

  bench('getEnabledSkills', async () => {
    await manager.getEnabledSkills();
  });
});
