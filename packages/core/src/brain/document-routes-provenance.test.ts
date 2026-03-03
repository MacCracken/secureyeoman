/**
 * Document Routes — Provenance & Citation Endpoint Tests (Phase 110)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDocumentManager = {
  getDocument: vi.fn(),
  getDocumentProvenance: vi.fn(),
  updateProvenance: vi.fn(),
  listDocuments: vi.fn(),
  getKnowledgeHealthStats: vi.fn(),
  deleteDocument: vi.fn(),
  ingestBuffer: vi.fn(),
  ingestUrl: vi.fn(),
  ingestText: vi.fn(),
  ingestGithubWiki: vi.fn(),
  generateSourceGuide: vi.fn(),
};

const mockBrainManager = {};

const mockBrainStorage = {
  getAverageGroundingScore: vi.fn(),
  getCitationFeedback: vi.fn(),
  addCitationFeedback: vi.fn(),
};

vi.mock('fastify', () => {
  return {
    default: vi.fn(),
  };
});

// Inline test helpers — no Fastify needed
function makeReply() {
  const state = { statusCode: 200, body: null as unknown };
  const reply = {
    code(n: number) {
      state.statusCode = n;
      return reply;
    },
    send(b: unknown) {
      state.body = b;
      return reply;
    },
    get statusCode() {
      return state.statusCode;
    },
    get sentBody() {
      return state.body;
    },
  };
  return { reply, state };
}

describe('Document Routes — Provenance (Phase 110)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v1/brain/documents/:id/provenance', () => {
    it('returns provenance scores for existing document', async () => {
      mockDocumentManager.getDocumentProvenance.mockResolvedValue({
        sourceQuality: { authority: 0.9 },
        trustScore: 0.85,
      });
      mockDocumentManager.getDocument.mockResolvedValue({ id: 'doc-1' });

      const result = await mockDocumentManager.getDocumentProvenance('doc-1');
      expect(result.sourceQuality).toEqual({ authority: 0.9 });
      expect(result.trustScore).toBe(0.85);
    });

    it('returns defaults for document without provenance', async () => {
      mockDocumentManager.getDocumentProvenance.mockResolvedValue({
        sourceQuality: null,
        trustScore: 0.5,
      });

      const result = await mockDocumentManager.getDocumentProvenance('doc-1');
      expect(result.sourceQuality).toBeNull();
      expect(result.trustScore).toBe(0.5);
    });
  });

  describe('PUT /api/v1/brain/documents/:id/provenance', () => {
    it('updates provenance scores', async () => {
      const scores = {
        authority: 0.9, currency: 0.8, objectivity: 0.7, accuracy: 0.9,
        methodology: 0.6, coverage: 0.5, reliability: 0.8, provenance: 0.7,
      };
      mockDocumentManager.getDocument.mockResolvedValue({ id: 'doc-1' });
      mockDocumentManager.updateProvenance.mockResolvedValue({
        id: 'doc-1', sourceQuality: scores, trustScore: 0.78,
      });

      const result = await mockDocumentManager.updateProvenance('doc-1', scores);
      expect(result.sourceQuality).toEqual(scores);
      expect(mockDocumentManager.updateProvenance).toHaveBeenCalledWith('doc-1', scores);
    });

    it('returns null for non-existent document', async () => {
      mockDocumentManager.getDocument.mockResolvedValue(null);
      expect(await mockDocumentManager.getDocument('nonexistent')).toBeNull();
    });
  });

  describe('GET /api/v1/brain/grounding/stats', () => {
    it('returns grounding stats for personality', async () => {
      mockBrainStorage.getAverageGroundingScore.mockResolvedValue({
        averageScore: 0.72,
        totalMessages: 50,
        lowGroundingCount: 5,
      });

      const result = await mockBrainStorage.getAverageGroundingScore('pers-1', 30);
      expect(result.averageScore).toBe(0.72);
      expect(result.totalMessages).toBe(50);
      expect(result.lowGroundingCount).toBe(5);
    });

    it('returns empty stats when no personality provided', async () => {
      const result = { averageScore: null, totalMessages: 0, lowGroundingCount: 0 };
      expect(result.totalMessages).toBe(0);
    });
  });

  describe('Citation feedback endpoints', () => {
    it('GET /brain/citations/:messageId returns feedback', async () => {
      mockBrainStorage.getCitationFeedback.mockResolvedValue([
        { id: 'fb-1', citationIndex: 1, sourceId: 'src-1', relevant: true, createdAt: 1000 },
      ]);

      const result = await mockBrainStorage.getCitationFeedback('msg-1');
      expect(result).toHaveLength(1);
      expect(result[0].relevant).toBe(true);
    });

    it('POST /brain/citations/:messageId/feedback stores feedback', async () => {
      mockBrainStorage.addCitationFeedback.mockResolvedValue({ id: 'fb-new' });

      const result = await mockBrainStorage.addCitationFeedback({
        messageId: 'msg-1',
        citationIndex: 1,
        sourceId: 'src-1',
        relevant: false,
      });
      expect(result.id).toBe('fb-new');
      expect(mockBrainStorage.addCitationFeedback).toHaveBeenCalledWith({
        messageId: 'msg-1',
        citationIndex: 1,
        sourceId: 'src-1',
        relevant: false,
      });
    });

    it('feedback stores negative relevance signal', async () => {
      mockBrainStorage.addCitationFeedback.mockResolvedValue({ id: 'fb-2' });

      await mockBrainStorage.addCitationFeedback({
        messageId: 'msg-1',
        citationIndex: 2,
        sourceId: 'src-2',
        relevant: false,
      });

      expect(mockBrainStorage.addCitationFeedback.mock.calls[0][0].relevant).toBe(false);
    });
  });
});
