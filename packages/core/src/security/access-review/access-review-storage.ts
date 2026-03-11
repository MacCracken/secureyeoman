/**
 * AccessReviewStorage — PostgreSQL-backed storage for access review campaigns,
 * entitlement snapshots, and reviewer decisions.
 */

import { PgBaseStorage } from '../../storage/pg-base.js';

// ── Record types ─────────────────────────────────────────────────────────────

export type CampaignStatus = 'open' | 'in_review' | 'closed' | 'expired';
export type DecisionValue = 'approve' | 'revoke' | 'flag';
export type EntitlementType = 'role' | 'api_key' | 'tenant' | 'permission';

export interface CampaignRecord {
  id: string;
  name: string;
  status: CampaignStatus;
  reviewerIds: string[];
  scope: string | null;
  createdBy: string;
  createdAt: number;
  closedAt: number | null;
  expiresAt: number;
}

export interface EntitlementRecord {
  id: string;
  campaignId: string;
  userId: string;
  userName: string | null;
  entitlementType: EntitlementType;
  entitlementValue: string;
  details: Record<string, unknown> | null;
  createdAt: number;
}

export interface DecisionRecord {
  id: string;
  campaignId: string;
  entitlementId: string;
  reviewerId: string;
  decision: DecisionValue;
  justification: string | null;
  createdAt: number;
}

// ── Row types (DB → application mapping) ─────────────────────────────────────

interface CampaignRow {
  id: string;
  name: string;
  status: string;
  reviewer_ids: string[];
  scope: string | null;
  created_by: string;
  created_at: string;
  closed_at: string | null;
  expires_at: string;
}

interface EntitlementRow {
  id: string;
  campaign_id: string;
  user_id: string;
  user_name: string | null;
  entitlement_type: string;
  entitlement_value: string;
  details: unknown;
  created_at: string;
}

interface DecisionRow {
  id: string;
  campaign_id: string;
  entitlement_id: string;
  reviewer_id: string;
  decision: string;
  justification: string | null;
  created_at: string;
}

// ── Row → Record helpers ──────────────────────────────────────────────────────

function rowToCampaign(row: CampaignRow): CampaignRecord {
  return {
    id: row.id,
    name: row.name,
    status: row.status as CampaignStatus,
    reviewerIds: row.reviewer_ids,
    scope: row.scope,
    createdBy: row.created_by,
    createdAt: Number(row.created_at),
    closedAt: row.closed_at ? Number(row.closed_at) : null,
    expiresAt: Number(row.expires_at),
  };
}

function rowToEntitlement(row: EntitlementRow): EntitlementRecord {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    userId: row.user_id,
    userName: row.user_name,
    entitlementType: row.entitlement_type as EntitlementType,
    entitlementValue: row.entitlement_value,
    details:
      typeof row.details === 'object' && row.details !== null
        ? (row.details as Record<string, unknown>)
        : null,
    createdAt: Number(row.created_at),
  };
}

function rowToDecision(row: DecisionRow): DecisionRecord {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    entitlementId: row.entitlement_id,
    reviewerId: row.reviewer_id,
    decision: row.decision as DecisionValue,
    justification: row.justification,
    createdAt: Number(row.created_at),
  };
}

// ── Storage class ─────────────────────────────────────────────────────────────

export class AccessReviewStorage extends PgBaseStorage {
  // ── Campaigns ──────────────────────────────────────────────────────────────

  async createCampaign(data: {
    id: string;
    name: string;
    reviewerIds: string[];
    scope?: string;
    createdBy: string;
    expiresAt: number;
  }): Promise<CampaignRecord> {
    const now = Date.now();
    const row = await this.queryOne<CampaignRow>(
      `INSERT INTO access_review.campaigns
         (id, name, status, reviewer_ids, scope, created_by, created_at, closed_at, expires_at)
       VALUES ($1, $2, 'open', $3, $4, $5, $6, NULL, $7)
       RETURNING *`,
      [
        data.id,
        data.name,
        data.reviewerIds,
        data.scope ?? null,
        data.createdBy,
        now,
        data.expiresAt,
      ]
    );
    return rowToCampaign(row!);
  }

