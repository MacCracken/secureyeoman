/**
 * AccessReviewManager — campaign lifecycle management for access reviews.
 *
 * Provides:
 *   - Entitlement report generation ("who has access to what" snapshot)
 *   - Campaign create / list / get
 *   - Decision recording by reviewers
 *   - Campaign close with revocation application
 *   - Auto-expiry of stale campaigns
 */

import { uuidv7 } from '../../utils/crypto.js';
import { getLogger, type SecureLogger } from '../../logging/logger.js';
import type { AuditChain } from '../../logging/audit-chain.js';
import type { RBAC } from '../rbac.js';
import type { AuthStorage } from '../auth-storage.js';
import { RBACStorage } from '../rbac-storage.js';
import {
  AccessReviewStorage,
  type CampaignRecord,
  type CampaignStatus,
  type DecisionValue,
  type EntitlementRecord,
  type DecisionRecord,
  type EntitlementType,
} from './access-review-storage.js';

// ── Exported types ────────────────────────────────────────────────────────────

export interface EntitlementEntry {
  userId: string;
  userName: string | null;
  entitlementType: EntitlementType;
  entitlementValue: string;
  details: Record<string, unknown> | null;
}

export interface CampaignWithDetails extends CampaignRecord {
  entitlements: EntitlementRecord[];
  decisions: DecisionRecord[];
}

export interface AccessReviewManagerConfig {
  /** How long (ms) a campaign lives before auto-expiring. Default: 30 days. */
  defaultExpiryMs?: number;
}

// ── Manager ───────────────────────────────────────────────────────────────────

export class AccessReviewManager {
  private readonly storage: AccessReviewStorage;
  private readonly rbac: RBAC;
  private readonly authStorage: AuthStorage;
  private readonly rbacStorage: RBACStorage;
  private readonly auditChain: AuditChain;
  private readonly defaultExpiryMs: number;
  private logger: SecureLogger | null = null;

  constructor(deps: {
    rbac: RBAC;
    authStorage: AuthStorage;
    rbacStorage?: RBACStorage;
    auditChain: AuditChain;
    config?: AccessReviewManagerConfig;
  }) {
    this.rbac = deps.rbac;
    this.authStorage = deps.authStorage;
    this.rbacStorage = deps.rbacStorage ?? new RBACStorage();
    this.auditChain = deps.auditChain;
    this.defaultExpiryMs = deps.config?.defaultExpiryMs ?? 30 * 24 * 60 * 60 * 1000;
    this.storage = new AccessReviewStorage();
  }

  private getLogger(): SecureLogger {
    if (!this.logger) {
      try {
        this.logger = getLogger().child({ component: 'AccessReviewManager' });
      } catch {
        // Logger not yet initialized — return a minimal no-op logger
        return {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
          child: () => this.getLogger(),
        } as unknown as SecureLogger;
      }
    }
    return this.logger;
  }

  // ── Entitlement report ────────────────────────────────────────────────────

