/**
 * ProviderAccountManager — orchestrates multi-account AI provider key
 * management with validation and cost tracking (Phase 112).
 */

import type { AIProviderName, ProviderAccount } from '@secureyeoman/shared';
import type { ProviderAccountStorage } from './provider-account-storage.js';
import type { SecretsManager } from '../security/secrets-manager.js';
import type { ProviderKeyValidator } from './provider-key-validator.js';
import type { AuditChain } from '../logging/audit-chain.js';
import type { AlertManager } from '../telemetry/alert-manager.js';
import { PROVIDER_KEY_ENV } from './cost-calculator.js';

export interface ProviderAccountManagerDeps {
  storage: ProviderAccountStorage;
  secretsManager: SecretsManager;
  validator: ProviderKeyValidator;
  auditChain?: AuditChain;
  getAlertManager?: () => AlertManager | null;
}

export class ProviderAccountManager {
  private readonly storage: ProviderAccountStorage;
  private readonly secretsManager: SecretsManager;
  private readonly validator: ProviderKeyValidator;
  private readonly auditChain: AuditChain | null;
  private readonly getAlertManager: (() => AlertManager | null) | null;

  constructor(deps: ProviderAccountManagerDeps) {
    this.storage = deps.storage;
    this.secretsManager = deps.secretsManager;
    this.validator = deps.validator;
    this.auditChain = deps.auditChain ?? null;
    this.getAlertManager = deps.getAlertManager ?? null;
  }

  // ─── CRUD ────────────────────────────────────────────────────

  async createAccount(input: {
    provider: string;
    label: string;
    apiKey: string;
    isDefault?: boolean;
    baseUrl?: string | null;
    tenantId?: string;
    createdBy?: string;
  }): Promise<ProviderAccount> {
    // Store key in SecretsManager
    const secretName = `provider_account_${input.provider}_${Date.now()}`;
    await this.secretsManager.set(secretName, input.apiKey);

    const account = await this.storage.createAccount({
      provider: input.provider,
      label: input.label,
      secretName,
      isDefault: input.isDefault,
      baseUrl: input.baseUrl,
      tenantId: input.tenantId,
      createdBy: input.createdBy,
    });

    await this.audit('provider_account_created', {
      accountId: account.id,
      provider: input.provider,
      label: input.label,
    });

    return account;
  }

  async getAccount(id: string): Promise<ProviderAccount | null> {
    return this.storage.getAccount(id);
  }

  async updateAccount(
    id: string,
    update: { label?: string; baseUrl?: string | null; status?: ProviderAccount['status'] }
  ): Promise<ProviderAccount | null> {
    return this.storage.updateAccount(id, update);
  }

  async deleteAccount(id: string): Promise<boolean> {
    const account = await this.storage.getAccount(id);
    if (!account) return false;

    // Remove the stored secret
    await this.secretsManager.delete(account.secretName).catch(() => {});

    const deleted = await this.storage.deleteAccount(id);
    if (deleted) {
      await this.audit('provider_account_deleted', {
        accountId: id,
        provider: account.provider,
      });
    }
    return deleted;
  }

  async listAccounts(provider?: string, tenantId?: string): Promise<ProviderAccount[]> {
    return this.storage.listAccounts(provider, tenantId);
  }

  async setDefault(id: string): Promise<ProviderAccount | null> {
    const account = await this.storage.setDefault(id);
    if (account) {
      await this.audit('provider_account_default_changed', {
        accountId: id,
        provider: account.provider,
      });
    }
    return account;
  }

  // ─── Key Resolution ──────────────────────────────────────────

  /**
   * Resolve the API key for a provider, following the resolution chain:
   * explicit accountId → provider default → sole account → null
   */
  async resolveApiKey(
    provider: string,
    accountId?: string,
    tenantId?: string
  ): Promise<{ apiKey: string; accountId: string } | null> {
    let account: ProviderAccount | null = null;

    if (accountId) {
      account = await this.storage.getAccount(accountId);
    }

    if (!account) {
      account = await this.storage.getDefaultAccount(provider, tenantId);
    }

    if (!account) {
      // Check if there's a sole account for this provider
      const accounts = await this.storage.getAccountsByProvider(provider, tenantId);
      if (accounts.length === 1) {
        account = accounts[0]!;
      }
    }

    if (!account) return null;

    const apiKey = await this.secretsManager.get(account.secretName);
    if (!apiKey) return null;

    return { apiKey, accountId: account.id };
  }

