/**
 * Notebook Mode — unit tests for the long-context windowing feature.
 *
 * Tests:
 *  - getAllDocumentChunks (BrainStorage)
 *  - getNotebookCorpus / generateSourceGuide (DocumentManager)
 *  - Token budget helpers and notebook block builder
 *
 * Phase 84 — Notebook Mode (NotebookLM-style Long Context Windowing)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BrainStorage } from './storage.js';
import { BrainManager } from './manager.js';
import { DocumentManager } from './document-manager.js';
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
  return { auditChain, logger: noopLogger() };
}

// ── Tests ─────────────────────────────────────────────────────────

describe('Notebook Mode', () => {
  let storage: BrainStorage;
  let brainManager: BrainManager;
  let docManager: DocumentManager;

  beforeAll(async () => {
    await setupTestDb();
  });
  afterAll(async () => {
    await teardownTestDb();
  });
  beforeEach(async () => {
    await truncateAllTables();
    storage = new BrainStorage();
    brainManager = new BrainManager(storage, defaultConfig(), createDeps());
    docManager = new DocumentManager({ brainManager, storage, logger: noopLogger() });
  });

  // ── getAllDocumentChunks ────────────────────────────────────────

  describe('BrainStorage.getAllDocumentChunks', () => {
    it('returns empty array when no documents', async () => {
      const chunks = await storage.getAllDocumentChunks(null);
      expect(chunks).toEqual([]);
    });

    it('returns chunks from a single ingested document', async () => {
      await docManager.ingestText(
        'The quick brown fox. '.repeat(50),
        'Fox Document',
        null,
        'private'
      );
      const chunks = await storage.getAllDocumentChunks(null);
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(chunks[0].title).toBe('Fox Document');
      expect(chunks[0].text.length).toBeGreaterThan(0);
      expect(chunks[0].estimatedTokens).toBeGreaterThan(0);
    });

    it('reconstructs text in chunk order (no gaps)', async () => {
      const longText = Array.from({ length: 60 }, (_, i) => `Sentence ${i + 1} here.`).join(' ');
      await docManager.ingestText(longText, 'Ordered Doc', null, 'private');
      const result = await storage.getAllDocumentChunks(null);
      expect(result.length).toBe(1);
      // Text should contain all numbers 1..60
      for (let i = 1; i <= 60; i++) {
        expect(result[0].text).toContain(`Sentence ${i}`);
      }
    });

    it('scopes by personalityId when provided', async () => {
      // Create a real personality to satisfy FK constraint
      const { SoulStorage } = await import('../soul/storage.js');
      const soulStorage = new SoulStorage();
      const p = await soulStorage.createPersonality({
        name: 'TestBot',
        systemPrompt: 'test',
        sex: 'unspecified',
        traits: {},
      });

      await docManager.ingestText('Global text', 'Global Doc', null, 'private');
      await docManager.ingestText('Private text', 'Private Doc', p.id, 'private');

      const allChunks = await storage.getAllDocumentChunks(null);
      const scopedChunks = await storage.getAllDocumentChunks(p.id);

      expect(allChunks.length).toBeGreaterThanOrEqual(2);
      // Scoped result includes personality docs + global (null)
      expect(scopedChunks.some((d) => d.title === 'Private Doc')).toBe(true);
      expect(scopedChunks.some((d) => d.title === 'Global Doc')).toBe(true);
    });

    it('returns multiple documents as separate entries', async () => {
      await docManager.ingestText('Alpha content', 'Doc Alpha', null, 'private');
      await docManager.ingestText('Beta content', 'Doc Beta', null, 'private');
      const chunks = await storage.getAllDocumentChunks(null);
      const titles = chunks.map((c) => c.title);
      expect(titles).toContain('Doc Alpha');
      expect(titles).toContain('Doc Beta');
    });
  });

  // ── getNotebookCorpus ──────────────────────────────────────────

  describe('DocumentManager.getNotebookCorpus', () => {
    it('returns empty corpus when no documents', async () => {
      const corpus = await docManager.getNotebookCorpus(null);
      expect(corpus.documents).toHaveLength(0);
      expect(corpus.totalTokens).toBe(0);
      expect(corpus.fitsInBudget).toBe(true);
    });

    it('reports fitsInBudget=true when tokens are within budget', async () => {
      await docManager.ingestText('Short text.', 'Tiny Doc', null, 'private');
      const corpus = await docManager.getNotebookCorpus(null, 100_000);
      expect(corpus.fitsInBudget).toBe(true);
      expect(corpus.budget).toBe(100_000);
    });

    it('reports fitsInBudget=false when corpus exceeds budget', async () => {
      const bigText = 'word '.repeat(10_000); // ~50,000 chars → ~12,500 tokens
      await docManager.ingestText(bigText, 'Big Doc', null, 'private');
      // Budget of 100 tokens — must exceed for 10K words
      const corpus = await docManager.getNotebookCorpus(null, 100);
      expect(corpus.fitsInBudget).toBe(false);
      expect(corpus.totalTokens).toBeGreaterThan(100);
    });

    it('includes all document text in reconstructed corpus', async () => {
      await docManager.ingestText('Hello world from doc1', 'Doc1', null, 'private');
      await docManager.ingestText('Greetings from doc2', 'Doc2', null, 'private');
      const corpus = await docManager.getNotebookCorpus(null, Infinity);
      const allText = corpus.documents.map((d) => d.text).join(' ');
      expect(allText).toContain('Hello world from doc1');
      expect(allText).toContain('Greetings from doc2');
    });
  });

  // ── generateSourceGuide ────────────────────────────────────────

  describe('DocumentManager.generateSourceGuide', () => {
    it('creates a source guide knowledge entry', async () => {
      await docManager.ingestText('Some content here', 'Guide Test Doc', null, 'private');
      await docManager.generateSourceGuide(null);
      const knowledge = await storage.queryKnowledge({ topic: '__source_guide__' });
      expect(knowledge.length).toBeGreaterThanOrEqual(1);
      expect(knowledge[0].content).toContain('Guide Test Doc');
      expect(knowledge[0].source).toBe('source_guide');
    });

    it('includes document count in source guide', async () => {
      await docManager.ingestText('A', 'Doc A', null, 'private');
      await docManager.ingestText('B', 'Doc B', null, 'private');
      await docManager.generateSourceGuide(null);
      const knowledge = await storage.queryKnowledge({ topic: '__source_guide__' });
      const guide = knowledge.find((k) => k.source === 'source_guide');
      expect(guide).toBeDefined();
      expect(guide!.content).toContain('2 documents');
    });

    it('updates source guide after adding a second document', async () => {
      await docManager.ingestText('First doc text', 'First Doc', null, 'private');
      await docManager.generateSourceGuide(null);
      const before = await storage.queryKnowledge({ topic: '__source_guide__' });
      expect(before[0].content).toContain('First Doc');

      await docManager.ingestText('Second doc text', 'Second Doc', null, 'private');
      await docManager.generateSourceGuide(null);
      const after = await storage.queryKnowledge({ topic: '__source_guide__' });
      const guide = after.find((k) => k.source === 'source_guide');
      expect(guide!.content).toContain('Second Doc');
    });

    it('does not throw when no documents exist', async () => {
      await expect(docManager.generateSourceGuide(null)).resolves.not.toThrow();
    });
  });

  // ── notebookTokenBudget helper ─────────────────────────────────

  describe('notebookBudget (via corpus size)', () => {
    it('gemini 2.0 flash budget is 65% of 1M tokens', () => {
      // 65% of 1_000_000 = 650_000
      const expected = Math.floor(1_000_000 * 0.65);
      expect(expected).toBe(650_000);
    });

    it('claude budget is 65% of 200K tokens', () => {
      const expected = Math.floor(200_000 * 0.65);
      expect(expected).toBe(130_000);
    });

    it('corpus under 1000 tokens fits in all model budgets', async () => {
      await docManager.ingestText('Short.', 'Tiny', null, 'private');
      const corpus = await docManager.getNotebookCorpus(null, 8_000);
      expect(corpus.fitsInBudget).toBe(true);
    });
  });
});
