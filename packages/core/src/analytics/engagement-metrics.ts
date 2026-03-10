/**
 * EngagementMetricsService — on-demand SQL queries for conversation engagement
 * KPIs (Phase 96). No background interval; purely request-driven.
 */

import type { Pool } from 'pg';

export interface EngagementResult {
  personalityId: string | null;
  periodDays: number;
  avgConversationLength: number;
  followUpRate: number;
  abandonmentRate: number;
  toolCallSuccessRate: number;
  totalConversations: number;
}

const ABANDONMENT_STALE_HOURS = 24;

export class EngagementMetricsService {
  constructor(private readonly pool: Pool) {}

  async getMetrics(personalityId: string | null, periodDays: number): Promise<EngagementResult> {
    const personalityFilter = personalityId ? `AND c.personality_id = $2` : '';
    const params: unknown[] = [periodDays];
    if (personalityId) params.push(personalityId);

    // Avg message count per conversation
    const avgResult = await this.pool.query<{ avg: number | null; total: string }>(
      `SELECT AVG(msg_count)::real AS avg, COUNT(*)::text AS total
       FROM (
         SELECT c.id, COUNT(m.id)::int AS msg_count
         FROM   chat.conversations c
         JOIN   chat.messages m ON m.conversation_id = c.id
         WHERE  c.created_at >= NOW() - ($1 || ' days')::interval
           ${personalityFilter}
         GROUP BY c.id
       ) sub`,
      params
    );
    const avgConversationLength = avgResult.rows[0]?.avg ?? 0;
    const totalConversations = Number(avgResult.rows[0]?.total ?? 0);

    // Follow-up rate: conversations with > 2 messages / total
    const followUpResult = await this.pool.query<{ follow_ups: string }>(
      `SELECT COUNT(*)::text AS follow_ups
       FROM (
         SELECT c.id
         FROM   chat.conversations c
         JOIN   chat.messages m ON m.conversation_id = c.id
         WHERE  c.created_at >= NOW() - ($1 || ' days')::interval
           ${personalityFilter}
         GROUP BY c.id
         HAVING COUNT(m.id) > 2
       ) sub`,
      params
    );
    const followUps = Number(followUpResult.rows[0]?.follow_ups ?? 0);
    const followUpRate = totalConversations > 0 ? followUps / totalConversations : 0;

    // Abandonment rate: conversations with <= 2 messages and stale updated_at
    const abandonResult = await this.pool.query<{ abandoned: string }>(
      `SELECT COUNT(*)::text AS abandoned
       FROM (
         SELECT c.id
         FROM   chat.conversations c
         JOIN   chat.messages m ON m.conversation_id = c.id
         WHERE  c.created_at >= NOW() - ($1 || ' days')::interval
           AND  c.updated_at < NOW() - interval '24 hours'
           ${personalityFilter}
         GROUP BY c.id, c.updated_at
         HAVING COUNT(m.id) <= 2
       ) sub`,
      params
    );
    const abandoned = Number(abandonResult.rows[0]?.abandoned ?? 0);
    const abandonmentRate = totalConversations > 0 ? abandoned / totalConversations : 0;

    // Tool call success rate from messages with tool_calls_json
    const toolResult = await this.pool.query<{ total_calls: string; successful: string }>(
      `SELECT
         COUNT(*)::text AS total_calls,
         COUNT(*) FILTER (WHERE (tc->>'success')::boolean = true)::text AS successful
       FROM   chat.messages m
       JOIN   chat.conversations c ON c.id = m.conversation_id,
              jsonb_array_elements(
                CASE WHEN m.tool_calls_json IS NOT NULL AND m.tool_calls_json != 'null'
                     THEN m.tool_calls_json ELSE '[]'::jsonb END
              ) AS tc
       WHERE  c.created_at >= NOW() - ($1 || ' days')::interval
         ${personalityFilter}`,
      params
    );
    const totalCalls = Number(toolResult.rows[0]?.total_calls ?? 0);
    const successful = Number(toolResult.rows[0]?.successful ?? 0);
    const toolCallSuccessRate = totalCalls > 0 ? successful / totalCalls : 0;

    return {
      personalityId,
      periodDays,
      avgConversationLength: Math.round(avgConversationLength * 100) / 100,
      followUpRate: Math.round(followUpRate * 10000) / 10000,
      abandonmentRate: Math.round(abandonmentRate * 10000) / 10000,
      toolCallSuccessRate: Math.round(toolCallSuccessRate * 10000) / 10000,
      totalConversations,
    };
  }
}
