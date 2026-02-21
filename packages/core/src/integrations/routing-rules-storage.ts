/**
 * RoutingRulesStorage — PostgreSQL persistence for cross-integration routing rules.
 *
 * ADR 087
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import { uuidv7 } from '../utils/crypto.js';
import type { RoutingRule, RoutingRuleCreate, RoutingRuleUpdate } from '@secureyeoman/shared';

interface DbRow {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  priority: number;
  trigger_platforms: unknown;
  trigger_integration_ids: unknown;
  trigger_chat_id_pattern: string | null;
  trigger_sender_id_pattern: string | null;
  trigger_keyword_pattern: string | null;
  trigger_direction: string;
  action_type: string;
  action_target_integration_id: string | null;
  action_target_chat_id: string | null;
  action_personality_id: string | null;
  action_webhook_url: string | null;
  action_message_template: string | null;
  match_count: number;
  last_matched_at: number | null;
  created_at: number;
  updated_at: number;
}

function rowToRule(r: DbRow): RoutingRule {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    enabled: r.enabled,
    priority: r.priority,
    triggerPlatforms: (r.trigger_platforms as string[]) ?? [],
    triggerIntegrationIds: (r.trigger_integration_ids as string[]) ?? [],
    triggerChatIdPattern: r.trigger_chat_id_pattern,
    triggerSenderIdPattern: r.trigger_sender_id_pattern,
    triggerKeywordPattern: r.trigger_keyword_pattern,
    triggerDirection: r.trigger_direction as RoutingRule['triggerDirection'],
    actionType: r.action_type as RoutingRule['actionType'],
    actionTargetIntegrationId: r.action_target_integration_id,
    actionTargetChatId: r.action_target_chat_id,
    actionPersonalityId: r.action_personality_id,
    actionWebhookUrl: r.action_webhook_url,
    actionMessageTemplate: r.action_message_template,
    matchCount: r.match_count,
    lastMatchedAt: r.last_matched_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export class RoutingRulesStorage extends PgBaseStorage {
  async list(opts: { enabled?: boolean; limit?: number; offset?: number } = {}): Promise<{
    rules: RoutingRule[];
    total: number;
  }> {
    const { enabled, limit = 100, offset = 0 } = opts;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let p = 1;

    if (enabled !== undefined) {
      conditions.push(`enabled = $${p++}`);
      params.push(enabled);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await this.queryMany<DbRow>(
      `SELECT * FROM routing_rules ${where}
       ORDER BY priority ASC, created_at ASC
       LIMIT $${p++} OFFSET $${p++}`,
      [...params, limit, offset]
    );

    const countRows = await this.queryMany<{ total: number }>(
      `SELECT COUNT(*)::integer AS total FROM routing_rules ${where}`,
      params
    );

    return { rules: rows.map(rowToRule), total: countRows[0]?.total ?? 0 };
  }

  async get(id: string): Promise<RoutingRule | null> {
    const row = await this.queryOne<DbRow>('SELECT * FROM routing_rules WHERE id = $1', [id]);
    return row ? rowToRule(row) : null;
  }

  async create(data: RoutingRuleCreate): Promise<RoutingRule> {
    const id = uuidv7();
    const now = Date.now();

    await this.execute(
      `INSERT INTO routing_rules (
         id, name, description, enabled, priority,
         trigger_platforms, trigger_integration_ids,
         trigger_chat_id_pattern, trigger_sender_id_pattern, trigger_keyword_pattern,
         trigger_direction,
         action_type, action_target_integration_id, action_target_chat_id,
         action_personality_id, action_webhook_url, action_message_template,
         match_count, last_matched_at, created_at, updated_at
       ) VALUES (
         $1,$2,$3,$4,$5,
         $6::jsonb,$7::jsonb,
         $8,$9,$10,
         $11,
         $12,$13,$14,
         $15,$16,$17,
         0,NULL,$18,$18
       )`,
      [
        id,
        data.name,
        data.description ?? '',
        data.enabled ?? true,
        data.priority ?? 100,
        JSON.stringify(data.triggerPlatforms ?? []),
        JSON.stringify(data.triggerIntegrationIds ?? []),
        data.triggerChatIdPattern ?? null,
        data.triggerSenderIdPattern ?? null,
        data.triggerKeywordPattern ?? null,
        data.triggerDirection ?? 'inbound',
        data.actionType,
        data.actionTargetIntegrationId ?? null,
        data.actionTargetChatId ?? null,
        data.actionPersonalityId ?? null,
        data.actionWebhookUrl ?? null,
        data.actionMessageTemplate ?? null,
        now,
      ]
    );

    return (await this.get(id))!;
  }

  async update(id: string, data: RoutingRuleUpdate): Promise<RoutingRule | null> {
    const existing = await this.get(id);
    if (!existing) return null;

    const now = Date.now();
    await this.execute(
      `UPDATE routing_rules SET
         name = $2, description = $3, enabled = $4, priority = $5,
         trigger_platforms = $6::jsonb, trigger_integration_ids = $7::jsonb,
         trigger_chat_id_pattern = $8, trigger_sender_id_pattern = $9,
         trigger_keyword_pattern = $10, trigger_direction = $11,
         action_type = $12, action_target_integration_id = $13,
         action_target_chat_id = $14, action_personality_id = $15,
         action_webhook_url = $16, action_message_template = $17,
         updated_at = $18
       WHERE id = $1`,
      [
        id,
        data.name ?? existing.name,
        data.description ?? existing.description,
        data.enabled ?? existing.enabled,
        data.priority ?? existing.priority,
        JSON.stringify(data.triggerPlatforms ?? existing.triggerPlatforms),
        JSON.stringify(data.triggerIntegrationIds ?? existing.triggerIntegrationIds),
        data.triggerChatIdPattern ?? existing.triggerChatIdPattern,
        data.triggerSenderIdPattern ?? existing.triggerSenderIdPattern,
        data.triggerKeywordPattern ?? existing.triggerKeywordPattern,
        data.triggerDirection ?? existing.triggerDirection,
        data.actionType ?? existing.actionType,
        data.actionTargetIntegrationId ?? existing.actionTargetIntegrationId,
        data.actionTargetChatId ?? existing.actionTargetChatId,
        data.actionPersonalityId ?? existing.actionPersonalityId,
        data.actionWebhookUrl ?? existing.actionWebhookUrl,
        data.actionMessageTemplate ?? existing.actionMessageTemplate,
        now,
      ]
    );

    return this.get(id);
  }

  async delete(id: string): Promise<boolean> {
    const count = await this.execute('DELETE FROM routing_rules WHERE id = $1', [id]);
    return count > 0;
  }

  /** Increment match_count and update last_matched_at for a rule. */
  async recordMatch(id: string): Promise<void> {
    await this.execute(
      `UPDATE routing_rules
       SET match_count = match_count + 1, last_matched_at = $2, updated_at = $2
       WHERE id = $1`,
      [id, Date.now()]
    );
  }

  /** Fetch all enabled rules sorted by priority (for evaluation). */
  async listEnabled(): Promise<RoutingRule[]> {
    const rows = await this.queryMany<DbRow>(
      'SELECT * FROM routing_rules WHERE enabled = true ORDER BY priority ASC',
      []
    );
    return rows.map(rowToRule);
  }
}
