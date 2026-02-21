import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubAgentManager } from './manager.js';
import type { DelegationConfig } from '@secureyeoman/shared';

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

  describe('security policy', () => {
    it('isAllowedBySecurityPolicy returns true when no securityConfig', () => {
      expect(manager.isAllowedBySecurityPolicy()).toBe(true);
    });

    it('isAllowedBySecurityPolicy returns false when allowSubAgents is false', () => {
      const restrictedManager = new SubAgentManager(defaultConfig, {
        storage: mockStorage as any,
        aiClientConfig: { model: { provider: 'anthropic', model: 'test' } as any },
        aiClientDeps: {},
        auditChain: mockAuditChain as any,
        logger: mockLogger as any,
        securityConfig: { allowSubAgents: false } as any,
      });
      expect(restrictedManager.isAllowedBySecurityPolicy()).toBe(false);
    });

    it('delegate throws when securityConfig.allowSubAgents is false', async () => {
      const restrictedManager = new SubAgentManager(defaultConfig, {
        storage: mockStorage as any,
        aiClientConfig: { model: { provider: 'anthropic', model: 'test' } as any },
        aiClientDeps: {},
        auditChain: mockAuditChain as any,
        logger: mockLogger as any,
        securityConfig: { allowSubAgents: false } as any,
      });
      await expect(
        restrictedManager.delegate({ profile: 'researcher', task: 'test' })
      ).rejects.toThrow('disabled by security policy');
    });
  });

  describe('max concurrent delegations', () => {
    it('throws when activeDelegations map is at max capacity', async () => {
      // Pre-fill the private activeDelegations map to simulate max concurrent
      for (let i = 0; i < 5; i++) {
        (manager as any).activeDelegations.set(`fake-del-${i}`, {
          abortController: new AbortController(),
          promise: new Promise(() => {}),
          startedAt: Date.now(),
          profileName: 'test',
          task: 'task',
          depth: 0,
          tokenBudget: 10000,
          tokensUsed: 0,
        });
      }
      await expect(manager.delegate({ profile: 'researcher', task: 'test' })).rejects.toThrow(
        'Maximum concurrent delegations'
      );
    });
  });

  describe('delegation query passthrough', () => {
    it('getResult returns null when delegation not found', async () => {
      mockStorage.getDelegation.mockResolvedValue(null);
      const result = await manager.getResult('nonexistent');
      expect(result).toBeNull();
    });

    it('getDelegation delegates to storage', async () => {
      mockStorage.getDelegation.mockResolvedValue({ id: 'del-1' });
      const result = await manager.getDelegation('del-1');
      expect(mockStorage.getDelegation).toHaveBeenCalledWith('del-1');
      expect(result).toEqual({ id: 'del-1' });
    });

    it('listDelegations delegates to storage', async () => {
      await manager.listDelegations({ status: 'completed', limit: 10 });
      expect(mockStorage.listDelegations).toHaveBeenCalled();
    });

    it('getActiveDelegations delegates to storage', async () => {
      await manager.getActiveDelegations();
      expect(mockStorage.getActiveDelegations).toHaveBeenCalled();
    });

    it('getDelegationTree delegates to storage', async () => {
      await manager.getDelegationTree('root-id');
      expect(mockStorage.getDelegationTree).toHaveBeenCalledWith('root-id');
    });

    it('getDelegationMessages delegates to storage', async () => {
      await manager.getDelegationMessages('del-1');
      expect(mockStorage.getDelegationMessages).toHaveBeenCalledWith('del-1');
    });

    it('updateProfile delegates to storage', async () => {
      mockStorage.updateProfile = vi.fn().mockResolvedValue({ id: 'prof-1', name: 'updated' });
      const result = await manager.updateProfile('prof-1', { name: 'updated' });
      expect(mockStorage.updateProfile).toHaveBeenCalledWith('prof-1', { name: 'updated' });
      expect(result).toEqual({ id: 'prof-1', name: 'updated' });
    });
  });

  describe('cancel with active delegation', () => {
    it('aborts active delegation and updates storage', async () => {
      const abortSpy = vi.fn();
      const mockAbortController = { abort: abortSpy, signal: {} };
      (manager as any).activeDelegations.set('del-cancel', {
        abortController: mockAbortController,
        promise: new Promise(() => {}),
        startedAt: Date.now(),
        profileName: 'test',
        task: 'task',
        depth: 0,
        tokenBudget: 10000,
        tokensUsed: 0,
      });

      await manager.cancel('del-cancel');
      expect(abortSpy).toHaveBeenCalled();
      expect(mockStorage.updateDelegation).toHaveBeenCalledWith(
        'del-cancel',
        expect.objectContaining({ status: 'cancelled' })
      );
    });
  });

  describe('binary profile — allowBinaryAgents disabled', () => {
    it('returns failed result when allowBinaryAgents is false', async () => {
      const securedManager = new SubAgentManager(defaultConfig, {
        storage: mockStorage as any,
        aiClientConfig: { model: { provider: 'anthropic', model: 'test' } as any },
        aiClientDeps: {},
        auditChain: mockAuditChain as any,
        logger: mockLogger as any,
        securityConfig: { allowSubAgents: true, allowBinaryAgents: false } as any,
      });

      const binaryProfile = {
        id: 'binary-profile-1',
        name: 'binary-runner',
        systemPrompt: '',
        maxTokenBudget: 50000,
        allowedTools: [],
        type: 'binary',
        command: '/usr/bin/echo',
        commandArgs: ['hello'],
      };

      mockStorage.getProfile.mockResolvedValue(binaryProfile);
      mockStorage.createDelegation.mockResolvedValue(undefined);
      mockStorage.updateDelegation.mockResolvedValue(undefined);

      const result = await securedManager.delegate({ profile: 'binary-runner', task: 'run task' });
      expect(result.status).toBe('failed');
      expect(result.error).toContain('allowBinaryAgents');
    });
  });

  describe('mcp-bridge profile — no mcpClient', () => {
    it('returns failed result when no mcpClient is configured', async () => {
      const mcpProfile = {
        id: 'mcp-profile-1',
        name: 'mcp-bridge-agent',
        systemPrompt: '',
        maxTokenBudget: 50000,
        allowedTools: [],
        type: 'mcp-bridge',
        mcpTool: 'my-mcp-tool',
      };

      mockStorage.getProfile.mockResolvedValue(mcpProfile);
      mockStorage.createDelegation.mockResolvedValue(undefined);
      mockStorage.updateDelegation.mockResolvedValue(undefined);

      // manager has no mcpClient — mcp-bridge should fail
      const result = await manager.delegate({ profile: 'mcp-bridge-agent', task: 'bridge task' });
      expect(result.status).toBe('failed');
      expect(result.error).toContain('MCP client not available');
    });
  });

  describe('listActive with active delegations', () => {
    it('returns info for active delegations', async () => {
      (manager as any).activeDelegations.set('del-active', {
        abortController: new AbortController(),
        promise: new Promise(() => {}),
        startedAt: Date.now() - 1000,
        profileName: 'researcher',
        task: 'active task',
        depth: 1,
        tokenBudget: 25000,
        tokensUsed: 500,
      });

      const active = await manager.listActive();
      expect(active).toHaveLength(1);
      expect(active[0].profileName).toBe('researcher');
      expect(active[0].task).toBe('active task');
      expect(active[0].status).toBe('running');
      expect(active[0].elapsedMs).toBeGreaterThan(0);

      // Cleanup
      (manager as any).activeDelegations.clear();
    });
  });
});
