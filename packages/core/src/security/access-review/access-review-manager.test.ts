/**
 * AccessReviewManager Tests
 *
 * Tests for entitlement report generation, campaign lifecycle,
 * decision recording, revocation application, and expiry.
 * No DB required — all dependencies are mocked.
 */

import { describe, it, expect, vi } from 'vitest';
import { AccessReviewManager } from './access-review-manager.js';
import type { CampaignRecord, EntitlementRecord, DecisionRecord } from './access-review-storage.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const NOW = 1_700_000_000_000;

function makeCampaign(overrides: Partial<CampaignRecord> = {}): CampaignRecord {
  return {
    id: 'camp-1',
    name: 'Q1 Review',
    status: 'in_review',
    reviewerIds: ['reviewer-1'],
    scope: null,
    createdBy: 'admin',
    createdAt: NOW,
    closedAt: null,
    expiresAt: NOW + 30 * 86_400_000,
    ...overrides,
  };
}

function makeEntitlement(overrides: Partial<EntitlementRecord> = {}): EntitlementRecord {
  return {
    id: 'ent-1',
    campaignId: 'camp-1',
    userId: 'user-1',
    userName: 'Alice',
    entitlementType: 'role',
    entitlementValue: 'role_operator',
    details: { roleName: 'Operator' },
    createdAt: NOW,
    ...overrides,
  };
}

function makeDecision(overrides: Partial<DecisionRecord> = {}): DecisionRecord {
  return {
    id: 'dec-1',
    campaignId: 'camp-1',
    entitlementId: 'ent-1',
    reviewerId: 'reviewer-1',
    decision: 'approve',
    justification: null,
    createdAt: NOW,
    ...overrides,
  };
}