  /**
   * Generate a point-in-time snapshot of all active entitlements.
   *
   * Aggregates:
   *   1. RBAC role assignments (from in-memory + persisted storage)
   *   2. Active API keys and their roles
   *   3. Tenant associations (from auth.users.tenant_id)
   */
  async getEntitlementReport(): Promise<EntitlementEntry[]> {
    const entries: EntitlementEntry[] = [];

    // 1. RBAC role assignments (in-memory)
    const roleAssignments = this.rbac.listUserAssignments();
    // Also fetch persisted assignments for completeness
    let persistedAssignments: { userId: string; roleId: string; assignedAt: number }[] = [];
    try {
      persistedAssignments = await this.rbacStorage.listActiveAssignments();
    } catch {
      // RBACStorage may be unavailable on community tier — skip gracefully
    }

    // Merge in-memory + persisted, deduplicate by userId
    const roleMap = new Map<string, string>();
    for (const { userId, roleId } of persistedAssignments) {
      roleMap.set(userId, roleId);
    }
    for (const { userId, roleId } of roleAssignments) {
      roleMap.set(userId, roleId);
    }

    // Resolve display names from auth storage
    const userNameMap = new Map<string, string>();
    let users: import('@secureyeoman/shared').User[] = [];
    try {
      users = await this.authStorage.listUsers();
      for (const u of users) {
        userNameMap.set(u.id, u.displayName ?? u.email ?? u.id);
      }
    } catch {
      // May fail if table not yet initialised
    }

    for (const [userId, roleId] of roleMap) {
      const roleDefinition = this.rbac.getRole(roleId);
      entries.push({
        userId,
        userName: userNameMap.get(userId) ?? null,
        entitlementType: 'role',
        entitlementValue: roleId,
        details: roleDefinition
          ? {
              roleName: roleDefinition.name,
              description: roleDefinition.description ?? null,
              permissionCount: roleDefinition.permissions.length,
            }
          : null,
      });
    }

    // 2. Active API keys (includes role information)
    try {
      const apiKeys = await this.authStorage.listApiKeys();
      for (const key of apiKeys) {
        if (key.revoked_at) continue;
        entries.push({
          userId: key.user_id,
          userName: userNameMap.get(key.user_id) ?? null,
          entitlementType: 'api_key',
          entitlementValue: key.key_prefix,
          details: {
            keyId: key.id,
            keyName: key.name,
            role: key.role,
            expiresAt: key.expires_at,
          },
        });
      }
    } catch {
      // API key table may not exist on all tiers
    }

    // 3. Tenant associations — read from auth.users (if the tenant_id column exists)
    try {
      for (const user of users) {
        const tenantId = (user as Record<string, unknown>).tenantId as string | undefined;
        if (tenantId) {
          entries.push({
            userId: user.id,
            userName: userNameMap.get(user.id) ?? null,
            entitlementType: 'tenant',
            entitlementValue: tenantId,
            details: { email: user.email },
          });
        }
      }
    } catch {
      // Graceful degradation
    }

    this.getLogger().info({ count: entries.length }, 'Entitlement report generated');
    return entries;
  }

  // ── Campaign lifecycle ────────────────────────────────────────────────────

  /**
   * Create a new access review campaign.
   * Snapshots current entitlements and assigns reviewers.
   */
  async createCampaign(
    name: string,
    reviewerIds: string[],
    options?: { scope?: string; createdBy?: string; expiryMs?: number }
  ): Promise<CampaignRecord> {
    if (!name || name.trim().length === 0) {
      throw new Error('Campaign name is required');
    }
    if (!reviewerIds || reviewerIds.length === 0) {
      throw new Error('At least one reviewer is required');
    }

    const createdBy = options?.createdBy ?? 'system';
    const expiresAt = Date.now() + (options?.expiryMs ?? this.defaultExpiryMs);

    const campaign = await this.storage.createCampaign({
      id: uuidv7(),
      name,
      reviewerIds,
      scope: options?.scope,
      createdBy,
      expiresAt,
    });

    // Snapshot entitlements
    const entitlements = await this.getEntitlementReport();
    const snapshotPromises = entitlements.map((e) =>
      this.storage.createEntitlementSnapshot({
        id: uuidv7(),
        campaignId: campaign.id,
        userId: e.userId,
        userName: e.userName ?? undefined,
        entitlementType: e.entitlementType,
        entitlementValue: e.entitlementValue,
        details: e.details ?? undefined,
      })
    );
    await Promise.all(snapshotPromises);

    // Transition to in_review now that entitlements are snapshotted
    const updated = await this.storage.updateCampaignStatus(campaign.id, 'in_review');

    void this.auditChain.record({
      event: 'access_review.campaign_created',
      level: 'info',
      message: `Access review campaign "${name}" created`,
      userId: createdBy,
      metadata: {
        campaignId: campaign.id,
        reviewerIds,
        scope: options?.scope ?? null,
        entitlementCount: entitlements.length,
      },
    });

    this.getLogger().info(
      { campaignId: campaign.id, entitlementCount: entitlements.length },
      'Access review campaign created'
    );

    return updated ?? campaign;
  }

  /**
   * Retrieve a campaign with its entitlements and decisions.
   */
  async getCampaign(id: string): Promise<CampaignWithDetails | null> {
    await this.storage.expireStale();

    const campaign = await this.storage.getCampaign(id);
    if (!campaign) return null;

    const [entitlements, decisions] = await Promise.all([
      this.storage.getEntitlements(id),
      this.storage.getDecisions(id),
    ]);

    return { ...campaign, entitlements, decisions };
  }

