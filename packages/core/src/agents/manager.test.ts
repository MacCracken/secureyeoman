import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { SubAgentManager } from './manager.js';
import type { DelegationConfig } from '@secureyeoman/shared';

// Mock AIClient so tests don't call a real AI provider
const mockAiChat = vi.fn();
vi.mock('../ai/client.js', () => {
  // Use a class so vi.clearAllMocks() doesn't destroy the constructor
  return {
    AIClient: class MockAIClient {
      chat = mockAiChat;
    },
  };
});

// Mock child_process.spawn for binary profile tests
const mockSpawn = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({ spawn: mockSpawn }));

// Mock dependencies
const mockStorage = {
  seedBuiltinProfiles: vi.fn(),
  getStoredEnabled: vi.fn().mockResolvedValue(null),
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
  pruneDelegations: vi.fn().mockResolvedValue(0),
  storeEnabled: vi.fn().mockResolvedValue(undefined),
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
    defaultConfig.enabled = true;
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

  // ── LLM execution path ─────────────────────────────────────────────

  describe('LLM delegation — happy path', () => {
    it('completes delegation and returns result when AI responds with end_turn', async () => {
      const llmProfile = {
        id: 'llm-profile-1',
        name: 'researcher',
        systemPrompt: 'You are a researcher.',
        maxTokenBudget: 50000,
        allowedTools: [],
        defaultModel: undefined,
        // no type → defaults to 'llm'
      };

      mockStorage.getProfile.mockResolvedValue(llmProfile);
      mockStorage.createDelegation.mockResolvedValue(undefined);
      mockStorage.updateDelegation.mockResolvedValue(undefined);
      mockStorage.storeDelegationMessage.mockResolvedValue(undefined);

      mockAiChat.mockResolvedValue({
        content: 'Research complete.',
        stopReason: 'end_turn',
        toolCalls: [],
        usage: { inputTokens: 200, outputTokens: 100 },
      });

      const result = await manager.delegate({
        profile: 'researcher',
        task: 'Research quantum computing',
      });

      expect(result.status).toBe('completed');
      expect(result.result).toBe('Research complete.');
      expect(result.tokenUsage.total).toBe(300);
      expect(mockStorage.updateDelegation).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ status: 'completed' })
      );
    });

    it('includes context in user message when context is provided', async () => {
      const llmProfile = {
        id: 'llm-profile-2',
        name: 'analyst',
        systemPrompt: 'You are an analyst.',
        maxTokenBudget: 50000,
        allowedTools: [],
      };

      mockStorage.getProfile.mockResolvedValue(llmProfile);
      mockStorage.createDelegation.mockResolvedValue(undefined);
      mockStorage.updateDelegation.mockResolvedValue(undefined);
      mockStorage.storeDelegationMessage.mockResolvedValue(undefined);

      mockAiChat.mockResolvedValue({
        content: 'Analysis done.',
        stopReason: 'end_turn',
        toolCalls: [],
        usage: { inputTokens: 100, outputTokens: 50 },
      });

      await manager.delegate({
        profile: 'analyst',
        task: 'Analyze this data',
        context: 'Background: prior research',
      });

      const chatArgs = mockAiChat.mock.calls[0][0];
      const userMsg = chatArgs.messages.find((m: any) => m.role === 'user');
      expect(userMsg.content).toContain('Context:');
      expect(userMsg.content).toContain('Background: prior research');
    });
  });

  describe('LLM delegation — token budget exhaustion', () => {
    it('returns failed result when token budget is exceeded', async () => {
      const llmProfile = {
        id: 'llm-profile-budget',
        name: 'spendthrift',
        systemPrompt: 'You burn tokens.',
        maxTokenBudget: 100,
        allowedTools: [],
      };

      mockStorage.getProfile.mockResolvedValue(llmProfile);
      mockStorage.createDelegation.mockResolvedValue(undefined);
      mockStorage.updateDelegation.mockResolvedValue(undefined);

      // Return a tool call response that uses 120 tokens — exceeds 100 budget
      // loop exits after first iteration because 120 > 100
      mockAiChat.mockResolvedValue({
        content: '',
        stopReason: 'tool_use',
        toolCalls: [{ id: 'tc-b', name: 'list_sub_agents', arguments: {} }],
        usage: { inputTokens: 60, outputTokens: 60 },
      });

      const tightManager = new SubAgentManager(
        { ...defaultConfig, tokenBudget: { default: 100, max: 100 } },
        {
          storage: mockStorage as any,
          aiClientConfig: { model: { provider: 'anthropic', model: 'test' } as any },
          aiClientDeps: {},
          auditChain: mockAuditChain as any,
          logger: mockLogger as any,
        }
      );

      const result = await tightManager.delegate({
        profile: 'spendthrift',
        task: 'Do stuff',
        maxTokenBudget: 100,
      });
      expect(result.status).toBe('failed');
      expect(result.error).toContain('Token budget');
    });
  });

  describe('LLM delegation — list_sub_agents tool call', () => {
    it('dispatches list_sub_agents tool and continues loop', async () => {
      const llmProfile = {
        id: 'llm-list',
        name: 'orchestrator',
        systemPrompt: 'You orchestrate.',
        maxTokenBudget: 50000,
        allowedTools: [],
      };

      mockStorage.getProfile.mockResolvedValue(llmProfile);
      mockStorage.createDelegation.mockResolvedValue(undefined);
      mockStorage.updateDelegation.mockResolvedValue(undefined);
      mockStorage.storeDelegationMessage.mockResolvedValue(undefined);

      // First response: tool call to list_sub_agents
      // Second response: end_turn
      mockAiChat
        .mockResolvedValueOnce({
          content: '',
          stopReason: 'tool_use',
          toolCalls: [{ id: 'tc-1', name: 'list_sub_agents', arguments: {} }],
          usage: { inputTokens: 100, outputTokens: 20 },
        })
        .mockResolvedValueOnce({
          content: 'Done.',
          stopReason: 'end_turn',
          toolCalls: [],
          usage: { inputTokens: 50, outputTokens: 10 },
        });

      const result = await manager.delegate({ profile: 'orchestrator', task: 'List agents' });
      expect(result.status).toBe('completed');
      expect(result.result).toBe('Done.');
    });
  });

  describe('LLM delegation — get_delegation_result tool call', () => {
    it('returns delegation result via get_delegation_result tool', async () => {
      const llmProfile = {
        id: 'llm-get-result',
        name: 'checker',
        systemPrompt: 'You check results.',
        maxTokenBudget: 50000,
        allowedTools: [],
      };

      mockStorage.getProfile.mockResolvedValue(llmProfile);
      mockStorage.createDelegation.mockResolvedValue(undefined);
      mockStorage.updateDelegation.mockResolvedValue(undefined);
      mockStorage.storeDelegationMessage.mockResolvedValue(undefined);
      mockStorage.getDelegation.mockResolvedValue({
        id: 'del-existing',
        profileId: 'p1',
        status: 'completed',
        result: 'prior result',
        error: null,
        tokensUsedPrompt: 50,
        tokensUsedCompletion: 25,
        startedAt: 1000,
        completedAt: 2000,
      });
      mockStorage.getDelegationTree.mockResolvedValue([]);

      mockAiChat
        .mockResolvedValueOnce({
          content: '',
          stopReason: 'tool_use',
          toolCalls: [
            {
              id: 'tc-2',
              name: 'get_delegation_result',
              arguments: { delegationId: 'del-existing' },
            },
          ],
          usage: { inputTokens: 100, outputTokens: 20 },
        })
        .mockResolvedValueOnce({
          content: 'Got the result.',
          stopReason: 'end_turn',
          toolCalls: [],
          usage: { inputTokens: 50, outputTokens: 10 },
        });

      const result = await manager.delegate({ profile: 'checker', task: 'Check result' });
      expect(result.status).toBe('completed');
    });
  });

  // ── getResult with existing delegation ─────────────────────────────

  describe('getResult with completed delegation', () => {
    it('builds result from completed delegation record', async () => {
      mockStorage.getDelegation.mockResolvedValue({
        id: 'del-done',
        profileId: 'prof-1',
        status: 'completed',
        result: 'Final answer',
        error: null,
        tokensUsedPrompt: 100,
        tokensUsedCompletion: 50,
        startedAt: 1000,
        completedAt: 2500,
        depth: 0,
        maxDepth: 3,
        task: 'Test task',
        timeoutMs: 30000,
        tokenBudget: 50000,
        initiatedBy: 'user',
      });
      mockStorage.getDelegationTree.mockResolvedValue([]);
      mockStorage.getProfile.mockResolvedValue({ id: 'prof-1', name: 'researcher' });

      const result = await manager.getResult('del-done');
      expect(result).not.toBeNull();
      expect(result!.status).toBe('completed');
      expect(result!.result).toBe('Final answer');
      expect(result!.profile).toBe('researcher');
      expect(result!.tokenUsage.total).toBe(150);
      expect(result!.durationMs).toBe(1500);
    });

    it('falls back to profileId when profile not found', async () => {
      mockStorage.getDelegation.mockResolvedValue({
        id: 'del-orphan',
        profileId: 'deleted-profile-id',
        status: 'failed',
        result: null,
        error: 'some error',
        tokensUsedPrompt: 0,
        tokensUsedCompletion: 0,
        startedAt: 1000,
        completedAt: 1500,
      });
      mockStorage.getDelegationTree.mockResolvedValue([]);
      mockStorage.getProfile.mockResolvedValue(null);

      const result = await manager.getResult('del-orphan');
      expect(result!.profile).toBe('deleted-profile-id');
    });
  });

  // ── MCP bridge — success path ───────────────────────────────────────

  describe('mcp-bridge profile — success path', () => {
    it('calls mcpClient.callTool and returns result', async () => {
      const mockMcpClient = {
        getAllTools: vi
          .fn()
          .mockReturnValue([{ name: 'my-mcp-tool', serverId: 'server-1', description: 'A tool' }]),
        callTool: vi.fn().mockResolvedValue('MCP tool result'),
      };

      const mcpManager = new SubAgentManager(defaultConfig, {
        storage: mockStorage as any,
        aiClientConfig: { model: { provider: 'anthropic', model: 'test' } as any },
        aiClientDeps: {},
        auditChain: mockAuditChain as any,
        logger: mockLogger as any,
        mcpClient: mockMcpClient as any,
      });

      const mcpProfile = {
        id: 'mcp-success',
        name: 'mcp-runner',
        systemPrompt: '',
        maxTokenBudget: 50000,
        allowedTools: [],
        type: 'mcp-bridge',
        mcpTool: 'my-mcp-tool',
      };

      mockStorage.getProfile.mockResolvedValue(mcpProfile);
      mockStorage.createDelegation.mockResolvedValue(undefined);
      mockStorage.updateDelegation.mockResolvedValue(undefined);

      const result = await mcpManager.delegate({ profile: 'mcp-runner', task: 'run tool task' });
      expect(result.status).toBe('completed');
      expect(result.result).toBe('MCP tool result');
      expect(mockMcpClient.callTool).toHaveBeenCalledWith(
        'server-1',
        'my-mcp-tool',
        expect.any(Object)
      );
    });

    it('returns failed when mcpTool not found in available tools', async () => {
      const mockMcpClient = {
        getAllTools: vi.fn().mockReturnValue([]),
        callTool: vi.fn(),
      };

      const mcpManager = new SubAgentManager(defaultConfig, {
        storage: mockStorage as any,
        aiClientConfig: { model: { provider: 'anthropic', model: 'test' } as any },
        aiClientDeps: {},
        auditChain: mockAuditChain as any,
        logger: mockLogger as any,
        mcpClient: mockMcpClient as any,
      });

      const mcpProfile = {
        id: 'mcp-missing',
        name: 'mcp-missing-tool',
        systemPrompt: '',
        maxTokenBudget: 50000,
        allowedTools: [],
        type: 'mcp-bridge',
        mcpTool: 'nonexistent-tool',
      };

      mockStorage.getProfile.mockResolvedValue(mcpProfile);
      mockStorage.createDelegation.mockResolvedValue(undefined);
      mockStorage.updateDelegation.mockResolvedValue(undefined);

      const result = await mcpManager.delegate({ profile: 'mcp-missing-tool', task: 'task' });
      expect(result.status).toBe('failed');
      expect(result.error).toContain('nonexistent-tool');
    });
  });

  // ── LLM delegation — AI error ─────────────────────────────────────────────

  describe('LLM delegation — AI throws', () => {
    it('returns failed when AI client throws during LLM loop', async () => {
      const llmProfile = {
        id: 'llm-err',
        name: 'researcher',
        systemPrompt: 'You are a researcher.',
        maxTokenBudget: 50000,
        allowedTools: [],
      };

      mockStorage.getProfile.mockResolvedValue(llmProfile);
      mockStorage.createDelegation.mockResolvedValue(undefined);
      mockStorage.updateDelegation.mockResolvedValue(undefined);

      mockAiChat.mockRejectedValue(new Error('Provider down'));

      const result = await manager.delegate({ profile: 'researcher', task: 'do something' });
      expect(result.status).toBe('failed');
      expect(result.error).toContain('Provider down');
    });
  });

  // ── LLM delegation — unknown tool call ───────────────────────────────────

  describe('LLM delegation — unknown tool name', () => {
    it('returns error content for unknown tool when no mcpClient', async () => {
      const llmProfile = {
        id: 'llm-unknown',
        name: 'researcher',
        systemPrompt: 'You are a researcher.',
        maxTokenBudget: 50000,
        allowedTools: [],
      };

      mockStorage.getProfile.mockResolvedValue(llmProfile);
      mockStorage.createDelegation.mockResolvedValue(undefined);
      mockStorage.updateDelegation.mockResolvedValue(undefined);
      mockStorage.storeDelegationMessage.mockResolvedValue(undefined);

      mockAiChat
        .mockResolvedValueOnce({
          content: '',
          stopReason: 'tool_use',
          toolCalls: [{ id: 'tc-unk', name: 'unknown_tool_xyz', arguments: {} }],
          usage: { inputTokens: 100, outputTokens: 20 },
        })
        .mockResolvedValueOnce({
          content: 'Done.',
          stopReason: 'end_turn',
          toolCalls: [],
          usage: { inputTokens: 50, outputTokens: 10 },
        });

      const result = await manager.delegate({ profile: 'researcher', task: 'test unknown tool' });
      expect(result.status).toBe('completed');
      // Verify the unknown tool response was injected as a tool message
      const secondCall = mockAiChat.mock.calls[1][0];
      const toolMsg = secondCall.messages.find((m: any) => m.role === 'tool');
      expect(toolMsg.content).toContain('Unknown tool');
    });
  });

  // ── LLM delegation — MCP tool dispatch in agentic loop ───────────────────

  describe('LLM delegation — MCP tool dispatch in agentic loop', () => {
    it('dispatches unknown tool call to mcpClient in LLM loop', async () => {
      const mockMcpClient = {
        getAllTools: vi.fn().mockReturnValue([
          {
            name: 'mcp_do_thing',
            serverId: 'server-1',
            description: 'Do thing',
            inputSchema: {},
          },
        ]),
        callTool: vi.fn().mockResolvedValue('mcp result'),
      };

      const mcpManager = new SubAgentManager(defaultConfig, {
        storage: mockStorage as any,
        aiClientConfig: { model: { provider: 'anthropic', model: 'test' } as any },
        aiClientDeps: {},
        auditChain: mockAuditChain as any,
        logger: mockLogger as any,
        mcpClient: mockMcpClient as any,
      });

      const llmProfile = {
        id: 'llm-mcp-loop',
        name: 'researcher',
        systemPrompt: 'You are a researcher.',
        maxTokenBudget: 50000,
        allowedTools: [],
      };

      mockStorage.getProfile.mockResolvedValue(llmProfile);
      mockStorage.createDelegation.mockResolvedValue(undefined);
      mockStorage.updateDelegation.mockResolvedValue(undefined);
      mockStorage.storeDelegationMessage.mockResolvedValue(undefined);

      mockAiChat
        .mockResolvedValueOnce({
          content: '',
          stopReason: 'tool_use',
          toolCalls: [{ id: 'tc-mcp', name: 'mcp_do_thing', arguments: { x: 1 } }],
          usage: { inputTokens: 100, outputTokens: 20 },
        })
        .mockResolvedValueOnce({
          content: 'Done via MCP.',
          stopReason: 'end_turn',
          toolCalls: [],
          usage: { inputTokens: 50, outputTokens: 10 },
        });

      const result = await mcpManager.delegate({ profile: 'researcher', task: 'use mcp' });
      expect(result.status).toBe('completed');
      expect(mockMcpClient.callTool).toHaveBeenCalledWith('server-1', 'mcp_do_thing', { x: 1 });
    });

    it('returns error content when mcpClient.callTool throws', async () => {
      const mockMcpClient = {
        getAllTools: vi
          .fn()
          .mockReturnValue([
            { name: 'mcp_fail_tool', serverId: 'srv', description: 'Fails', inputSchema: {} },
          ]),
        callTool: vi.fn().mockRejectedValue(new Error('MCP call failed')),
      };

      const mcpManager = new SubAgentManager(defaultConfig, {
        storage: mockStorage as any,
        aiClientConfig: { model: { provider: 'anthropic', model: 'test' } as any },
        aiClientDeps: {},
        auditChain: mockAuditChain as any,
        logger: mockLogger as any,
        mcpClient: mockMcpClient as any,
      });

      const llmProfile = {
        id: 'llm-mcp-err',
        name: 'researcher',
        systemPrompt: 'You are a researcher.',
        maxTokenBudget: 50000,
        allowedTools: [],
      };

      mockStorage.getProfile.mockResolvedValue(llmProfile);
      mockStorage.createDelegation.mockResolvedValue(undefined);
      mockStorage.updateDelegation.mockResolvedValue(undefined);
      mockStorage.storeDelegationMessage.mockResolvedValue(undefined);

      mockAiChat
        .mockResolvedValueOnce({
          content: '',
          stopReason: 'tool_use',
          toolCalls: [{ id: 'tc-mcp-err', name: 'mcp_fail_tool', arguments: {} }],
          usage: { inputTokens: 100, outputTokens: 20 },
        })
        .mockResolvedValueOnce({
          content: 'OK.',
          stopReason: 'end_turn',
          toolCalls: [],
          usage: { inputTokens: 50, outputTokens: 10 },
        });

      const result = await mcpManager.delegate({ profile: 'researcher', task: 'use failing mcp' });
      expect(result.status).toBe('completed');
      const secondCall = mockAiChat.mock.calls[1][0];
      const toolMsg = secondCall.messages.find((m: any) => m.role === 'tool');
      expect(toolMsg.content).toContain('MCP tool error');
    });
  });

  // ── LLM delegation — delegate_task tool call ─────────────────────────────

  describe('LLM delegation — delegate_task recursive tool call', () => {
    it('recursively delegates and returns sub-delegation in result', async () => {
      const mainProfile = {
        id: 'llm-orch',
        name: 'orchestrator',
        systemPrompt: 'You orchestrate.',
        maxTokenBudget: 50000,
        allowedTools: [],
      };
      const subProfile = {
        id: 'llm-worker',
        name: 'worker',
        systemPrompt: 'You work.',
        maxTokenBudget: 25000,
        allowedTools: [],
      };

      mockStorage.getProfile.mockResolvedValueOnce(mainProfile).mockResolvedValueOnce(subProfile);
      mockStorage.createDelegation.mockResolvedValue(undefined);
      mockStorage.updateDelegation.mockResolvedValue(undefined);
      mockStorage.storeDelegationMessage.mockResolvedValue(undefined);

      // First: delegate_task tool call
      // Second: sub-delegation completes
      // Third: main loop ends
      mockAiChat
        .mockResolvedValueOnce({
          content: '',
          stopReason: 'tool_use',
          toolCalls: [
            {
              id: 'tc-del',
              name: 'delegate_task',
              arguments: { profile: 'worker', task: 'sub task' },
            },
          ],
          usage: { inputTokens: 100, outputTokens: 20 },
        })
        .mockResolvedValueOnce({
          content: 'Sub task done.',
          stopReason: 'end_turn',
          toolCalls: [],
          usage: { inputTokens: 50, outputTokens: 10 },
        })
        .mockResolvedValueOnce({
          content: 'All done.',
          stopReason: 'end_turn',
          toolCalls: [],
          usage: { inputTokens: 50, outputTokens: 10 },
        });

      const result = await manager.delegate({ profile: 'orchestrator', task: 'orchestrate work' });
      expect(result.status).toBe('completed');
      expect(result.subDelegations).toHaveLength(1);
      expect(result.subDelegations[0].status).toBe('completed');
    });
  });

  // ── Binary profile — spawn success ───────────────────────────────────────

  describe('binary profile — spawn success', () => {
    function makeMockChild() {
      const child = new EventEmitter() as any;
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.stdin = { write: vi.fn(), end: vi.fn() };
      child.kill = vi.fn();
      return child;
    }

    it('returns completed when binary exits 0 with JSON output', async () => {
      const child = makeMockChild();
      mockSpawn.mockImplementation(() => {
        process.nextTick(() => {
          child.stdout.emit('data', Buffer.from(JSON.stringify({ result: 'binary output' })));
          child.emit('close', 0);
        });
        return child;
      });

      const securedManager = new SubAgentManager(defaultConfig, {
        storage: mockStorage as any,
        aiClientConfig: { model: { provider: 'anthropic', model: 'test' } as any },
        aiClientDeps: {},
        auditChain: mockAuditChain as any,
        logger: mockLogger as any,
        securityConfig: { allowSubAgents: true, allowBinaryAgents: true } as any,
      });

      const binaryProfile = {
        id: 'bin-ok',
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

      const result = await securedManager.delegate({ profile: 'binary-runner', task: 'run it' });
      expect(result.status).toBe('completed');
      expect(result.result).toBe('binary output');
    });

    it('returns completed when binary exits 0 with plain text output', async () => {
      const child = makeMockChild();
      mockSpawn.mockImplementation(() => {
        process.nextTick(() => {
          child.stdout.emit('data', Buffer.from('plain text result'));
          child.emit('close', 0);
        });
        return child;
      });

      const securedManager = new SubAgentManager(defaultConfig, {
        storage: mockStorage as any,
        aiClientConfig: { model: { provider: 'anthropic', model: 'test' } as any },
        aiClientDeps: {},
        auditChain: mockAuditChain as any,
        logger: mockLogger as any,
        securityConfig: { allowSubAgents: true, allowBinaryAgents: true } as any,
      });

      const binaryProfile = {
        id: 'bin-plain',
        name: 'binary-runner-plain',
        systemPrompt: '',
        maxTokenBudget: 50000,
        allowedTools: [],
        type: 'binary',
        command: '/usr/bin/echo',
        commandArgs: [],
      };

      mockStorage.getProfile.mockResolvedValue(binaryProfile);
      mockStorage.createDelegation.mockResolvedValue(undefined);
      mockStorage.updateDelegation.mockResolvedValue(undefined);

      const result = await securedManager.delegate({ profile: 'binary-runner-plain', task: 'run' });
      expect(result.status).toBe('completed');
      expect(result.result).toBe('plain text result');
    });

    it('returns failed when binary exits with non-zero code', async () => {
      const child = makeMockChild();
      mockSpawn.mockImplementation(() => {
        process.nextTick(() => {
          child.stderr.emit('data', Buffer.from('error output'));
          child.emit('close', 1);
        });
        return child;
      });

      const securedManager = new SubAgentManager(defaultConfig, {
        storage: mockStorage as any,
        aiClientConfig: { model: { provider: 'anthropic', model: 'test' } as any },
        aiClientDeps: {},
        auditChain: mockAuditChain as any,
        logger: mockLogger as any,
        securityConfig: { allowSubAgents: true, allowBinaryAgents: true } as any,
      });

      const binaryProfile = {
        id: 'bin-fail',
        name: 'binary-runner-fail',
        systemPrompt: '',
        maxTokenBudget: 50000,
        allowedTools: [],
        type: 'binary',
        command: '/usr/bin/false',
        commandArgs: [],
      };

      mockStorage.getProfile.mockResolvedValue(binaryProfile);
      mockStorage.createDelegation.mockResolvedValue(undefined);
      mockStorage.updateDelegation.mockResolvedValue(undefined);

      const result = await securedManager.delegate({ profile: 'binary-runner-fail', task: 'fail' });
      expect(result.status).toBe('failed');
    });

    it('returns failed when spawn emits an error event', async () => {
      const child = makeMockChild();
      mockSpawn.mockImplementation(() => {
        process.nextTick(() => {
          child.emit('error', new Error('ENOENT: command not found'));
        });
        return child;
      });

      const securedManager = new SubAgentManager(defaultConfig, {
        storage: mockStorage as any,
        aiClientConfig: { model: { provider: 'anthropic', model: 'test' } as any },
        aiClientDeps: {},
        auditChain: mockAuditChain as any,
        logger: mockLogger as any,
        securityConfig: { allowSubAgents: true, allowBinaryAgents: true } as any,
      });

      const binaryProfile = {
        id: 'bin-enoent',
        name: 'binary-runner-enoent',
        systemPrompt: '',
        maxTokenBudget: 50000,
        allowedTools: [],
        type: 'binary',
        command: '/nonexistent/binary',
        commandArgs: [],
      };

      mockStorage.getProfile.mockResolvedValue(binaryProfile);
      mockStorage.createDelegation.mockResolvedValue(undefined);
      mockStorage.updateDelegation.mockResolvedValue(undefined);

      const result = await securedManager.delegate({
        profile: 'binary-runner-enoent',
        task: 'fail',
      });
      expect(result.status).toBe('failed');
      expect(result.error).toContain('ENOENT');
    });
  });

  // ── setEnabled ──────────────────────────────────────────────────────────

  describe('setEnabled', () => {
    it('updates config.enabled and persists to storage', async () => {
      mockStorage.storeEnabled = vi.fn().mockResolvedValue(undefined);
      expect(manager.getConfig().enabled).toBe(true);
      await manager.setEnabled(false);
      expect(manager.getConfig().enabled).toBe(false);
      expect(mockStorage.storeEnabled).toHaveBeenCalledWith(false);
      // Restore so subsequent tests aren't affected (shared config ref)
      await manager.setEnabled(true);
    });
  });

  // ── initialize branches ───────────────────────────────────────────────

  describe('initialize — stored enabled state', () => {
    it('restores stored enabled=false from storage', async () => {
      mockStorage.getStoredEnabled.mockResolvedValueOnce(false);
      mockStorage.pruneDelegations.mockResolvedValueOnce(0);
      const mgr = new SubAgentManager(
        { ...defaultConfig, enabled: true },
        {
          storage: mockStorage as any,
          aiClientConfig: { model: { provider: 'anthropic', model: 'test' } as any },
          aiClientDeps: {},
          auditChain: mockAuditChain as any,
          logger: mockLogger as any,
        }
      );
      await mgr.initialize();
      expect(mgr.getConfig().enabled).toBe(false);
    });

    it('logs when pruned > 0', async () => {
      mockStorage.getStoredEnabled.mockResolvedValueOnce(null);
      mockStorage.pruneDelegations.mockResolvedValueOnce(5);
      await manager.initialize();
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Pruned 5'));
    });
  });

  // ── profile lookup by name fallback ─────────────────────────────────────

  describe('delegate — profile lookup by name fallback', () => {
    it('falls back to getProfileByName when getProfile returns null', async () => {
      const namedProfile = {
        id: 'named-1',
        name: 'by-name-profile',
        systemPrompt: 'Sys.',
        maxTokenBudget: 50000,
        allowedTools: [],
      };
      mockStorage.getProfile.mockResolvedValue(null);
      mockStorage.getProfileByName.mockResolvedValue(namedProfile);
      mockStorage.createDelegation.mockResolvedValue(undefined);
      mockStorage.updateDelegation.mockResolvedValue(undefined);
      mockStorage.storeDelegationMessage.mockResolvedValue(undefined);

      mockAiChat.mockResolvedValue({
        content: 'Named result.',
        stopReason: 'end_turn',
        toolCalls: [],
        usage: { inputTokens: 50, outputTokens: 25 },
      });

      const result = await manager.delegate({ profile: 'by-name-profile', task: 'go' });
      expect(result.status).toBe('completed');
      expect(mockStorage.getProfileByName).toHaveBeenCalledWith('by-name-profile');
    });
  });

  // ── token budget clamping (MIN_TOKEN_BUDGET = 20_000) ─────────────────

  describe('delegate — token budget clamping', () => {
    it('clamps token budget up to MIN_TOKEN_BUDGET (20k) when caller requests less', async () => {
      const profile = {
        id: 'clamp-prof',
        name: 'clamp-profile',
        systemPrompt: 'Sys.',
        maxTokenBudget: 100000,
        allowedTools: [],
      };
      mockStorage.getProfile.mockResolvedValue(profile);
      mockStorage.createDelegation.mockResolvedValue(undefined);
      mockStorage.updateDelegation.mockResolvedValue(undefined);
      mockStorage.storeDelegationMessage.mockResolvedValue(undefined);

      mockAiChat.mockResolvedValue({
        content: 'Done.',
        stopReason: 'end_turn',
        toolCalls: [],
        usage: { inputTokens: 10, outputTokens: 5 },
      });

      await manager.delegate({
        profile: 'clamp-profile',
        task: 'test',
        maxTokenBudget: 100, // way below 20k floor
      });

      // The createDelegation call should have tokenBudget >= 20000
      const createCall = mockStorage.createDelegation.mock.calls[0][0];
      expect(createCall.tokenBudget).toBeGreaterThanOrEqual(20000);
    });
  });

  // ── model router branches ──────────────────────────────────────────────

  describe('delegate — model router', () => {
    it('uses model router selected model when confidence >= 0.5', async () => {
      const mockCostCalc = {};
      const mgr = new SubAgentManager(defaultConfig, {
        storage: mockStorage as any,
        aiClientConfig: { model: { provider: 'anthropic', model: 'default-model' } as any },
        aiClientDeps: {},
        auditChain: mockAuditChain as any,
        logger: mockLogger as any,
        costCalculator: mockCostCalc as any,
      });

      // Spy on the ModelRouter.route method
      const modelRouter = (mgr as any).modelRouter;
      vi.spyOn(modelRouter, 'route').mockReturnValue({
        selectedModel: 'gpt-4-turbo',
        confidence: 0.8,
        tier: 'premium',
        taskProfile: { taskType: 'analysis', complexity: 'high' },
      });

      const profile = {
        id: 'router-prof',
        name: 'router-test',
        systemPrompt: 'Sys.',
        maxTokenBudget: 50000,
        allowedTools: [],
        defaultModel: 'fallback-model',
      };
      mockStorage.getProfile.mockResolvedValue(profile);
      mockStorage.createDelegation.mockResolvedValue(undefined);
      mockStorage.updateDelegation.mockResolvedValue(undefined);
      mockStorage.storeDelegationMessage.mockResolvedValue(undefined);

      mockAiChat.mockResolvedValue({
        content: 'Routed.',
        stopReason: 'end_turn',
        toolCalls: [],
        usage: { inputTokens: 10, outputTokens: 5 },
      });

      await mgr.delegate({ profile: 'router-test', task: 'complex analysis' });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ selectedModel: 'gpt-4-turbo' }),
        'ModelRouter selected model for delegation'
      );
    });

    it('falls back to profile.defaultModel when router confidence < 0.5', async () => {
      const mockCostCalc = {};
      const mgr = new SubAgentManager(defaultConfig, {
        storage: mockStorage as any,
        aiClientConfig: { model: { provider: 'anthropic', model: 'default-model' } as any },
        aiClientDeps: {},
        auditChain: mockAuditChain as any,
        logger: mockLogger as any,
        costCalculator: mockCostCalc as any,
      });

      const modelRouter = (mgr as any).modelRouter;
      vi.spyOn(modelRouter, 'route').mockReturnValue({
        selectedModel: 'gpt-4-turbo',
        confidence: 0.3,
        tier: 'premium',
        taskProfile: { taskType: 'simple', complexity: 'low' },
      });

      const profile = {
        id: 'router-low',
        name: 'router-low-conf',
        systemPrompt: 'Sys.',
        maxTokenBudget: 50000,
        allowedTools: [],
        defaultModel: 'profile-default',
      };
      mockStorage.getProfile.mockResolvedValue(profile);
      mockStorage.createDelegation.mockResolvedValue(undefined);
      mockStorage.updateDelegation.mockResolvedValue(undefined);
      mockStorage.storeDelegationMessage.mockResolvedValue(undefined);

      mockAiChat.mockResolvedValue({
        content: 'Low conf.',
        stopReason: 'end_turn',
        toolCalls: [],
        usage: { inputTokens: 10, outputTokens: 5 },
      });

      await mgr.delegate({ profile: 'router-low-conf', task: 'simple task' });
      // Should NOT log the model router selection
      expect(mockLogger.debug).not.toHaveBeenCalledWith(
        'ModelRouter selected model for delegation',
        expect.anything()
      );
    });
  });

  // ── sealOnComplete = false ─────────────────────────────────────────────

  describe('delegate — sealOnComplete false', () => {
    it('skips message storage when sealOnComplete is false', async () => {
      const mgr = new SubAgentManager(
        { ...defaultConfig, context: { sealOnComplete: false, brainWriteScope: 'delegated' } },
        {
          storage: mockStorage as any,
          aiClientConfig: { model: { provider: 'anthropic', model: 'test' } as any },
          aiClientDeps: {},
          auditChain: mockAuditChain as any,
          logger: mockLogger as any,
        }
      );

      const profile = {
        id: 'seal-off',
        name: 'no-seal',
        systemPrompt: 'Sys.',
        maxTokenBudget: 50000,
        allowedTools: [],
      };
      mockStorage.getProfile.mockResolvedValue(profile);
      mockStorage.createDelegation.mockResolvedValue(undefined);
      mockStorage.updateDelegation.mockResolvedValue(undefined);
      mockStorage.storeDelegationMessage.mockResolvedValue(undefined);

      mockAiChat.mockResolvedValue({
        content: 'No seal.',
        stopReason: 'end_turn',
        toolCalls: [],
        usage: { inputTokens: 10, outputTokens: 5 },
      });

      await mgr.delegate({ profile: 'no-seal', task: 'test' });
      expect(mockStorage.storeDelegationMessage).not.toHaveBeenCalled();
    });
  });

  // ── listActive with initiatedByPersonalityId ───────────────────────────

  describe('listActive — initiatedByPersonalityId', () => {
    it('includes initiatedByPersonalityId in SubAgentInfo', async () => {
      (manager as any).activeDelegations.set('del-pers', {
        abortController: new AbortController(),
        promise: new Promise(() => {}),
        startedAt: Date.now() - 500,
        profileName: 'persona-agent',
        task: 'personality task',
        depth: 0,
        tokenBudget: 30000,
        tokensUsed: 100,
        initiatedByPersonalityId: 'personality-abc',
      });

      const active = await manager.listActive();
      expect(active).toHaveLength(1);
      expect(active[0].initiatedByPersonalityId).toBe('personality-abc');

      (manager as any).activeDelegations.clear();
    });
  });

  // ── mcp-bridge — object result (non-string) ───────────────────────────

  describe('mcp-bridge profile — object result', () => {
    it('JSON.stringifies non-string MCP result', async () => {
      const mockMcpClient = {
        getAllTools: vi
          .fn()
          .mockReturnValue([{ name: 'obj-tool', serverId: 'srv-1', description: 'Returns obj' }]),
        callTool: vi.fn().mockResolvedValue({ data: 'structured', count: 42 }),
      };

      const mcpManager = new SubAgentManager(defaultConfig, {
        storage: mockStorage as any,
        aiClientConfig: { model: { provider: 'anthropic', model: 'test' } as any },
        aiClientDeps: {},
        auditChain: mockAuditChain as any,
        logger: mockLogger as any,
        mcpClient: mockMcpClient as any,
      });

      const profile = {
        id: 'mcp-obj',
        name: 'mcp-obj-result',
        systemPrompt: '',
        maxTokenBudget: 50000,
        allowedTools: [],
        type: 'mcp-bridge',
        mcpTool: 'obj-tool',
      };

      mockStorage.getProfile.mockResolvedValue(profile);
      mockStorage.createDelegation.mockResolvedValue(undefined);
      mockStorage.updateDelegation.mockResolvedValue(undefined);

      const result = await mcpManager.delegate({ profile: 'mcp-obj-result', task: 'get obj' });
      expect(result.status).toBe('completed');
      expect(result.result).toBe(JSON.stringify({ data: 'structured', count: 42 }));
    });
  });

  // ── getResult with child delegations ──────────────────────────────────

  describe('getResult — with child delegations', () => {
    it('recursively builds child delegation results', async () => {
      const parentRecord = {
        id: 'parent-del',
        profileId: 'prof-p',
        status: 'completed',
        result: 'Parent done',
        error: null,
        tokensUsedPrompt: 200,
        tokensUsedCompletion: 100,
        startedAt: 1000,
        completedAt: 3000,
      };
      const childRecord = {
        id: 'child-del',
        parentDelegationId: 'parent-del',
        profileId: 'prof-c',
        status: 'completed',
        result: 'Child done',
        error: null,
        tokensUsedPrompt: 50,
        tokensUsedCompletion: 25,
        startedAt: 1500,
        completedAt: 2500,
      };

      mockStorage.getDelegation.mockResolvedValue(parentRecord);
      // First getDelegationTree call (parent): returns parent + child
      // Second getDelegationTree call (child): returns empty
      mockStorage.getDelegationTree
        .mockResolvedValueOnce([parentRecord, childRecord])
        .mockResolvedValueOnce([]);
      // buildResultFromRecord recurses into children first, so child profile is resolved before parent
      mockStorage.getProfile
        .mockResolvedValueOnce({ id: 'prof-c', name: 'child-profile' })
        .mockResolvedValueOnce({ id: 'prof-p', name: 'parent-profile' });

      const result = await manager.getResult('parent-del');
      expect(result).not.toBeNull();
      expect(result!.subDelegations).toHaveLength(1);
      expect(result!.subDelegations[0].profile).toBe('child-profile');
      expect(result!.subDelegations[0].result).toBe('Child done');
    });

    it('returns durationMs=0 when completedAt or startedAt is missing', async () => {
      const record = {
        id: 'no-times',
        profileId: 'prof-x',
        status: 'failed',
        result: null,
        error: 'timeout',
        tokensUsedPrompt: 0,
        tokensUsedCompletion: 0,
        startedAt: null,
        completedAt: null,
      };
      mockStorage.getDelegation.mockResolvedValue(record);
      mockStorage.getDelegationTree.mockResolvedValue([]);
      mockStorage.getProfile.mockResolvedValue({ id: 'prof-x', name: 'timed-out' });

      const result = await manager.getResult('no-times');
      expect(result!.durationMs).toBe(0);
    });
  });

  // ── auditRecord error catch ───────────────────────────────────────────

  describe('delegation — audit record error is caught', () => {
    it('still returns completed when audit chain throws', async () => {
      const profile = {
        id: 'audit-err-prof',
        name: 'audit-err',
        systemPrompt: 'Sys.',
        maxTokenBudget: 50000,
        allowedTools: [],
      };
      mockStorage.getProfile.mockResolvedValue(profile);
      mockStorage.createDelegation.mockResolvedValue(undefined);
      mockStorage.updateDelegation.mockResolvedValue(undefined);
      mockStorage.storeDelegationMessage.mockResolvedValue(undefined);
      mockAuditChain.record.mockRejectedValueOnce(new Error('Audit DB down'));

      mockAiChat.mockResolvedValue({
        content: 'Result despite audit fail.',
        stopReason: 'end_turn',
        toolCalls: [],
        usage: { inputTokens: 10, outputTokens: 5 },
      });

      const result = await manager.delegate({ profile: 'audit-err', task: 'test' });
      expect(result.status).toBe('completed');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.anything(),
        'Failed to record delegation audit event'
      );
    });
  });

  // ── MCP tool inputSchema handling in LLM loop ─────────────────────────

  describe('LLM delegation — MCP tool schema handling', () => {
    it('adds type:object to MCP tool schema when missing', async () => {
      const mockMcpClient = {
        getAllTools: vi.fn().mockReturnValue([
          { name: 'schema_tool', serverId: 'srv', description: 'No type', inputSchema: {} },
          {
            name: 'typed_tool',
            serverId: 'srv',
            description: 'Has type',
            inputSchema: { type: 'object', properties: { x: { type: 'number' } } },
          },
        ]),
        callTool: vi.fn().mockResolvedValue('ok'),
      };

      const mcpManager = new SubAgentManager(defaultConfig, {
        storage: mockStorage as any,
        aiClientConfig: { model: { provider: 'anthropic', model: 'test' } as any },
        aiClientDeps: {},
        auditChain: mockAuditChain as any,
        logger: mockLogger as any,
        mcpClient: mockMcpClient as any,
      });

      const profile = {
        id: 'schema-prof',
        name: 'schema-test',
        systemPrompt: 'Sys.',
        maxTokenBudget: 50000,
        allowedTools: [],
      };
      mockStorage.getProfile.mockResolvedValue(profile);
      mockStorage.createDelegation.mockResolvedValue(undefined);
      mockStorage.updateDelegation.mockResolvedValue(undefined);
      mockStorage.storeDelegationMessage.mockResolvedValue(undefined);

      mockAiChat.mockResolvedValue({
        content: 'Schema done.',
        stopReason: 'end_turn',
        toolCalls: [],
        usage: { inputTokens: 10, outputTokens: 5 },
      });

      await mcpManager.delegate({ profile: 'schema-test', task: 'test schemas' });

      // The tools passed to chat should have type:'object' on both
      const chatArgs = mockAiChat.mock.calls[0][0];
      const tools = chatArgs.tools;
      const schemaTool = tools.find((t: any) => t.name === 'schema_tool');
      const typedTool = tools.find((t: any) => t.name === 'typed_tool');
      expect(schemaTool.parameters.type).toBe('object');
      expect(typedTool.parameters.type).toBe('object');
    });
  });

  // ── toolMatchesProfile patterns ─────────────────────────────────────────

  describe('delegate — toolMatchesProfile filtering', () => {
    it('filters MCP tools by allowedTools wildcard pattern', async () => {
      const mockMcpClient = {
        getAllTools: vi.fn().mockReturnValue([
          { name: 'web_search', serverId: 'srv', description: 'Search', inputSchema: {} },
          { name: 'web_browse', serverId: 'srv', description: 'Browse', inputSchema: {} },
          { name: 'fs_read', serverId: 'srv', description: 'Read', inputSchema: {} },
          { name: 'memory_recall', serverId: 'srv', description: 'Memory', inputSchema: {} },
        ]),
        callTool: vi.fn().mockResolvedValue('ok'),
      };

      const mcpManager = new SubAgentManager(defaultConfig, {
        storage: mockStorage as any,
        aiClientConfig: { model: { provider: 'anthropic', model: 'test' } as any },
        aiClientDeps: {},
        auditChain: mockAuditChain as any,
        logger: mockLogger as any,
        mcpClient: mockMcpClient as any,
      });

      // Profile with prefix pattern + exact match
      const profile = {
        id: 'filter-prof',
        name: 'filtered',
        systemPrompt: 'Sys.',
        maxTokenBudget: 50000,
        allowedTools: ['web_*', 'memory_recall'],
      };
      mockStorage.getProfile.mockResolvedValue(profile);
      mockStorage.createDelegation.mockResolvedValue(undefined);
      mockStorage.updateDelegation.mockResolvedValue(undefined);
      mockStorage.storeDelegationMessage.mockResolvedValue(undefined);

      mockAiChat.mockResolvedValue({
        content: 'Filtered.',
        stopReason: 'end_turn',
        toolCalls: [],
        usage: { inputTokens: 10, outputTokens: 5 },
      });

      await mcpManager.delegate({ profile: 'filtered', task: 'test' });

      const chatArgs = mockAiChat.mock.calls[0][0];
      const mcpToolNames = chatArgs.tools
        .map((t: any) => t.name)
        .filter(
          (n: string) =>
            !n.startsWith('delegate') && !n.startsWith('list_sub') && !n.startsWith('get_deleg')
        );
      // web_search, web_browse, memory_recall should pass; fs_read should not
      expect(mcpToolNames).toContain('web_search');
      expect(mcpToolNames).toContain('web_browse');
      expect(mcpToolNames).toContain('memory_recall');
      expect(mcpToolNames).not.toContain('fs_read');
    });

    it('allows all tools with wildcard * pattern', async () => {
      const mockMcpClient = {
        getAllTools: vi
          .fn()
          .mockReturnValue([
            { name: 'any_tool', serverId: 'srv', description: 'Any', inputSchema: {} },
          ]),
        callTool: vi.fn().mockResolvedValue('ok'),
      };

      const mcpManager = new SubAgentManager(defaultConfig, {
        storage: mockStorage as any,
        aiClientConfig: { model: { provider: 'anthropic', model: 'test' } as any },
        aiClientDeps: {},
        auditChain: mockAuditChain as any,
        logger: mockLogger as any,
        mcpClient: mockMcpClient as any,
      });

      const profile = {
        id: 'wildcard-prof',
        name: 'wildcard',
        systemPrompt: 'Sys.',
        maxTokenBudget: 50000,
        allowedTools: ['*'],
      };
      mockStorage.getProfile.mockResolvedValue(profile);
      mockStorage.createDelegation.mockResolvedValue(undefined);
      mockStorage.updateDelegation.mockResolvedValue(undefined);
      mockStorage.storeDelegationMessage.mockResolvedValue(undefined);

      mockAiChat.mockResolvedValue({
        content: 'Wildcard.',
        stopReason: 'end_turn',
        toolCalls: [],
        usage: { inputTokens: 10, outputTokens: 5 },
      });

      await mcpManager.delegate({ profile: 'wildcard', task: 'test' });

      const chatArgs = mockAiChat.mock.calls[0][0];
      const toolNames = chatArgs.tools.map((t: any) => t.name);
      expect(toolNames).toContain('any_tool');
    });
  });

  // ── delegate with modelOverride ─────────────────────────────────────────

  describe('delegate — modelOverride', () => {
    it('uses modelOverride when provided, bypassing router', async () => {
      const profile = {
        id: 'override-prof',
        name: 'override-test',
        systemPrompt: 'Sys.',
        maxTokenBudget: 50000,
        allowedTools: [],
        defaultModel: 'default-model',
      };
      mockStorage.getProfile.mockResolvedValue(profile);
      mockStorage.createDelegation.mockResolvedValue(undefined);
      mockStorage.updateDelegation.mockResolvedValue(undefined);
      mockStorage.storeDelegationMessage.mockResolvedValue(undefined);

      mockAiChat.mockResolvedValue({
        content: 'Override result.',
        stopReason: 'end_turn',
        toolCalls: [],
        usage: { inputTokens: 10, outputTokens: 5 },
      });

      await manager.delegate({
        profile: 'override-test',
        task: 'test',
        modelOverride: 'custom-model-v2',
      } as any);

      expect(mockAiChat).toHaveBeenCalled();
    });
  });

  // ── mcp-bridge — extensionManager emit ────────────────────────────────

  describe('mcp-bridge profile — extensionManager events', () => {
    it('emits before and after events when extensionManager present', async () => {
      const mockExtManager = { emit: vi.fn().mockResolvedValue(undefined) };
      const mockMcpClient = {
        getAllTools: vi
          .fn()
          .mockReturnValue([{ name: 'ext-tool', serverId: 'srv', description: 'Ext tool' }]),
        callTool: vi.fn().mockResolvedValue('ext result'),
      };

      const mgr = new SubAgentManager(defaultConfig, {
        storage: mockStorage as any,
        aiClientConfig: { model: { provider: 'anthropic', model: 'test' } as any },
        aiClientDeps: {},
        auditChain: mockAuditChain as any,
        logger: mockLogger as any,
        mcpClient: mockMcpClient as any,
        extensionManager: mockExtManager as any,
      });

      const profile = {
        id: 'ext-prof',
        name: 'ext-bridge',
        systemPrompt: '',
        maxTokenBudget: 50000,
        allowedTools: [],
        type: 'mcp-bridge',
        mcpTool: 'ext-tool',
      };
      mockStorage.getProfile.mockResolvedValue(profile);
      mockStorage.createDelegation.mockResolvedValue(undefined);
      mockStorage.updateDelegation.mockResolvedValue(undefined);

      await mgr.delegate({ profile: 'ext-bridge', task: 'ext task' });
      expect(mockExtManager.emit).toHaveBeenCalledWith(
        'agent:mcp-bridge-before-execute',
        expect.objectContaining({ event: 'agent:mcp-bridge-before-execute' })
      );
      expect(mockExtManager.emit).toHaveBeenCalledWith(
        'agent:mcp-bridge-after-execute',
        expect.objectContaining({ event: 'agent:mcp-bridge-after-execute' })
      );
    });
  });

  // ── mcp-bridge — template JSON parse error ────────────────────────────────

  describe('mcp-bridge profile — invalid template JSON', () => {
    it('returns failed when mcpToolInput template produces invalid JSON', async () => {
      const mockMcpClient = {
        getAllTools: vi
          .fn()
          .mockReturnValue([{ name: 'my-tool', serverId: 'srv', description: 'A tool' }]),
        callTool: vi.fn(),
      };

      const mcpManager = new SubAgentManager(defaultConfig, {
        storage: mockStorage as any,
        aiClientConfig: { model: { provider: 'anthropic', model: 'test' } as any },
        aiClientDeps: {},
        auditChain: mockAuditChain as any,
        logger: mockLogger as any,
        mcpClient: mockMcpClient as any,
      });

      const mcpProfile = {
        id: 'mcp-bad-tpl',
        name: 'mcp-bad-template',
        systemPrompt: '',
        maxTokenBudget: 50000,
        allowedTools: [],
        type: 'mcp-bridge',
        mcpTool: 'my-tool',
        // Invalid JSON template: unbalanced braces after interpolation
        mcpToolInput: '{"task": {{task}} }', // not a valid JSON template
      };

      mockStorage.getProfile.mockResolvedValue(mcpProfile);
      mockStorage.createDelegation.mockResolvedValue(undefined);
      mockStorage.updateDelegation.mockResolvedValue(undefined);

      // Task with characters that won't produce valid JSON when interpolated raw
      const result = await mcpManager.delegate({
        profile: 'mcp-bad-template',
        task: 'some task',
      });
      expect(result.status).toBe('failed');
      expect(result.error).toContain('invalid JSON');
    });
  });
});