function makeStorage(overrides: Record<string, unknown> = {}) {
  return {
    createCampaign: vi.fn().mockResolvedValue(makeCampaign({ status: 'open' })),
    getCampaign: vi.fn().mockResolvedValue(makeCampaign()),
    listCampaigns: vi.fn().mockResolvedValue([makeCampaign()]),
    updateCampaignStatus: vi.fn().mockResolvedValue(makeCampaign()),
    expireStale: vi.fn().mockResolvedValue(0),
    createEntitlementSnapshot: vi.fn().mockResolvedValue(makeEntitlement()),
    getEntitlements: vi.fn().mockResolvedValue([makeEntitlement()]),
    recordDecision: vi.fn().mockResolvedValue(makeDecision()),
    getDecisions: vi.fn().mockResolvedValue([]),
    getDecision: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function makeRBAC(overrides: Record<string, unknown> = {}) {
  return {
    listUserAssignments: vi.fn().mockReturnValue([{ userId: 'user-1', roleId: 'role_operator' }]),
    getRole: vi.fn().mockReturnValue({
      id: 'role_operator',
      name: 'Operator',
      description: 'Can manage tasks',
      permissions: [{ resource: 'tasks', actions: ['read'] }],
    }),
    revokeUserRole: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function makeAuthStorage(overrides: Record<string, unknown> = {}) {
  return {
    listUsers: vi.fn().mockResolvedValue([
      {
        id: 'user-1',
        displayName: 'Alice',
        email: 'alice@example.com',
        tenantId: 'tenant-1',
        createdAt: NOW,
        updatedAt: NOW,
        isAdmin: false,
      },
    ]),
    listApiKeys: vi.fn().mockResolvedValue([
      {
        id: 'key-1',
        name: 'My API Key',
        key_prefix: 'sk-abc',
        role: 'operator',
        user_id: 'user-1',
        created_at: NOW,
        expires_at: null,
        revoked_at: null,
        last_used_at: null,
      },
    ]),
    revokeApiKey: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function makeRBACStorage(overrides: Record<string, unknown> = {}) {
  return {
    listActiveAssignments: vi
      .fn()
      .mockResolvedValue([{ userId: 'user-1', roleId: 'role_operator', assignedAt: NOW }]),
    ...overrides,
  };
}

function makeAuditChain() {
  return {
    record: vi.fn().mockResolvedValue({ id: 'audit-1' }),
  };
}

function makeManager(
  opts: {
    storageOverrides?: Record<string, unknown>;
    rbacOverrides?: Record<string, unknown>;
    authStorageOverrides?: Record<string, unknown>;
    rbacStorageOverrides?: Record<string, unknown>;
  } = {}
) {
  const storage = makeStorage(opts.storageOverrides ?? {});
  const rbac = makeRBAC(opts.rbacOverrides ?? {});
  const authStorage = makeAuthStorage(opts.authStorageOverrides ?? {});
  const rbacStorage = makeRBACStorage(opts.rbacStorageOverrides ?? {});
  const auditChain = makeAuditChain();

  const manager = new AccessReviewManager({
    rbac: rbac as any,
    authStorage: authStorage as any,
    rbacStorage: rbacStorage as any,
    auditChain: auditChain as any,
    config: { defaultExpiryMs: 30 * 86_400_000 },
  });

  // Inject mocked storage
  (manager as any).storage = storage;

  return { manager, storage, rbac, authStorage, rbacStorage, auditChain };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AccessReviewManager.getEntitlementReport', () => {
  it('returns role entitlements from RBAC assignments', async () => {
    const { manager, rbac } = makeManager();
    const entries = await manager.getEntitlementReport();
    expect(rbac.listUserAssignments).toHaveBeenCalled();
    const roleEntry = entries.find((e) => e.entitlementType === 'role');
    expect(roleEntry).toBeDefined();
    expect(roleEntry!.userId).toBe('user-1');
    expect(roleEntry!.entitlementValue).toBe('role_operator');
  });

  it('includes API key entitlements', async () => {
    const { manager } = makeManager();
    const entries = await manager.getEntitlementReport();
    const keyEntry = entries.find((e) => e.entitlementType === 'api_key');
    expect(keyEntry).toBeDefined();
    expect(keyEntry!.entitlementValue).toBe('sk-abc');
    expect((keyEntry!.details as any)?.keyId).toBe('key-1');
  });

  it('includes tenant entitlements for users with tenantId', async () => {
    const { manager } = makeManager();
    const entries = await manager.getEntitlementReport();
    const tenantEntry = entries.find((e) => e.entitlementType === 'tenant');
    expect(tenantEntry).toBeDefined();
    expect(tenantEntry!.entitlementValue).toBe('tenant-1');
  });

  it('skips revoked API keys', async () => {
    const { manager } = makeManager({
      authStorageOverrides: {
        listApiKeys: vi.fn().mockResolvedValue([
          {
            id: 'key-2',
            name: 'Revoked Key',
            key_prefix: 'sk-rev',
            role: 'viewer',
            user_id: 'user-1',
            created_at: NOW,
            expires_at: null,
            revoked_at: NOW - 1000,
            last_used_at: null,
          },
        ]),
      },
    });
    const entries = await manager.getEntitlementReport();
    const keyEntries = entries.filter((e) => e.entitlementType === 'api_key');
    expect(keyEntries).toHaveLength(0);
  });

  it('gracefully handles listApiKeys failure', async () => {
    const { manager } = makeManager({
      authStorageOverrides: {
        listApiKeys: vi.fn().mockRejectedValue(new Error('table missing')),
      },
    });
    const entries = await manager.getEntitlementReport();
    // Should not throw; role entries should still be present
    expect(entries.some((e) => e.entitlementType === 'role')).toBe(true);
  });

  it('resolves user display names', async () => {
    const { manager } = makeManager();
    const entries = await manager.getEntitlementReport();
    const roleEntry = entries.find((e) => e.entitlementType === 'role' && e.userId === 'user-1');
    expect(roleEntry!.userName).toBe('Alice');
  });

  it('deduplicates userId from in-memory and persisted assignments', async () => {
    const { manager, _rbac } = makeManager({
      rbacOverrides: {
        listUserAssignments: vi.fn().mockReturnValue([
          { userId: 'user-1', roleId: 'role_operator' },
          { userId: 'user-2', roleId: 'role_viewer' },
        ]),
      },
      rbacStorageOverrides: {
        listActiveAssignments: vi
          .fn()
          .mockResolvedValue([{ userId: 'user-1', roleId: 'role_operator', assignedAt: NOW }]),
      },
    });
    const entries = await manager.getEntitlementReport();
    const roleEntries = entries.filter((e) => e.entitlementType === 'role');
    const userIds = roleEntries.map((e) => e.userId);
    // user-1 should appear exactly once in role entries
    expect(userIds.filter((id) => id === 'user-1')).toHaveLength(1);
    expect(userIds).toContain('user-2');
  });
});

describe('AccessReviewManager.createCampaign', () => {
  it('creates campaign and snapshots entitlements', async () => {
    const { manager, storage } = makeManager({
      storageOverrides: {
        updateCampaignStatus: vi.fn().mockResolvedValue(makeCampaign({ status: 'in_review' })),
      },
    });
    const campaign = await manager.createCampaign('Q1 Review', ['reviewer-1']);
    expect(storage.createCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Q1 Review', reviewerIds: ['reviewer-1'] })
    );
    expect(storage.createEntitlementSnapshot).toHaveBeenCalled();
    expect(campaign.status).toBe('in_review');
  });

  it('transitions to in_review after snapshot', async () => {
    const { manager, storage } = makeManager({
      storageOverrides: {
        updateCampaignStatus: vi.fn().mockResolvedValue(makeCampaign({ status: 'in_review' })),
      },
    });
    await manager.createCampaign('Test', ['rev-1']);
    expect(storage.updateCampaignStatus).toHaveBeenCalledWith(expect.any(String), 'in_review');
  });

  it('records audit event on creation', async () => {
    const { manager, auditChain } = makeManager();
    await manager.createCampaign('Test', ['rev-1']);
    expect(auditChain.record).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'access_review.campaign_created' })
    );
  });

  it('throws if name is empty', async () => {
    const { manager } = makeManager();
    await expect(manager.createCampaign('', ['rev-1'])).rejects.toThrow('name is required');
  });

  it('throws if reviewerIds is empty', async () => {
    const { manager } = makeManager();
    await expect(manager.createCampaign('Test', [])).rejects.toThrow('reviewer is required');
  });

  it('sets expiresAt based on expiryMs option', async () => {
    const { manager, storage } = makeManager();
    await manager.createCampaign('Test', ['rev-1'], { expiryMs: 7 * 86_400_000 });
    const { expiresAt } = storage.createCampaign.mock.calls[0][0];
    const diff = expiresAt - Date.now();
    expect(diff).toBeGreaterThan(6 * 86_400_000);
    expect(diff).toBeLessThan(8 * 86_400_000);
  });

  it('passes scope through to storage', async () => {
    const { manager, storage } = makeManager();
    await manager.createCampaign('Scoped', ['rev-1'], { scope: 'finance-team' });
    expect(storage.createCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'finance-team' })
    );
  });
});

