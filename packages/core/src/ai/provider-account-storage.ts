/**
 * ProviderAccountStorage — PostgreSQL storage for AI provider accounts
 * and per-account cost tracking (Phase 112).
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import type {
  ProviderAccount,
  ProviderAccountCreate,
  ProviderAccountUpdate,
  AccountCostSummary,
  CostTrendPoint,
} from '@secureyeoman/shared';
import crypto from 'node:crypto';

// ─── Row types ─────────────────────────────────────────────────

interface ProviderAccountRow {
  id: string;
  provider: string;
  label: string;
  secret_name: string;
  is_default: boolean;
  account_info: Record<string, unknown> | null;
  status: string;
  last_validated_at: string | null;
  base_url: string | null;
  tenant_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface CostSummaryRow {
  account_id: string;
  provider: string;
  label: string;
  total_cost_usd: string;
  total_input_tokens: string;
  total_output_tokens: string;
  total_requests: string;
}

interface CostTrendRow {
  date: string;
  cost_usd: string;
  requests: string;
}

// ─── Converters ────────────────────────────────────────────────

function rowToAccount(row: ProviderAccountRow): ProviderAccount {
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    secretName: row.secret_name,
    isDefault: row.is_default,
    accountInfo: row.account_info,
    status: row.status as ProviderAccount['status'],
    lastValidatedAt: row.last_validated_at ? new Date(row.last_validated_at).getTime() : null,
    baseUrl: row.base_url,
    tenantId: row.tenant_id,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

function rowToCostSummary(row: CostSummaryRow): AccountCostSummary {
  return {
    accountId: row.account_id,
    provider: row.provider,
    label: row.label,
    totalCostUsd: Number(row.total_cost_usd),
    totalInputTokens: Number(row.total_input_tokens),
    totalOutputTokens: Number(row.total_output_tokens),
    totalRequests: Number(row.total_requests),
  };
}

function rowToTrendPoint(row: CostTrendRow): CostTrendPoint {
  return {
    date: row.date,
    costUsd: Number(row.cost_usd),
    requests: Number(row.requests),
  };
}

// ─── Storage ───────────────────────────────────────────────────

export class ProviderAccountStorage extends PgBaseStorage {
  async createAccount(
    input: Omit<ProviderAccountCreate, 'apiKey'> & { secretName: string; createdBy?: string }
  ): Promise<ProviderAccount> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const row = await this.queryOne<ProviderAccountRow>(
      `INSERT INTO ai.provider_accounts
         (id, provider, label, secret_name, is_default, base_url, tenant_id, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
       RETURNING *`,
      [
        id,
        input.provider,
        input.label,
        input.secretName,
        input.isDefault ?? false,
        input.baseUrl ?? null,
        input.tenantId ?? null,
        input.createdBy ?? null,
        now,
      ]
    );
    return rowToAccount(row!);
  }

  async getAccount(id: string): Promise<ProviderAccount | null> {
    const row = await this.queryOne<ProviderAccountRow>(
      'SELECT * FROM ai.provider_accounts WHERE id = $1',
      [id]
    );
    return row ? rowToAccount(row) : null;
  }

  async updateAccount(id: string, update: ProviderAccountUpdate): Promise<ProviderAccount | null> {
    const sets: string[] = ['updated_at = now()'];
    const values: unknown[] = [];
    let idx = 1;

    if (update.label !== undefined) {
      sets.push(`label = $${idx++}`);
      values.push(update.label);
    }
    if (update.baseUrl !== undefined) {
      sets.push(`base_url = $${idx++}`);
      values.push(update.baseUrl);
    }
    if (update.status !== undefined) {
      sets.push(`status = $${idx++}`);
      values.push(update.status);
    }

    values.push(id);
    const row = await this.queryOne<ProviderAccountRow>(
      `UPDATE ai.provider_accounts SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return row ? rowToAccount(row) : null;
  }

  async deleteAccount(id: string): Promise<boolean> {
    const count = await this.execute('DELETE FROM ai.provider_accounts WHERE id = $1', [id]);
    return count > 0;
  }

  async listAccounts(provider?: string, tenantId?: string): Promise<ProviderAccount[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (provider) {
      conditions.push(`provider = $${idx++}`);
      values.push(provider);
    }
    if (tenantId !== undefined) {
      conditions.push(`tenant_id IS NOT DISTINCT FROM $${idx++}`);
      values.push(tenantId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await this.queryMany<ProviderAccountRow>(
      `SELECT * FROM ai.provider_accounts ${where} ORDER BY provider, label`,
      values
    );
    return rows.map(rowToAccount);
  }

  async getDefaultAccount(provider: string, tenantId?: string): Promise<ProviderAccount | null> {
    const row = await this.queryOne<ProviderAccountRow>(
      `SELECT * FROM ai.provider_accounts
       WHERE provider = $1 AND is_default = true AND tenant_id IS NOT DISTINCT FROM $2`,
      [provider, tenantId ?? null]
    );
    return row ? rowToAccount(row) : null;
  }

  async getAccountsByProvider(provider: string, tenantId?: string): Promise<ProviderAccount[]> {
    const rows = await this.queryMany<ProviderAccountRow>(
      `SELECT * FROM ai.provider_accounts
       WHERE provider = $1 AND tenant_id IS NOT DISTINCT FROM $2
       ORDER BY is_default DESC, label`,
      [provider, tenantId ?? null]
    );
    return rows.map(rowToAccount);
  }

  async setDefault(id: string): Promise<ProviderAccount | null> {
    return this.withTransaction(async (client) => {
      // Get the account to find its provider/tenant
      const accountResult = await client.query<ProviderAccountRow>(
        'SELECT * FROM ai.provider_accounts WHERE id = $1',
        [id]
      );
      const account = accountResult.rows[0];
      if (!account) return null;

      // Unset any existing default for this provider/tenant
      await client.query(
        `UPDATE ai.provider_accounts SET is_default = false, updated_at = now()
         WHERE provider = $1 AND tenant_id IS NOT DISTINCT FROM $2 AND is_default = true`,
        [account.provider, account.tenant_id]
      );

      // Set new default
      const result = await client.query<ProviderAccountRow>(
        `UPDATE ai.provider_accounts SET is_default = true, updated_at = now()
         WHERE id = $1 RETURNING *`,
        [id]
      );
      return result.rows[0] ? rowToAccount(result.rows[0]) : null;
    });
  }

  async updateValidation(
    id: string,
    status: ProviderAccount['status'],
    accountInfo?: Record<string, unknown>
  ): Promise<void> {
    await this.execute(
      `UPDATE ai.provider_accounts
       SET status = $1, last_validated_at = now(), account_info = COALESCE($2, account_info), updated_at = now()
       WHERE id = $3`,
      [status, accountInfo ? JSON.stringify(accountInfo) : null, id]
    );
  }

  // ─── Cost tracking ───────────────────────────────────────────

  async recordCost(record: {
    accountId: string;
    personalityId?: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsd: number;
    requestId?: string;
    tenantId?: string;
  }): Promise<void> {
    const id = crypto.randomUUID();
    await this.execute(
      `INSERT INTO ai.account_cost_records
         (id, account_id, personality_id, model, input_tokens, output_tokens, total_tokens, cost_usd, request_id, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        record.accountId,
        record.personalityId ?? null,
        record.model,
        record.inputTokens,
        record.outputTokens,
        record.totalTokens,
        record.costUsd,
        record.requestId ?? null,
        record.tenantId ?? null,
      ]
    );
  }

  async getCostSummary(opts: {
    from?: number;
    to?: number;
    accountId?: string;
    tenantId?: string;
  }): Promise<AccountCostSummary[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (opts.from) {
      conditions.push(`r.recorded_at >= to_timestamp($${idx++})`);
      values.push(opts.from / 1000);
    }
    if (opts.to) {
      conditions.push(`r.recorded_at <= to_timestamp($${idx++})`);
      values.push(opts.to / 1000);
    }
    if (opts.accountId) {
      conditions.push(`r.account_id = $${idx++}`);
      values.push(opts.accountId);
    }
    if (opts.tenantId !== undefined) {
      conditions.push(`r.tenant_id IS NOT DISTINCT FROM $${idx++}`);
      values.push(opts.tenantId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await this.queryMany<CostSummaryRow>(
      `SELECT r.account_id, a.provider, a.label,
              SUM(r.cost_usd)::text AS total_cost_usd,
              SUM(r.input_tokens)::text AS total_input_tokens,
              SUM(r.output_tokens)::text AS total_output_tokens,
              COUNT(*)::text AS total_requests
       FROM ai.account_cost_records r
       JOIN ai.provider_accounts a ON a.id = r.account_id
       ${where}
       GROUP BY r.account_id, a.provider, a.label
       ORDER BY SUM(r.cost_usd) DESC`,
      values
    );
    return rows.map(rowToCostSummary);
  }

  async getCostTrend(opts: {
    accountId?: string;
    days?: number;
    tenantId?: string;
  }): Promise<CostTrendPoint[]> {
    const days = opts.days ?? 30;
    const conditions: string[] = [`r.recorded_at >= now() - interval '${days} days'`];
    const values: unknown[] = [];
    let idx = 1;

    if (opts.accountId) {
      conditions.push(`r.account_id = $${idx++}`);
      values.push(opts.accountId);
    }
    if (opts.tenantId !== undefined) {
      conditions.push(`r.tenant_id IS NOT DISTINCT FROM $${idx++}`);
      values.push(opts.tenantId);
    }

    const where = conditions.join(' AND ');
    const rows = await this.queryMany<CostTrendRow>(
      `SELECT DATE(r.recorded_at)::text AS date,
              SUM(r.cost_usd)::text AS cost_usd,
              COUNT(*)::text AS requests
       FROM ai.account_cost_records r
       WHERE ${where}
       GROUP BY DATE(r.recorded_at)
       ORDER BY DATE(r.recorded_at)`,
      values
    );
    return rows.map(rowToTrendPoint);
  }

  async getTopAccounts(
    limit = 10,
    tenantId?: string
  ): Promise<AccountCostSummary[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (tenantId !== undefined) {
      conditions.push(`r.tenant_id IS NOT DISTINCT FROM $${idx++}`);
      values.push(tenantId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    values.push(limit);

    const rows = await this.queryMany<CostSummaryRow>(
      `SELECT r.account_id, a.provider, a.label,
              SUM(r.cost_usd)::text AS total_cost_usd,
              SUM(r.input_tokens)::text AS total_input_tokens,
              SUM(r.output_tokens)::text AS total_output_tokens,
              COUNT(*)::text AS total_requests
       FROM ai.account_cost_records r
       JOIN ai.provider_accounts a ON a.id = r.account_id
       ${where}
       GROUP BY r.account_id, a.provider, a.label
       ORDER BY SUM(r.cost_usd) DESC
       LIMIT $${idx}`,
      values
    );
    return rows.map(rowToCostSummary);
  }
}
