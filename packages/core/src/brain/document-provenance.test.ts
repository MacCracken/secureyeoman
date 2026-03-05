/**
 * Document Manager — Provenance Tests (Phase 110)
 *
 * Tests the provenance scoring and trust score computation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DocumentManager } from './document-manager.js';
import type { BrainManager } from './manager.js';
import type { BrainStorage } from './storage.js';
import type { ProvenanceScores } from '@secureyeoman/shared';

const mockStorage = {
  getDocument: vi.fn(),
  updateDocumentProvenance: vi.fn(),
  listDocuments: vi.fn(),
  createDocument: vi.fn(),
  updateDocument: vi.fn(),
  deleteDocument: vi.fn(),
  deleteKnowledgeBySourcePrefix: vi.fn(),
  getAllDocumentChunks: vi.fn(),
  logKnowledgeQuery: vi.fn(),
  getKnowledgeHealthStats: vi.fn(),
} as unknown as BrainStorage;

const mockBrainManager = {
  learn: vi.fn(),
} as unknown as BrainManager;

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: () => mockLogger,
} as any;

describe('DocumentManager — Provenance (Phase 110)', () => {
  let manager: DocumentManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new DocumentManager({
      brainManager: mockBrainManager,
      storage: mockStorage,
      logger: mockLogger,
    });
  });

  describe('updateProvenance', () => {
    it('computes weighted trust score from provenance dimensions', async () => {
      const scores: ProvenanceScores = {
        authority: 1.0,
        currency: 1.0,
        objectivity: 1.0,
        accuracy: 1.0,
        methodology: 1.0,
        coverage: 1.0,
        reliability: 1.0,
        provenance: 1.0,
      };

      vi.mocked(mockStorage.updateDocumentProvenance).mockResolvedValue({
        id: 'doc-1',
        sourceQuality: scores,
        trustScore: 1.0,
      } as any);

      await manager.updateProvenance('doc-1', scores);

      expect(mockStorage.updateDocumentProvenance).toHaveBeenCalledWith(
        'doc-1',
        scores,
        expect.closeTo(1.0, 2)
      );
    });

    it('computes weighted average correctly for mixed scores', async () => {
      const scores: ProvenanceScores = {
        authority: 0.8, // weight 0.20 → 0.16
        currency: 0.6, // weight 0.10 → 0.06
        objectivity: 0.7, // weight 0.10 → 0.07
        accuracy: 0.9, // weight 0.20 → 0.18
        methodology: 0.5, // weight 0.10 → 0.05
        coverage: 0.4, // weight 0.05 → 0.02
        reliability: 0.8, // weight 0.15 → 0.12
        provenance: 0.7, // weight 0.10 → 0.07
      };
      // Expected: 0.16 + 0.06 + 0.07 + 0.18 + 0.05 + 0.02 + 0.12 + 0.07 = 0.73

      vi.mocked(mockStorage.updateDocumentProvenance).mockResolvedValue(null);

      await manager.updateProvenance('doc-1', scores);

      const call = vi.mocked(mockStorage.updateDocumentProvenance).mock.calls[0]!;
      expect(call[2]).toBeCloseTo(0.73, 2);
    });

    it('computes trust score of 0.5 for all-neutral scores', async () => {
      const scores: ProvenanceScores = {
        authority: 0.5,
        currency: 0.5,
        objectivity: 0.5,
        accuracy: 0.5,
        methodology: 0.5,
        coverage: 0.5,
        reliability: 0.5,
        provenance: 0.5,
      };

      vi.mocked(mockStorage.updateDocumentProvenance).mockResolvedValue(null);

      await manager.updateProvenance('doc-1', scores);

      const call = vi.mocked(mockStorage.updateDocumentProvenance).mock.calls[0]!;
      expect(call[2]).toBeCloseTo(0.5, 2);
    });

    it('returns the updated document', async () => {
      const scores: ProvenanceScores = {
        authority: 0.9,
        currency: 0.8,
        objectivity: 0.7,
        accuracy: 0.9,
        methodology: 0.6,
        coverage: 0.5,
        reliability: 0.8,
        provenance: 0.7,
      };
      const mockDoc = { id: 'doc-1', trustScore: 0.75, sourceQuality: scores };

      vi.mocked(mockStorage.updateDocumentProvenance).mockResolvedValue(mockDoc as any);

      const result = await manager.updateProvenance('doc-1', scores);
      expect(result).toEqual(mockDoc);
    });
  });

  describe('getDocumentProvenance', () => {
    it('returns provenance scores for existing document', async () => {
      vi.mocked(mockStorage.getDocument).mockResolvedValue({
        id: 'doc-1',
        sourceQuality: { authority: 0.9 },
        trustScore: 0.85,
      } as any);

      const result = await manager.getDocumentProvenance('doc-1');
      expect(result.sourceQuality).toEqual({ authority: 0.9 });
      expect(result.trustScore).toBe(0.85);
    });

    it('returns null/0.5 for document without provenance', async () => {
      vi.mocked(mockStorage.getDocument).mockResolvedValue({
        id: 'doc-1',
        sourceQuality: null,
        trustScore: 0.5,
      } as any);

      const result = await manager.getDocumentProvenance('doc-1');
      expect(result.sourceQuality).toBeNull();
      expect(result.trustScore).toBe(0.5);
    });

    it('returns defaults when document not found', async () => {
      vi.mocked(mockStorage.getDocument).mockResolvedValue(null);

      const result = await manager.getDocumentProvenance('nonexistent');
      expect(result.sourceQuality).toBeNull();
      expect(result.trustScore).toBe(0.5);
    });
  });
});
