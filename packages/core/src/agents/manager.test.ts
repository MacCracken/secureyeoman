import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubAgentManager } from './manager.js';
import type { DelegationConfig } from '@friday/shared';

// Mock dependencies
const mockStorage = {
  seedBuiltinProfiles: vi.fn(),
  getProfile: vi.fn(),
  getProfileByName: vi.fn(),
  listProfiles: vi.fn().mockResolvedValue([]),
  createProfile: vi.fn(),
  updateProfile: vi.fn(),
  deleteProfile: vi.fn(),
  createDelegation: vi.fn(),
  updateDelegation: vi.fn(),
  getDelegation: vi.fn(),
  listDelegations: vi.fn().mockResolvedValue({ delegations: [], total: 0 }),
  getActiveDelegations: vi.fn().mockResolvedValue([]),
  getDelegationTree: vi.fn().mockResolvedValue([]),
  storeDelegationMessage: vi.fn(),
  getDelegationMessages: vi.fn().mockResolvedValue([]),
  close: vi.fn(),
};

const mockAuditChain = {
  record: vi.fn(),
};

const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn().mockReturnThis(),
};

const defaultConfig: DelegationConfig = {
  enabled: true,
  maxDepth: 3,
  defaultTimeout: 300000,
  maxConcurrent: 5,
  tokenBudget: { default: 50000, max: 200000 },
  context: { sealOnComplete: true, brainWriteScope: 'delegated' },
};

describe('SubAgentManager', () => {
  let manager: SubAgentManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new SubAgentManager(defaultConfig, {
      storage: mockStorage as any,
      aiClientConfig: { model: { provider: 'anthropic', model: 'test' } as any },
      aiClientDeps: {},
      auditChain: mockAuditChain as any,
      logger: mockLogger as any,
    });
  });

  describe('initialize', () => {
    it('seeds built-in profiles', async () => {
      await manager.initialize();
      expect(mockStorage.seedBuiltinProfiles).toHaveBeenCalledOnce();
    });
  });

  describe('delegate', () => {
    it('throws when delegation is disabled', async () => {
      const disabledManager = new SubAgentManager(
        { ...defaultConfig, enabled: false },
        {
          storage: mockStorage as any,
          aiClientConfig: { model: { provider: 'anthropic', model: 'test' } as any },
          aiClientDeps: {},
          auditChain: mockAuditChain as any,
          logger: mockLogger as any,
        }
      );

      await expect(
        disabledManager.delegate({ profile: 'researcher', task: 'test' })
      ).rejects.toThrow('Sub-agent delegation is not enabled');
    });

    it('throws when max depth is reached', async () => {
      mockStorage.getProfile.mockResolvedValue({
        id: 'test',
        name: 'researcher',
        maxTokenBudget: 50000,
        allowedTools: [],
      });

      await expect(
        manager.delegate({ profile: 'researcher', task: 'test' }, { depth: 3 })
      ).rejects.toThrow('Maximum delegation depth (3) reached');
    });

    it('throws when profile is not found', async () => {
      mockStorage.getProfile.mockResolvedValue(null);
      mockStorage.getProfileByName.mockResolvedValue(null);

      await expect(manager.delegate({ profile: 'nonexistent', task: 'test' })).rejects.toThrow(
        'Agent profile not found: nonexistent'
      );
    });
  });

  describe('profile CRUD passthrough', () => {
    it('delegates listProfiles to storage', async () => {
      await manager.listProfiles();
      expect(mockStorage.listProfiles).toHaveBeenCalledOnce();
    });

    it('delegates getProfile to storage', async () => {
      await manager.getProfile('test-id');
      expect(mockStorage.getProfile).toHaveBeenCalledWith('test-id');
    });

    it('delegates createProfile to storage', async () => {
      const data = { name: 'test', systemPrompt: 'test' };
      await manager.createProfile(data);
      expect(mockStorage.createProfile).toHaveBeenCalledWith(data);
    });

    it('delegates deleteProfile to storage', async () => {
      await manager.deleteProfile('test-id');
      expect(mockStorage.deleteProfile).toHaveBeenCalledWith('test-id');
    });
  });

  describe('listActive', () => {
    it('returns empty array when no active delegations', async () => {
      const active = await manager.listActive();
      expect(active).toEqual([]);
    });
  });

  describe('cancel', () => {
    it('updates delegation status on cancel', async () => {
      // No active delegation, so only storage is updated
      await manager.cancel('test-id');
      // No active delegation found, so no abort happens
    });
  });

  describe('getConfig', () => {
    it('returns the delegation config', () => {
      const config = manager.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.maxDepth).toBe(3);
      expect(config.maxConcurrent).toBe(5);
    });
  });
});