  async getCampaign(id: string): Promise<CampaignRecord | null> {
    const row = await this.queryOne<CampaignRow>(
      'SELECT * FROM access_review.campaigns WHERE id = $1',
      [id]
    );
    return row ? rowToCampaign(row) : null;
  }

  async listCampaigns(filters?: { status?: CampaignStatus }): Promise<CampaignRecord[]> {
    if (filters?.status) {
      const rows = await this.queryMany<CampaignRow>(
        'SELECT * FROM access_review.campaigns WHERE status = $1 ORDER BY created_at DESC',
        [filters.status]
      );
      return rows.map(rowToCampaign);
    }
    const rows = await this.queryMany<CampaignRow>(
      'SELECT * FROM access_review.campaigns ORDER BY created_at DESC'
    );
    return rows.map(rowToCampaign);
  }

  async updateCampaignStatus(
    id: string,
    status: CampaignStatus,
    closedAt?: number
  ): Promise<CampaignRecord | null> {
    const row = await this.queryOne<CampaignRow>(
      `UPDATE access_review.campaigns
         SET status = $1, closed_at = $2
       WHERE id = $3
       RETURNING *`,
      [status, closedAt ?? null, id]
    );
    return row ? rowToCampaign(row) : null;
  }

  /** Mark campaigns whose expires_at has passed as 'expired'. */
  async expireStale(): Promise<number> {
    const now = Date.now();
    return this.execute(
      `UPDATE access_review.campaigns
         SET status = 'expired'
       WHERE status IN ('open', 'in_review') AND expires_at < $1`,
      [now]
    );
  }

  // ── Entitlements ──────────────────────────────────────────────────────────

  async createEntitlementSnapshot(data: {
    id: string;
    campaignId: string;
    userId: string;
    userName?: string;
    entitlementType: EntitlementType;
    entitlementValue: string;
    details?: Record<string, unknown>;
  }): Promise<EntitlementRecord> {
    const now = Date.now();
    const row = await this.queryOne<EntitlementRow>(
      `INSERT INTO access_review.entitlements
         (id, campaign_id, user_id, user_name, entitlement_type, entitlement_value, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        data.id,
        data.campaignId,
        data.userId,
        data.userName ?? null,
        data.entitlementType,
        data.entitlementValue,
        data.details ? JSON.stringify(data.details) : null,
        now,
      ]
    );
    return rowToEntitlement(row!);
  }

  async getEntitlements(campaignId: string): Promise<EntitlementRecord[]> {
    const rows = await this.queryMany<EntitlementRow>(
      `SELECT * FROM access_review.entitlements
       WHERE campaign_id = $1
       ORDER BY user_id, entitlement_type`,
      [campaignId]
    );
    return rows.map(rowToEntitlement);
  }

  // ── Decisions ─────────────────────────────────────────────────────────────

  async recordDecision(data: {
    id: string;
    campaignId: string;
    entitlementId: string;
    reviewerId: string;
    decision: DecisionValue;
    justification?: string;
  }): Promise<DecisionRecord> {
    const now = Date.now();
    const row = await this.queryOne<DecisionRow>(
      `INSERT INTO access_review.decisions
         (id, campaign_id, entitlement_id, reviewer_id, decision, justification, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (campaign_id, entitlement_id) DO UPDATE SET
         reviewer_id = EXCLUDED.reviewer_id,
         decision = EXCLUDED.decision,
         justification = EXCLUDED.justification,
         created_at = EXCLUDED.created_at
       RETURNING *`,
      [
        data.id,
        data.campaignId,
        data.entitlementId,
        data.reviewerId,
        data.decision,
        data.justification ?? null,
        now,
      ]
    );
    return rowToDecision(row!);
  }

  async getDecisions(campaignId: string): Promise<DecisionRecord[]> {
    const rows = await this.queryMany<DecisionRow>(
      `SELECT * FROM access_review.decisions
       WHERE campaign_id = $1
       ORDER BY created_at ASC`,
      [campaignId]
    );
    return rows.map(rowToDecision);
  }

  async getDecision(campaignId: string, entitlementId: string): Promise<DecisionRecord | null> {
    const row = await this.queryOne<DecisionRow>(
      `SELECT * FROM access_review.decisions
       WHERE campaign_id = $1 AND entitlement_id = $2`,
      [campaignId, entitlementId]
    );
    return row ? rowToDecision(row) : null;
  }
}
