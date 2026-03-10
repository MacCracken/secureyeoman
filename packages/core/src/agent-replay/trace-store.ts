/**
 * Trace Store — PostgreSQL persistence for execution traces.
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import { buildWhere, parseCount } from '../storage/query-helpers.js';
import type { ExecutionTrace, TraceStep } from '@secureyeoman/shared';

function rowToTrace(row: Record<string, unknown>): ExecutionTrace {
  return {
    id: row.id as string,
    conversationId: (row.conversation_id as string) ?? undefined,
    personalityId: (row.personality_id as string) ?? undefined,
    personalityName: (row.personality_name as string) ?? undefined,
    model: row.model as string,
    provider: row.provider as string,
    input: row.input as string,
    output: row.output as string,
    steps: (row.steps as TraceStep[]) ?? [],
    totalDurationMs: (row.total_duration_ms as number) ?? 0,
    totalInputTokens: (row.total_input_tokens as number) ?? 0,
    totalOutputTokens: (row.total_output_tokens as number) ?? 0,
    totalCostUsd: (row.total_cost_usd as number) ?? 0,
    toolIterations: (row.tool_iterations as number) ?? 0,
    success: row.success as boolean,
    errorMessage: (row.error_message as string) ?? undefined,
    tags: (row.tags as string[]) ?? [],
    label: (row.label as string) ?? undefined,
    isReplay: (row.is_replay as boolean) ?? false,
    sourceTraceId: (row.source_trace_id as string) ?? undefined,
    createdAt: (row.created_at as number) ?? 0,
    tenantId: (row.tenant_id as string) ?? 'default',
  };
}

export class TraceStore extends PgBaseStorage {
  async saveTrace(trace: ExecutionTrace): Promise<void> {
    await this.execute(
      `INSERT INTO agent_replay.traces (
        id, conversation_id, personality_id, personality_name,
        model, provider, input, output, steps,
        total_duration_ms, total_input_tokens, total_output_tokens,
        total_cost_usd, tool_iterations, success, error_message,
        tags, label, is_replay, source_trace_id,
        created_at, tenant_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
      [
        trace.id,
        trace.conversationId ?? null,
        trace.personalityId ?? null,
        trace.personalityName ?? null,
        trace.model,
        trace.provider,
        trace.input,
        trace.output,
        JSON.stringify(trace.steps),
        trace.totalDurationMs,
        trace.totalInputTokens,
        trace.totalOutputTokens,
        trace.totalCostUsd,
        trace.toolIterations,
        trace.success,
        trace.errorMessage ?? null,
        JSON.stringify(trace.tags),
        trace.label ?? null,
        trace.isReplay,
        trace.sourceTraceId ?? null,
        trace.createdAt,
        trace.tenantId,
      ]
    );
  }

  async getTrace(id: string, tenantId = 'default'): Promise<ExecutionTrace | null> {
    const row = await this.queryOne<Record<string, unknown>>(
      'SELECT * FROM agent_replay.traces WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );
    return row ? rowToTrace(row) : null;
  }

  async listTraces(
    opts: {
      conversationId?: string;
      personalityId?: string;
      tags?: string[];
      isReplay?: boolean;
      tenantId?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ items: ExecutionTrace[]; total: number }> {
    // tenant_id is always present as $1; optional filters start at $2
    const tenantId = opts.tenantId ?? 'default';
    const {
      where: optWhere,
      values: optValues,
      nextIdx,
    } = buildWhere(
      [
        { column: 'conversation_id', value: opts.conversationId },
        { column: 'personality_id', value: opts.personalityId },
        { column: 'is_replay', value: opts.isReplay },
        { column: 'tags', value: opts.tags?.length ? opts.tags : undefined, op: '?|' },
      ],
      2
    );

    const allValues: unknown[] = [tenantId, ...optValues];
    const where = optWhere
      ? `WHERE tenant_id = $1 AND ${optWhere.slice(6)}` // strip "WHERE " prefix
      : 'WHERE tenant_id = $1';

    const countResult = await this.queryOne<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count FROM agent_replay.traces ${where}`,
      allValues
    );
    const total = parseCount(countResult);

    const limit = Math.min(opts.limit ?? 50, 200);
    const offset = opts.offset ?? 0;
    let idx = nextIdx;

    // List view omits steps for performance
    const rows = await this.queryMany<Record<string, unknown>>(
      `SELECT id, conversation_id, personality_id, personality_name,
              model, provider, input, output, '[]'::jsonb AS steps,
              total_duration_ms, total_input_tokens, total_output_tokens,
              total_cost_usd, tool_iterations, success, error_message,
              tags, label, is_replay, source_trace_id, created_at, tenant_id
       FROM agent_replay.traces ${where}
       ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      [...allValues, limit, offset]
    );

    return { items: rows.map(rowToTrace), total };
  }

  async deleteTrace(id: string, tenantId = 'default'): Promise<boolean> {
    const count = await this.execute(
      'DELETE FROM agent_replay.traces WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );
    return count > 0;
  }

  async deleteOldTraces(retentionDays: number, tenantId = 'default'): Promise<number> {
    const cutoff = Date.now() - retentionDays * 86_400_000;
    return this.execute(
      'DELETE FROM agent_replay.traces WHERE created_at < $1 AND tenant_id = $2',
      [cutoff, tenantId]
    );
  }

  async getReplayChain(traceId: string, tenantId = 'default'): Promise<ExecutionTrace[]> {
    // Walk the sourceTraceId chain
    const chain: ExecutionTrace[] = [];
    let currentId: string | undefined = traceId;

    while (currentId && chain.length < 20) {
      const trace = await this.getTrace(currentId, tenantId);
      if (!trace) break;
      chain.push(trace);
      currentId = trace.sourceTraceId;
    }

    return chain.reverse();
  }
}