describe('AccessReviewManager.getCampaign', () => {
  it('returns null for unknown campaign', async () => {
    const { manager } = makeManager({
      storageOverrides: { getCampaign: vi.fn().mockResolvedValue(null) },
    });
    const result = await manager.getCampaign('nonexistent');
    expect(result).toBeNull();
  });

  it('returns campaign with entitlements and decisions', async () => {
    const { manager } = makeManager({
      storageOverrides: {
        getDecisions: vi.fn().mockResolvedValue([makeDecision()]),
      },
    });
    const result = await manager.getCampaign('camp-1');
    expect(result).not.toBeNull();
    expect(result!.entitlements).toHaveLength(1);
    expect(result!.decisions).toHaveLength(1);
  });

  it('calls expireStale before fetching', async () => {
    const { manager, storage } = makeManager();
    await manager.getCampaign('camp-1');
    expect(storage.expireStale).toHaveBeenCalled();
  });
});

describe('AccessReviewManager.listCampaigns', () => {
  it('returns all campaigns without filter', async () => {
    const { manager, storage } = makeManager();
    const campaigns = await manager.listCampaigns();
    expect(storage.listCampaigns).toHaveBeenCalledWith(undefined);
    expect(campaigns).toHaveLength(1);
  });

  it('passes status filter to storage', async () => {
    const { manager, storage } = makeManager();
    await manager.listCampaigns({ status: 'closed' });
    expect(storage.listCampaigns).toHaveBeenCalledWith({ status: 'closed' });
  });

  it('calls expireStale before listing', async () => {
    const { manager, storage } = makeManager();
    await manager.listCampaigns();
    expect(storage.expireStale).toHaveBeenCalled();
  });
});

