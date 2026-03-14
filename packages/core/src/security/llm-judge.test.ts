import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LLMJudge } from './llm-judge.js';
import type { Personality } from '@secureyeoman/shared';
import type { LLMJudgeConfig } from '@secureyeoman/shared';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<LLMJudgeConfig> = {}): LLMJudgeConfig {
  return {
    enabled: true,
    model: undefined,
    triggers: { automationLevels: ['supervised_auto'] },
    ...overrides,
  };
}

function makeAIClient(responseContent: string) {
  return {
    chat: vi.fn().mockResolvedValue({
      id: 'test',
      content: responseContent,
      usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
      stopReason: 'end_turn',
      model: 'test-model',
      provider: 'test',
    }),
  };
}

function makePersonality(automationLevel: string = 'supervised_auto'): Personality {
  return {
    id: 'p-1',
    name: 'TestAgent',
    description: '',
    systemPrompt: '',
    traits: {},
    sex: 'unspecified',
    voice: '',
    preferredLanguage: 'en',
    defaultModel: null,
    modelFallbacks: [],
    includeArchetypes: false,
    injectDateTime: false,
    empathyResonance: false,
    avatarUrl: null,
    isActive: true,
    isDefault: false,
    body: {
      enabled: true,
      capabilities: [],
      heartEnabled: false,
      creationConfig: { enabled: false, allowedTypes: [] },
      selectedServers: [],
      selectedIntegrations: [],
      mcpFeatures: {} as any,
      activeHours: { enabled: false, timezone: 'UTC', schedule: [] } as any,
      omnipresentMind: false,
      resourcePolicy: {
        deletionMode: 'manual',
        automationLevel: automationLevel as any,
        emergencyStop: false,
      },
    },
    createdAt: 1000,
    updatedAt: 1000,
  };
}

// ─── shouldJudge ───────────────────────────────────────────────────────────────

describe('LLMJudge.shouldJudge', () => {
  it('returns false when disabled', () => {
    const judge = new LLMJudge(makeConfig({ enabled: false }), {
      aiClient: makeAIClient('') as any,
      intentManager: null,
    });
    expect(judge.shouldJudge(makePersonality('supervised_auto'))).toBe(false);
  });

  it('returns true for supervised_auto (in default trigger list)', () => {
    const judge = new LLMJudge(makeConfig(), {
      aiClient: makeAIClient('') as any,
      intentManager: null,
    });
    expect(judge.shouldJudge(makePersonality('supervised_auto'))).toBe(true);
  });

  it('returns false for full_manual (not in default trigger list)', () => {
    const judge = new LLMJudge(makeConfig(), {
      aiClient: makeAIClient('') as any,
      intentManager: null,
    });
    expect(judge.shouldJudge(makePersonality('full_manual'))).toBe(false);
  });

  it('returns false for semi_auto (not in default trigger list)', () => {
    const judge = new LLMJudge(makeConfig(), {
      aiClient: makeAIClient('') as any,
      intentManager: null,
    });
    expect(judge.shouldJudge(makePersonality('semi_auto'))).toBe(false);
  });

  it('returns false when personality is null', () => {
    const judge = new LLMJudge(makeConfig(), {
      aiClient: makeAIClient('') as any,
      intentManager: null,
    });
    expect(judge.shouldJudge(null)).toBe(false);
  });

  it('returns false when personality has no automationLevel', () => {
    const judge = new LLMJudge(makeConfig(), {
      aiClient: makeAIClient('') as any,
      intentManager: null,
    });
    const p = makePersonality('supervised_auto');
    delete (p.body.resourcePolicy as any).automationLevel;
    expect(judge.shouldJudge(p)).toBe(false);
  });
});

// ─── judge — verdicts ─────────────────────────────────────────────────────────

