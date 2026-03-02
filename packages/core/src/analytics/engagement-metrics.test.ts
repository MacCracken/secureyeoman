/**
 * engagement-metrics.test.ts — Unit tests for EngagementMetricsService (Phase 96).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EngagementMetricsService } from './engagement-metrics.js';

const mockQuery = vi.fn();
const mockPool = { query: mockQuery } as any;

describe('EngagementMetricsService', () => {
  let service: EngagementMetricsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new EngagementMetricsService(mockPool);
  });

  describe('getMetrics', () => {
    it('computes all engagement KPIs for a personality', async () => {
      // avg + total
      mockQuery
        .mockResolvedValueOnce({ rows: [{ avg: 8.5, total: '100' }] })
        // follow-ups
        .mockResolvedValueOnce({ rows: [{ follow_ups: '60' }] })
        // abandoned
        .mockResolvedValueOnce({ rows: [{ abandoned: '15' }] })
        // tool calls
        .mockResolvedValueOnce({ rows: [{ total_calls: '200', successful: '180' }] });

      const result = await service.getMetrics('p1', 30);
      expect(result.personalityId).toBe('p1');
      expect(result.periodDays).toBe(30);
      expect(result.avgConversationLength).toBe(8.5);
      expect(result.totalConversations).toBe(100);
      expect(result.followUpRate).toBe(0.6);
      expect(result.abandonmentRate).toBe(0.15);
      expect(result.toolCallSuccessRate).toBe(0.9);
    });

    it('computes global metrics when personalityId is null', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ avg: 5.0, total: '50' }] })
        .mockResolvedValueOnce({ rows: [{ follow_ups: '20' }] })
        .mockResolvedValueOnce({ rows: [{ abandoned: '10' }] })
        .mockResolvedValueOnce({ rows: [{ total_calls: '0', successful: '0' }] });

      const result = await service.getMetrics(null, 7);
      expect(result.personalityId).toBeNull();
      expect(result.avgConversationLength).toBe(5.0);
      expect(result.followUpRate).toBe(0.4);
      expect(result.abandonmentRate).toBe(0.2);
      expect(result.toolCallSuccessRate).toBe(0);
    });

    it('returns zeros when no conversations exist', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ avg: null, total: '0' }] })
        .mockResolvedValueOnce({ rows: [{ follow_ups: '0' }] })
        .mockResolvedValueOnce({ rows: [{ abandoned: '0' }] })
        .mockResolvedValueOnce({ rows: [{ total_calls: '0', successful: '0' }] });

      const result = await service.getMetrics('p1', 30);
      expect(result.avgConversationLength).toBe(0);
      expect(result.followUpRate).toBe(0);
      expect(result.abandonmentRate).toBe(0);
      expect(result.toolCallSuccessRate).toBe(0);
      expect(result.totalConversations).toBe(0);
    });

    it('rounds rates to 4 decimal places', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ avg: 3.333, total: '3' }] })
        .mockResolvedValueOnce({ rows: [{ follow_ups: '1' }] })
        .mockResolvedValueOnce({ rows: [{ abandoned: '1' }] })
        .mockResolvedValueOnce({ rows: [{ total_calls: '7', successful: '3' }] });

      const result = await service.getMetrics('p1', 30);
      expect(result.followUpRate).toBe(0.3333);
      expect(result.abandonmentRate).toBe(0.3333);
      expect(result.toolCallSuccessRate).toBe(0.4286);
    });

    it('uses personalityId filter in queries', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ avg: 1, total: '1' }] })
        .mockResolvedValueOnce({ rows: [{ follow_ups: '0' }] })
        .mockResolvedValueOnce({ rows: [{ abandoned: '0' }] })
        .mockResolvedValueOnce({ rows: [{ total_calls: '0', successful: '0' }] });

      await service.getMetrics('test-personality', 14);
      // All four queries should have personality filter
      for (const call of mockQuery.mock.calls) {
        expect(call[0]).toContain('personality_id');
        expect(call[1]).toContain('test-personality');
      }
    });
  });
});
