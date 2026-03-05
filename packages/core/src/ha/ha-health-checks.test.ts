/**
 * HA Health Checks tests — Phase 137
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock pg-pool
const mockQuery = vi.fn();
vi.mock('../storage/pg-pool.js', () => ({
  getPool: () => ({ query: mockQuery }),
  getReadPool: () => ({ query: mockQuery }),
  hasReadReplicas: vi.fn(() => false),
  getReplicaCount: vi.fn(() => 0),
}));

vi.mock('../logging/logger.js', () => ({
  getLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import {
  checkReplicationLag,
  checkVectorStore,
  checkCertExpiry,
  checkReadReplicas,
  runHaHealthChecks,
} from './ha-health-checks.js';

import * as pgPool from '../storage/pg-pool.js';

describe('HA Health Checks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkReplicationLag', () => {
    it('returns ok when no replicas configured', async () => {
      vi.mocked(pgPool.hasReadReplicas).mockReturnValue(false);
      const result = await checkReplicationLag(10_000);
      expect(result.ok).toBe(true);
      expect(result.detail).toContain('No read replicas');
    });

    it('returns ok when lag is within threshold', async () => {
      vi.mocked(pgPool.hasReadReplicas).mockReturnValue(true);
      mockQuery
        .mockResolvedValueOnce({ rows: [{ lag_bytes: '100' }] })
        .mockResolvedValueOnce({ rows: [{ lag_ms: 500 }] });

      const result = await checkReplicationLag(10_000);
      expect(result.ok).toBe(true);
      expect(result.detail).toContain('500ms lag');
    });

    it('returns not-ok when lag exceeds threshold', async () => {
      vi.mocked(pgPool.hasReadReplicas).mockReturnValue(true);
      mockQuery
        .mockResolvedValueOnce({ rows: [{ lag_bytes: '999999' }] })
        .mockResolvedValueOnce({ rows: [{ lag_ms: 15000 }] });

      const result = await checkReplicationLag(10_000);
      expect(result.ok).toBe(false);
      expect(result.detail).toContain('EXCEEDED');
    });

    it('handles errors gracefully', async () => {
      vi.mocked(pgPool.hasReadReplicas).mockReturnValue(true);
      mockQuery.mockRejectedValueOnce(new Error('connection refused'));

      const result = await checkReplicationLag(10_000);
      expect(result.ok).toBe(true);
      expect(result.detail).toContain('skipped');
    });
  });

  describe('checkVectorStore', () => {
    it('returns ok when pgvector is operational', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ has_pgvector: true }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await checkVectorStore();
      expect(result.ok).toBe(true);
      expect(result.detail).toContain('pgvector operational');
    });

    it('returns ok when pgvector not installed', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ has_pgvector: false }] });

      const result = await checkVectorStore();
      expect(result.ok).toBe(true);
      expect(result.detail).toContain('not installed');
    });

    it('returns not-ok on query failure', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ has_pgvector: true }] })
        .mockRejectedValueOnce(new Error('type vector does not exist'));

      const result = await checkVectorStore();
      expect(result.ok).toBe(false);
      expect(result.detail).toContain('failed');
    });
  });

  describe('checkCertExpiry', () => {
    it('returns ok when no cert configured', () => {
      const result = checkCertExpiry();
      expect(result.ok).toBe(true);
      expect(result.detail).toContain('No TLS certificate');
    });

    it('returns not-ok for non-existent cert', () => {
      const result = checkCertExpiry('/nonexistent/cert.pem');
      expect(result.ok).toBe(false);
      expect(result.detail).toContain('failed');
    });
  });

  describe('checkReadReplicas', () => {
    it('returns ok with no replicas configured', () => {
      vi.mocked(pgPool.hasReadReplicas).mockReturnValue(false);
      const result = checkReadReplicas();
      expect(result.ok).toBe(true);
      expect(result.detail).toContain('No read replicas');
    });

    it('returns active count when replicas configured', () => {
      vi.mocked(pgPool.hasReadReplicas).mockReturnValue(true);
      vi.mocked(pgPool.getReplicaCount).mockReturnValue(3);
      const result = checkReadReplicas();
      expect(result.ok).toBe(true);
      expect(result.detail).toContain('3 read replica');
    });
  });

  describe('runHaHealthChecks', () => {
    it('aggregates all checks', async () => {
      vi.mocked(pgPool.hasReadReplicas).mockReturnValue(false);
      mockQuery.mockResolvedValue({ rows: [{ has_pgvector: false }] });

      const result = await runHaHealthChecks({ maxReplicationLagMs: 10_000 });
      expect(result).toHaveProperty('replicationLag');
      expect(result).toHaveProperty('vectorStore');
      expect(result).toHaveProperty('certExpiry');
      expect(result).toHaveProperty('readReplicas');
    });
  });
});