describe('AccessReviewManager.submitDecision', () => {
  it('records an approve decision', async () => {
    const { manager, storage } = makeManager();
    await manager.submitDecision('camp-1', 'ent-1', 'approve', 'reviewer-1');
    expect(storage.recordDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: 'camp-1',
        entitlementId: 'ent-1',
        decision: 'approve',
        reviewerId: 'reviewer-1',
      })
    );
  });

  it('records a revoke decision with justification', async () => {
    const { manager, storage } = makeManager();
    await manager.submitDecision('camp-1', 'ent-1', 'revoke', 'reviewer-1', 'No longer needed');
    expect(storage.recordDecision).toHaveBeenCalledWith(
      expect.objectContaining({ decision: 'revoke', justification: 'No longer needed' })
    );
  });

  it('throws if campaign not found', async () => {
    const { manager } = makeManager({
      storageOverrides: { getCampaign: vi.fn().mockResolvedValue(null) },
    });
    await expect(manager.submitDecision('bad', 'ent-1', 'approve', 'rev-1')).rejects.toThrow(
      'not found'
    );
  });

  it('throws if campaign is closed', async () => {
    const { manager } = makeManager({
      storageOverrides: {
        getCampaign: vi.fn().mockResolvedValue(makeCampaign({ status: 'closed' })),
      },
    });
    await expect(manager.submitDecision('camp-1', 'ent-1', 'approve', 'rev-1')).rejects.toThrow(
      'closed'
    );
  });

  it('throws if campaign is expired', async () => {
    const { manager } = makeManager({
      storageOverrides: {
        getCampaign: vi.fn().mockResolvedValue(makeCampaign({ status: 'expired' })),
      },
    });
    await expect(manager.submitDecision('camp-1', 'ent-1', 'approve', 'rev-1')).rejects.toThrow(
      'expired'
    );
  });

  it('throws if reviewer is not assigned', async () => {
    const { manager } = makeManager({
      storageOverrides: {
        getCampaign: vi.fn().mockResolvedValue(makeCampaign({ reviewerIds: ['other-reviewer'] })),
      },
    });
    await expect(
      manager.submitDecision('camp-1', 'ent-1', 'approve', 'reviewer-1')
    ).rejects.toThrow('not an assigned reviewer');
  });

  it('throws if entitlement not found in campaign', async () => {
    const { manager } = makeManager({
      storageOverrides: {
        getEntitlements: vi.fn().mockResolvedValue([]),
      },
    });
    await expect(
      manager.submitDecision('camp-1', 'nonexistent-ent', 'approve', 'reviewer-1')
    ).rejects.toThrow('not found in campaign');
  });
});

