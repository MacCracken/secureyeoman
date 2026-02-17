import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubAgentManager } from './manager.js';
import type { DelegationConfig } from '@friday/shared';

// Mock AIClient
const { MockAIClient } = vi.hoisted(() => {
  const MockAIClient = vi.fn().mockImplementation(function () {
    return {
      chat: vi.fn().mockResolvedValue({
        id: 'test-response',
        content: 'Test result from sub-agent',
        toolCalls: undefined,
        usage: { inputTokens: 100, outputTokens: 50, cachedTokens: 0, totalTokens: 150 },
        stopReason: 'end_turn',
        model: 'test-model',
        provider: 'test',
      }),
    };
  });
  return { MockAIClient };
});
vi.mock('../ai/client.js', () => ({
  AIClient: MockAIClient,
}));

// Mock crypto
vi.mock('../utils/crypto.js', () => ({
  uuidv7: vi.fn().mockReturnValue('test-delegation-id'),
}));

const mockStorage = {
  seedBuiltinProfiles: vi.fn(),
  getProfile: vi.fn(),
  getProfileByName: vi.fn(),
  listProfiles: vi.fn().mockResolvedValue([]),
  createProfile: vi.fn(),
  updateProfile: vi.fn(),
  deleteProfile: vi.fn(),
  createDelegation: vi.fn().mockImplementation((data) => ({
    ...data,
    createdAt: Date.now(),
  })),
  updateDelegation: vi.fn().mockImplementation((id, data) => ({
    id,
    ...data,
  })),
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

describe('SubAgentManager execution', () => {
  let manager: SubAgentManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.getProfile.mockResolvedValue({
      id: 'builtin-researcher',
      name: 'researcher',
      description: 'Research specialist',
      systemPrompt: 'You are a researcher.',
      maxTokenBudget: 50000,
      allowedTools: [],
      defaultModel: null,
      isBuiltin: true,
    });
    mockStorage.getProfileByName.mockResolvedValue(null);

    manager = new SubAgentManager(defaultConfig, {
      storage: mockStorage as any,
      aiClientConfig: {
        model: {
          provider: 'anthropic',
          model: 'test-model',
          apiKeyEnv: 'TEST_KEY',
          maxTokens: 4096,
          temperature: 0.7,
          maxRequestsPerMinute: 60,
          requestTimeoutMs: 120000,
          maxRetries: 3,
          retryDelayMs: 1000,
          fallbacks: [],
        },
      },
      aiClientDeps: {},
      auditChain: mockAuditChain as any,
      logger: mockLogger as any,
    });
  });

  it('executes a simple delegation successfully', async () => {
    const result = await manager.delegate({
      profile: 'builtin-researcher',
      task: 'Research TypeScript generics',
    });

    expect(result.status).toBe('completed');
    expect(result.result).toBe('Test result from sub-agent');
    expect(result.profile).toBe('researcher');
    expect(result.tokenUsage.prompt).toBe(100);
    expect(result.tokenUsage.completion).toBe(50);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.subDelegations).toEqual([]);
  });

  it('creates delegation record with correct status', async () => {
    await manager.delegate({
      profile: 'builtin-researcher',
      task: 'Test task',
    });

    expect(mockStorage.createDelegation).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'pending',
        depth: 0,
        maxDepth: 3,
      })
    );

    // Should be updated to running then completed
    expect(mockStorage.updateDelegation).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: 'running' })
    );
    expect(mockStorage.updateDelegation).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: 'completed' })
    );
  });

  it('seals conversation on complete when configured', async () => {
    await manager.delegate({
      profile: 'builtin-researcher',
      task: 'Test task',
    });

    // Should store system, user, and assistant messages
    expect(mockStorage.storeDelegationMessage).toHaveBeenCalled();
    const calls = mockStorage.storeDelegationMessage.mock.calls;
    const roles = calls.map((c: any[]) => c[0].role);
    expect(roles).toContain('system');
    expect(roles).toContain('user');
    expect(roles).toContain('assistant');
  });

  it('records audit event on completion', async () => {
    await manager.delegate({
      profile: 'builtin-researcher',
      task: 'Test task',
    });

    expect(mockAuditChain.record).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'delegation_completed',
      })
    );
  });

  it('computes token budget as minimum of all limits', async () => {
    await manager.delegate({
      profile: 'builtin-researcher',
      task: 'Test task',
      maxTokenBudget: 10000,
    });

    expect(mockStorage.createDelegation).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenBudget: 10000,
      })
    );
  });

  it('respects parent remaining budget', async () => {
    await manager.delegate(
      { profile: 'builtin-researcher', task: 'Test task' },
      { remainingBudget: 5000 }
    );

    expect(mockStorage.createDelegation).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenBudget: 5000,
      })
    );
  });

  it('resolves profile by name when ID lookup fails', async () => {
    mockStorage.getProfile.mockResolvedValue(null);
    mockStorage.getProfileByName.mockResolvedValue({
      id: 'builtin-researcher',
      name: 'researcher',
      description: 'Research specialist',
      systemPrompt: 'You are a researcher.',
      maxTokenBudget: 50000,
      allowedTools: [],
      defaultModel: null,
      isBuiltin: true,
    });

    const result = await manager.delegate({
      profile: 'researcher',
      task: 'Test task',
    });

    expect(result.status).toBe('completed');
    expect(mockStorage.getProfileByName).toHaveBeenCalledWith('researcher');
  });
});
