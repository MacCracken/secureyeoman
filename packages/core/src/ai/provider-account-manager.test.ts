/**
 * ProviderAccountManager Tests (Phase 112)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProviderAccountManager } from './provider-account-manager.js';

const mockStorage = {
  createAccount: vi.fn(),
  getAccount: vi.fn(),
  updateAccount: vi.fn(),
  deleteAccount: vi.fn(),
  listAccounts: vi.fn(),
  getDefaultAccount: vi.fn(),
  getAccountsByProvider: vi.fn(),
  setDefault: vi.fn(),
  updateValidation: vi.fn(),
  recordCost: vi.fn(),
  getCostSummary: vi.fn(),
  getCostTrend: vi.fn(),
  getTopAccounts: vi.fn(),
};

const mockSecretsManager = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
  has: vi.fn(),
  keys: vi.fn(),
  initialize: vi.fn(),
};

const mockValidator = {
  validate: vi.fn(),
};

const mockAuditChain = {
  record: vi.fn().mockResolvedValue(undefined),
};

function makeAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: 'acc-1',
    provider: 'anthropic',
    label: 'Test Key',
    secretName: 'provider_account_anthropic_123',
    isDefault: true,
    accountInfo: null,
    status: 'active',
    lastValidatedAt: null,
    baseUrl: null,
    tenantId: null,
    createdBy: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('ProviderAccountManager', () => {
  let manager: ProviderAccountManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new ProviderAccountManager({
      storage: mockStorage as any,
      secretsManager: mockSecretsManager as any,
      validator: mockValidator as any,
      auditChain: mockAuditChain as any,
    });
  });

  describe('createAccount', () => {
    it('stores key in secrets manager and creates storage record', async () => {
      const account = makeAccount();
      mockStorage.createAccount.mockResolvedValue(account);

      const result = await manager.createAccount({
        provider: 'anthropic',
        label: 'Test',
        apiKey: 'sk-test-key',
      });

      expect(mockSecretsManager.set).toHaveBeenCalledTimes(1);
      expect(mockStorage.createAccount).toHaveBeenCalledTimes(1);
      expect(result.id).toBe('acc-1');
    });
  });

  describe('deleteAccount', () => {
    it('removes secret and deletes from storage', async () => {
      mockStorage.getAccount.mockResolvedValue(makeAccount());
      mockStorage.deleteAccount.mockResolvedValue(true);
      mockSecretsManager.delete.mockResolvedValue(true);

      const result = await manager.deleteAccount('acc-1');
      expect(result).toBe(true);
      expect(mockSecretsManager.delete).toHaveBeenCalled();
      expect(mockStorage.deleteAccount).toHaveBeenCalledWith('acc-1');
    });

    it('returns false for nonexistent account', async () => {
      mockStorage.getAccount.mockResolvedValue(null);
      const result = await manager.deleteAccount('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('resolveApiKey', () => {
    it('resolves by explicit accountId', async () => {
      const account = makeAccount();
      mockStorage.getAccount.mockResolvedValue(account);
      mockSecretsManager.get.mockResolvedValue('sk-test');

      const result = await manager.resolveApiKey('anthropic', 'acc-1');
      expect(result).toEqual({ apiKey: 'sk-test', accountId: 'acc-1' });
    });

    it('falls back to provider default', async () => {
      const account = makeAccount();
      mockStorage.getAccount.mockResolvedValue(null);
      mockStorage.getDefaultAccount.mockResolvedValue(account);
      mockSecretsManager.get.mockResolvedValue('sk-default');

      const result = await manager.resolveApiKey('anthropic');
      expect(result).toEqual({ apiKey: 'sk-default', accountId: 'acc-1' });
    });

    it('falls back to sole account', async () => {
      const account = makeAccount();
      mockStorage.getAccount.mockResolvedValue(null);
      mockStorage.getDefaultAccount.mockResolvedValue(null);
      mockStorage.getAccountsByProvider.mockResolvedValue([account]);
      mockSecretsManager.get.mockResolvedValue('sk-sole');

      const result = await manager.resolveApiKey('anthropic');
      expect(result).toEqual({ apiKey: 'sk-sole', accountId: 'acc-1' });
    });

    it('returns null when no account found', async () => {
      mockStorage.getAccount.mockResolvedValue(null);
      mockStorage.getDefaultAccount.mockResolvedValue(null);
      mockStorage.getAccountsByProvider.mockResolvedValue([]);

      const result = await manager.resolveApiKey('anthropic');
      expect(result).toBeNull();
    });

    it('returns null when secret not found', async () => {
      const account = makeAccount();
      mockStorage.getAccount.mockResolvedValue(account);
      mockSecretsManager.get.mockResolvedValue(undefined);

      const result = await manager.resolveApiKey('anthropic', 'acc-1');
      expect(result).toBeNull();
    });
  });

  describe('importFromEnv', () => {
    it('creates accounts for providers with env vars set', async () => {
      const origEnv = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = 'sk-test-env';
      mockStorage.getAccountsByProvider.mockResolvedValue([]);
      mockStorage.createAccount.mockResolvedValue(makeAccount());

      const imported = await manager.importFromEnv();
      expect(imported).toBeGreaterThanOrEqual(1);

      if (origEnv === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = origEnv;
    });

    it('skips providers that already have accounts', async () => {
      const origEnv = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = 'sk-test-env';
      mockStorage.getAccountsByProvider.mockResolvedValue([makeAccount()]);

      const _count = await manager.importFromEnv();
      // Should not create for anthropic since it already has accounts
      const anthropicCalls = mockStorage.createAccount.mock.calls.filter(
        (call: any) => call[0]?.provider === 'anthropic'
      );
      expect(anthropicCalls).toHaveLength(0);

      if (origEnv === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = origEnv;
    });
  });

  describe('validateAccount', () => {
    it('validates and updates status to active', async () => {
      const account = makeAccount();
      mockStorage.getAccount
        .mockResolvedValueOnce(account)
        .mockResolvedValueOnce({ ...account, status: 'active' });
      mockSecretsManager.get.mockResolvedValue('sk-test');
      mockValidator.validate.mockResolvedValue({ valid: true, models: ['claude-sonnet-4'] });

      const result = await manager.validateAccount('acc-1');
      expect(mockStorage.updateValidation).toHaveBeenCalledWith(
        'acc-1',
        'active',
        expect.any(Object)
      );
      expect(result!.status).toBe('active');
    });

    it('marks invalid when validation fails', async () => {
      const account = makeAccount();
      mockStorage.getAccount
        .mockResolvedValueOnce(account)
        .mockResolvedValueOnce({ ...account, status: 'invalid' });
      mockSecretsManager.get.mockResolvedValue('sk-bad');
      mockValidator.validate.mockResolvedValue({ valid: false, error: 'Invalid API key' });

      const _result = await manager.validateAccount('acc-1');
      expect(mockStorage.updateValidation).toHaveBeenCalledWith(
        'acc-1',
        'invalid',
        expect.objectContaining({ error: 'Invalid API key' })
      );
    });
  });

  describe('rotateKey', () => {
    it('updates secret and re-validates', async () => {
      const account = makeAccount();
      mockStorage.getAccount
        .mockResolvedValueOnce(account)
        .mockResolvedValueOnce(account)
        .mockResolvedValueOnce({ ...account, status: 'active' });
      mockSecretsManager.get.mockResolvedValue('sk-new');
      mockValidator.validate.mockResolvedValue({ valid: true });

      const _result = await manager.rotateKey('acc-1', 'sk-new');
      expect(mockSecretsManager.set).toHaveBeenCalledWith(account.secretName, 'sk-new');
    });
  });

  describe('recordCost', () => {
    it('delegates to storage', async () => {
      mockStorage.recordCost.mockResolvedValue(undefined);
      await manager.recordCost({
        accountId: 'acc-1',
        model: 'claude-sonnet-4',
        inputTokens: 100,
        outputTokens: 200,
        totalTokens: 300,
        costUsd: 0.001,
      });
      expect(mockStorage.recordCost).toHaveBeenCalledTimes(1);
    });
  });
});