  /**
   * List campaigns, optionally filtered by status.
   */
  async listCampaigns(filters?: { status?: CampaignStatus }): Promise<CampaignRecord[]> {
    // Expire stale campaigns before listing
    await this.storage.expireStale();
    return this.storage.listCampaigns(filters);
  }

  /**
   * Record a reviewer decision on an entitlement.
   */
  async submitDecision(
    campaignId: string,
    entitlementId: string,
    decision: DecisionValue,
    reviewerId: string,
    justification?: string
  ): Promise<DecisionRecord> {
    const campaign = await this.storage.getCampaign(campaignId);
    if (!campaign) {
      throw new Error(`Campaign not found: ${campaignId}`);
    }
    if (campaign.status === 'closed' || campaign.status === 'expired') {
      throw new Error(`Campaign ${campaignId} is ${campaign.status} and cannot accept decisions`);
    }
    if (!campaign.reviewerIds.includes(reviewerId)) {
      throw new Error(`User ${reviewerId} is not an assigned reviewer for campaign ${campaignId}`);
    }

    const entitlements = await this.storage.getEntitlements(campaignId);
    const entitlement = entitlements.find((e) => e.id === entitlementId);
    if (!entitlement) {
      throw new Error(`Entitlement ${entitlementId} not found in campaign ${campaignId}`);
    }

    const recorded = await this.storage.recordDecision({
      id: uuidv7(),
      campaignId,
      entitlementId,
      reviewerId,
      decision,
      justification,
    });

    this.getLogger().info(
      { campaignId, entitlementId, decision, reviewerId },
      'Access review decision submitted'
    );

    return recorded;
  }

  /**
   * Close a campaign.
   *
   * For each 'revoke' decision:
   *   - If the entitlement is a 'role': calls RBAC.revokeUserRole()
   *   - If the entitlement is an 'api_key': calls authStorage.revokeApiKey()
   *
   * Records a summary to the audit chain.
   */
  async closeCampaign(campaignId: string, closedBy?: string): Promise<CampaignRecord> {
    const campaign = await this.storage.getCampaign(campaignId);
    if (!campaign) {
      throw new Error(`Campaign not found: ${campaignId}`);
    }
    if (campaign.status === 'closed') {
      throw new Error(`Campaign ${campaignId} is already closed`);
    }
    if (campaign.status === 'expired') {
      throw new Error(`Campaign ${campaignId} is expired`);
    }

    const [entitlements, decisions] = await Promise.all([
      this.storage.getEntitlements(campaignId),
      this.storage.getDecisions(campaignId),
    ]);

    // Build maps for fast lookup
    const entitlementMap = new Map(entitlements.map((e) => [e.id, e]));
    const revokedDecisions = decisions.filter((d) => d.decision === 'revoke');

    const revocationResults: { userId: string; type: string; value: string; success: boolean }[] =
      [];

    for (const dec of revokedDecisions) {
      const ent = entitlementMap.get(dec.entitlementId);
      if (!ent) continue;

      let success = false;
      try {
        if (ent.entitlementType === 'role') {
          await this.rbac.revokeUserRole(ent.userId);
          success = true;
        } else if (ent.entitlementType === 'api_key') {
          const keyId = ent.details?.keyId as string | undefined;
          if (keyId) {
            success = await this.authStorage.revokeApiKey(keyId);
          }
        }
      } catch (err) {
        this.getLogger().warn(
          { campaignId, entitlementId: ent.id, error: String(err) },
          'Failed to apply access revocation'
        );
      }

      revocationResults.push({
        userId: ent.userId,
        type: ent.entitlementType,
        value: ent.entitlementValue,
        success,
      });
    }

    const closed = await this.storage.updateCampaignStatus(campaignId, 'closed', Date.now());

    void this.auditChain.record({
      event: 'access_review.campaign_closed',
      level: 'info',
      message: `Access review campaign "${campaign.name}" closed`,
      userId: closedBy ?? 'system',
      metadata: {
        campaignId,
        totalEntitlements: entitlements.length,
        totalDecisions: decisions.length,
        revocationsApplied: revocationResults.filter((r) => r.success).length,
        revocationsFailed: revocationResults.filter((r) => !r.success).length,
        revocationResults,
      },
    });

    this.getLogger().info(
      {
        campaignId,
        revocationsApplied: revocationResults.filter((r) => r.success).length,
      },
      'Access review campaign closed'
    );

    return closed ?? campaign;
  }
}