  // ─── Environment Import ──────────────────────────────────────

  /**
   * Scan environment variables and create default accounts for providers
   * that have keys set. Idempotent — skips providers that already have accounts.
   */
  async importFromEnv(tenantId?: string): Promise<number> {
    let imported = 0;

    for (const [provider, envVar] of Object.entries(PROVIDER_KEY_ENV)) {
      if (!envVar) continue;
      const envValue = process.env[envVar];
      if (!envValue) continue;

      // Check if this provider already has accounts
      const existing = await this.storage.getAccountsByProvider(provider, tenantId);
      if (existing.length > 0) continue;

      await this.createAccount({
        provider,
        label: `${provider} (imported from env)`,
        apiKey: envValue,
        isDefault: true,
        tenantId,
      });
      imported++;
    }

    return imported;
  }

  // ─── Validation ──────────────────────────────────────────────

  async validateAccount(id: string): Promise<ProviderAccount | null> {
    const account = await this.storage.getAccount(id);
    if (!account) return null;

    const apiKey = await this.secretsManager.get(account.secretName);
    if (!apiKey) {
      await this.storage.updateValidation(id, 'invalid', { error: 'Secret not found' });
      return this.storage.getAccount(id);
    }

    const result = await this.validator.validate(
      account.provider as AIProviderName,
      apiKey,
      account.baseUrl ?? undefined
    );

    const status = result.valid ? 'active' : 'invalid';
    const info: Record<string, unknown> = {};
    if (result.models) info.models = result.models;
    if (result.error) info.error = result.error;

    await this.storage.updateValidation(id, status, Object.keys(info).length > 0 ? info : undefined);

    if (!result.valid) {
      this.alertOnInvalid(account, result.error);
    }

    return this.storage.getAccount(id);
  }

  async validateAllAccounts(tenantId?: string): Promise<{ total: number; valid: number; invalid: number }> {
    const accounts = await this.storage.listAccounts(undefined, tenantId);
    let valid = 0;
    let invalid = 0;

    for (const account of accounts) {
      const validated = await this.validateAccount(account.id);
      if (validated?.status === 'active') valid++;
      else invalid++;
    }

    return { total: accounts.length, valid, invalid };
  }

  // ─── Key Rotation ────────────────────────────────────────────

  async rotateKey(id: string, newKey: string): Promise<ProviderAccount | null> {
    const account = await this.storage.getAccount(id);
    if (!account) return null;

    await this.secretsManager.set(account.secretName, newKey);

    // Re-validate with the new key
    return this.validateAccount(id);
  }

  // ─── Cost Recording ──────────────────────────────────────────

  /**
   * Record a cost entry for an account. Fire-and-forget — callers should
   * catch and discard errors to avoid blocking request processing.
   */
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
    await this.storage.recordCost(record);
  }

  async getCostSummary(opts: {
    from?: number;
    to?: number;
    accountId?: string;
    tenantId?: string;
  }) {
    return this.storage.getCostSummary(opts);
  }

  async getCostTrend(opts: { accountId?: string; days?: number; tenantId?: string }) {
    return this.storage.getCostTrend(opts);
  }

  async getTopAccounts(limit?: number, tenantId?: string) {
    return this.storage.getTopAccounts(limit, tenantId);
  }

  // ─── Private ─────────────────────────────────────────────────

  private alertOnInvalid(account: ProviderAccount, error?: string): void {
    const alertManager = this.getAlertManager?.();
    if (!alertManager) return;

    // Fire-and-forget alert
    const snapshot = {
      ai: {
        provider_account_invalid: {
          provider: account.provider,
          label: account.label,
          accountId: account.id,
          error: error ?? 'unknown',
          severity: 1,
        },
      },
    };
    alertManager.evaluate(snapshot as never).catch(() => {});
  }

  private async audit(event: string, metadata: Record<string, unknown>): Promise<void> {
    if (!this.auditChain) return;
    try {
      await this.auditChain.record({
        event,
        level: 'info',
        message: event.replace(/_/g, ' '),
        metadata,
      });
    } catch {
      // Audit logging should never block operations
    }
  }
}