describe('LLMJudge.judge — verdicts', () => {
  it('returns allow verdict', async () => {
    const aiClient = makeAIClient('{"decision":"allow","reason":"Safe action","concerns":[]}');
    const judge = new LLMJudge(makeConfig(), { aiClient: aiClient as any, intentManager: null });
    const verdict = await judge.judge({
      toolName: 'web_search',
      toolArgs: { query: 'hello' },
      personality: makePersonality(),
    });
    expect(verdict.decision).toBe('allow');
    expect(verdict.reason).toBe('Safe action');
    expect(verdict.concerns).toHaveLength(0);
  });

  it('returns warn verdict', async () => {
    const aiClient = makeAIClient(
      '{"decision":"warn","reason":"Potentially risky","concerns":["writes to disk"]}'
    );
    const judge = new LLMJudge(makeConfig(), { aiClient: aiClient as any, intentManager: null });
    const verdict = await judge.judge({
      toolName: 'fs_write',
      toolArgs: { path: '/tmp/x', content: 'data' },
      personality: makePersonality(),
    });
    expect(verdict.decision).toBe('warn');
    expect(verdict.concerns).toContain('writes to disk');
  });

  it('returns block verdict', async () => {
    const aiClient = makeAIClient(
      '{"decision":"block","reason":"Violates boundary","concerns":["exfiltration risk"]}'
    );
    const judge = new LLMJudge(makeConfig(), { aiClient: aiClient as any, intentManager: null });
    const verdict = await judge.judge({
      toolName: 'fs_write',
      toolArgs: { path: '/etc/passwd', content: 'hacked' },
      personality: makePersonality(),
    });
    expect(verdict.decision).toBe('block');
    expect(verdict.reason).toBe('Violates boundary');
  });

  it('fails open to allow on JSON parse failure', async () => {
    const aiClient = makeAIClient('This is not valid JSON');
    const judge = new LLMJudge(makeConfig(), { aiClient: aiClient as any, intentManager: null });
    const verdict = await judge.judge({
      toolName: 'web_search',
      toolArgs: {},
      personality: makePersonality(),
    });
    expect(verdict.decision).toBe('allow');
    expect(verdict.reason).toContain('error');
  });

  it('fails open to allow on AI client error', async () => {
    const aiClient = { chat: vi.fn().mockRejectedValue(new Error('Network error')) };
    const judge = new LLMJudge(makeConfig(), { aiClient: aiClient as any, intentManager: null });
    const verdict = await judge.judge({
      toolName: 'web_search',
      toolArgs: {},
      personality: makePersonality(),
    });
    expect(verdict.decision).toBe('allow');
  });

  it('handles markdown-wrapped JSON response', async () => {
    const aiClient = makeAIClient(
      '```json\n{"decision":"warn","reason":"Check this","concerns":[]}\n```'
    );
    const judge = new LLMJudge(makeConfig(), { aiClient: aiClient as any, intentManager: null });
    const verdict = await judge.judge({
      toolName: 'web_search',
      toolArgs: {},
      personality: makePersonality(),
    });
    expect(verdict.decision).toBe('warn');
  });

  it('fails open on invalid decision value', async () => {
    const aiClient = makeAIClient('{"decision":"maybe","reason":"hmm","concerns":[]}');
    const judge = new LLMJudge(makeConfig(), { aiClient: aiClient as any, intentManager: null });
    const verdict = await judge.judge({
      toolName: 'web_search',
      toolArgs: {},
      personality: makePersonality(),
    });
    expect(verdict.decision).toBe('allow');
  });
});

// ─── judge — prompt includes personality context ────────────────────────────────

describe('LLMJudge.judge — prompt context', () => {
  it('calls aiClient.chat with tool name in prompt', async () => {
    const aiClient = makeAIClient('{"decision":"allow","reason":"ok","concerns":[]}');
    const judge = new LLMJudge(makeConfig(), { aiClient: aiClient as any, intentManager: null });
    await judge.judge({
      toolName: 'delete_workflow',
      toolArgs: { id: 'wf-123' },
      personality: makePersonality('supervised_auto'),
      intentGoals: ['Maintain uptime'],
      intentBoundaries: ['Never delete prod data'],
      brainContextSnippets: ['User prefers conservative actions'],
    });

    const callArgs = (aiClient.chat as any).mock.calls[0][0];
    const userMessage = callArgs.messages.find((m: any) => m.role === 'user');
    expect(userMessage.content).toContain('delete_workflow');
    expect(userMessage.content).toContain('supervised_auto');
  });
});