describe('AccessReviewManager.closeCampaign', () => {
  it('closes a campaign and returns updated record', async () => {
    const { manager, storage } = makeManager({
      storageOverrides: {
        updateCampaignStatus: vi.fn().mockResolvedValue(makeCampaign({ status: 'closed' })),
      },
    });
    const result = await manager.closeCampaign('camp-1');
    expect(result.status).toBe('closed');
    expect(storage.updateCampaignStatus).toHaveBeenCalledWith(
      'camp-1',
      'closed',
      expect.any(Number)
    );
  });

  it('applies role revocations', async () => {
    const { manager, rbac } = makeManager({
      storageOverrides: {
        getDecisions: vi.fn().mockResolvedValue([makeDecision({ decision: 'revoke' })]),
        updateCampaignStatus: vi.fn().mockResolvedValue(makeCampaign({ status: 'closed' })),
      },
    });
    await manager.closeCampaign('camp-1');
    expect(rbac.revokeUserRole).toHaveBeenCalledWith('user-1');
  });

  it('applies API key revocations', async () => {
    const { manager, authStorage } = makeManager({
      storageOverrides: {
        getEntitlements: vi.fn().mockResolvedValue([
          makeEntitlement({
            entitlementType: 'api_key',
            entitlementValue: 'sk-abc',
            details: { keyId: 'key-1', keyName: 'My Key', role: 'operator', expiresAt: null },
          }),
        ]),
        getDecisions: vi.fn().mockResolvedValue([makeDecision({ decision: 'revoke' })]),
        updateCampaignStatus: vi.fn().mockResolvedValue(makeCampaign({ status: 'closed' })),
      },
    });
    await manager.closeCampaign('camp-1');
    expect(authStorage.revokeApiKey).toHaveBeenCalledWith('key-1');
  });

  it('does not revoke approved entitlements', async () => {
    const { manager, rbac } = makeManager({
      storageOverrides: {
        getDecisions: vi.fn().mockResolvedValue([makeDecision({ decision: 'approve' })]),
        updateCampaignStatus: vi.fn().mockResolvedValue(makeCampaign({ status: 'closed' })),
      },
    });
    await manager.closeCampaign('camp-1');
    expect(rbac.revokeUserRole).not.toHaveBeenCalled();
  });

  it('records audit event on close', async () => {
    const { manager, auditChain } = makeManager({
      storageOverrides: {
        updateCampaignStatus: vi.fn().mockResolvedValue(makeCampaign({ status: 'closed' })),
      },
    });
    await manager.closeCampaign('camp-1', 'admin-user');
    expect(auditChain.record).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'access_review.campaign_closed',
        userId: 'admin-user',
      })
    );
  });

  it('throws if campaign not found', async () => {
    const { manager } = makeManager({
      storageOverrides: { getCampaign: vi.fn().mockResolvedValue(null) },
    });
    await expect(manager.closeCampaign('nonexistent')).rejects.toThrow('not found');
  });

  it('throws if campaign is already closed', async () => {
    const { manager } = makeManager({
      storageOverrides: {
        getCampaign: vi.fn().mockResolvedValue(makeCampaign({ status: 'closed' })),
      },
    });
    await expect(manager.closeCampaign('camp-1')).rejects.toThrow('already closed');
  });

  it('throws if campaign is expired', async () => {
    const { manager } = makeManager({
      storageOverrides: {
        getCampaign: vi.fn().mockResolvedValue(makeCampaign({ status: 'expired' })),
      },
    });
    await expect(manager.closeCampaign('camp-1')).rejects.toThrow('expired');
  });

  it('continues closing even if a revocation fails', async () => {
    const { manager, storage } = makeManager({
      rbacOverrides: {
        listUserAssignments: vi.fn().mockReturnValue([]),
        getRole: vi.fn().mockReturnValue(null),
        revokeUserRole: vi.fn().mockRejectedValue(new Error('RBAC error')),
      },
      storageOverrides: {
        getDecisions: vi.fn().mockResolvedValue([makeDecision({ decision: 'revoke' })]),
        updateCampaignStatus: vi.fn().mockResolvedValue(makeCampaign({ status: 'closed' })),
      },
    });
    // Should not throw even when revokeUserRole fails
    const result = await manager.closeCampaign('camp-1');
    expect(result.status).toBe('closed');
    expect(storage.updateCampaignStatus).toHaveBeenCalledWith(
      'camp-1',
      'closed',
      expect.any(Number)
    );
  });
});
