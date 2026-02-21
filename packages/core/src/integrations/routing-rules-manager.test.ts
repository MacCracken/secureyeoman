import { describe, it, expect, vi, beforeEach } from 'vitest';
import { evaluateRule, RoutingRulesManager } from './routing-rules-manager.js';
import type { RoutingRule } from '@secureyeoman/shared';
import type { UnifiedMessage } from '@secureyeoman/shared';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRule(overrides: Partial<RoutingRule> = {}): RoutingRule {
  return {
    id: 'rule-1',
    name: 'Test Rule',
    enabled: true,
    priority: 100,
    triggerDirection: 'inbound',
    triggerPlatforms: [],
    triggerIntegrationIds: [],
    triggerChatIdPattern: null,
    triggerSenderIdPattern: null,
    triggerKeywordPattern: null,
    actionType: 'forward',
    actionTargetIntegrationId: 'int-2',
    actionTargetChatId: 'chat-2',
    actionMessageTemplate: null,
    actionPersonalityId: null,
    actionWebhookUrl: null,
    matchCount: 0,
    lastMatchedAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeMessage(overrides: Partial<UnifiedMessage> = {}): UnifiedMessage {
  return {
    id: 'msg-1',
    integrationId: 'int-1',
    platform: 'slack',
    direction: 'inbound',
    senderId: 'user-1',
    senderName: 'Alice',
    chatId: 'chat-1',
    text: 'hello world',
    attachments: [],
    platformMessageId: 'slack-msg-1',
    metadata: {},
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeDeps(overrides: Partial<{
  listEnabled: RoutingRule[];
  sendMessage: typeof vi.fn;
}> = {}) {
  const storage = {
    listEnabled: vi.fn().mockResolvedValue(overrides.listEnabled ?? []),
    recordMatch: vi.fn().mockResolvedValue(undefined),
  };
  const integrationManager = {
    sendMessage: overrides.sendMessage ?? vi.fn().mockResolvedValue('msg-ok'),
  };
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
  return { storage: storage as any, integrationManager: integrationManager as any, logger: logger as any };
}

// ── evaluateRule ──────────────────────────────────────────────────────────────

describe('evaluateRule', () => {
  it('returns not-matched when rule is disabled', () => {
    const rule = makeRule({ enabled: false });
    const result = evaluateRule(rule, { platform: 'slack', direction: 'inbound' });
    expect(result.matched).toBe(false);
    expect(result.reason).toContain('disabled');
  });

  it('returns not-matched when direction does not match', () => {
    const rule = makeRule({ triggerDirection: 'outbound' });
    const result = evaluateRule(rule, { platform: 'slack', direction: 'inbound' });
    expect(result.matched).toBe(false);
    expect(result.reason).toContain('direction');
  });

  it('returns matched when triggerDirection is "both"', () => {
    const rule = makeRule({ triggerDirection: 'both' });
    const result = evaluateRule(rule, { platform: 'slack', direction: 'inbound' });
    expect(result.matched).toBe(true);
  });

  it('returns not-matched when platform not in allowlist', () => {
    const rule = makeRule({ triggerPlatforms: ['teams'] });
    const result = evaluateRule(rule, { platform: 'slack', direction: 'inbound' });
    expect(result.matched).toBe(false);
    expect(result.reason).toContain('platform');
  });

  it('returns matched when platform is in allowlist', () => {
    const rule = makeRule({ triggerPlatforms: ['slack', 'teams'] });
    const result = evaluateRule(rule, { platform: 'slack', direction: 'inbound' });
    expect(result.matched).toBe(true);
  });

  it('returns matched when triggerPlatforms is empty (all platforms)', () => {
    const rule = makeRule({ triggerPlatforms: [] });
    const result = evaluateRule(rule, { platform: 'discord', direction: 'inbound' });
    expect(result.matched).toBe(true);
  });

  it('returns not-matched when integrationId not in allowlist', () => {
    const rule = makeRule({ triggerIntegrationIds: ['int-A'] });
    const result = evaluateRule(rule, { platform: 'slack', direction: 'inbound', integrationId: 'int-B' });
    expect(result.matched).toBe(false);
    expect(result.reason).toContain('integrationId');
  });

  it('returns matched when integrationId is in allowlist', () => {
    const rule = makeRule({ triggerIntegrationIds: ['int-A'] });
    const result = evaluateRule(rule, { platform: 'slack', direction: 'inbound', integrationId: 'int-A' });
    expect(result.matched).toBe(true);
  });

  it('returns not-matched when chatId pattern does not match', () => {
    const rule = makeRule({ triggerChatIdPattern: '^admin-' });
    const result = evaluateRule(rule, { platform: 'slack', direction: 'inbound', chatId: 'public-123' });
    expect(result.matched).toBe(false);
    expect(result.reason).toContain('chatId');
  });

  it('returns matched when chatId pattern matches', () => {
    const rule = makeRule({ triggerChatIdPattern: '^admin-' });
    const result = evaluateRule(rule, { platform: 'slack', direction: 'inbound', chatId: 'admin-007' });
    expect(result.matched).toBe(true);
  });

  it('returns matched when chatId pattern is null (wildcard)', () => {
    const rule = makeRule({ triggerChatIdPattern: null });
    const result = evaluateRule(rule, { platform: 'slack', direction: 'inbound', chatId: 'any-chat' });
    expect(result.matched).toBe(true);
  });

  it('returns not-matched when senderId pattern does not match', () => {
    const rule = makeRule({ triggerSenderIdPattern: 'bot@' });
    const result = evaluateRule(rule, { platform: 'slack', direction: 'inbound', senderId: 'user@example.com' });
    expect(result.matched).toBe(false);
    expect(result.reason).toContain('senderId');
  });

  it('returns not-matched when keyword pattern does not match', () => {
    const rule = makeRule({ triggerKeywordPattern: 'urgent' });
    const result = evaluateRule(rule, { platform: 'slack', direction: 'inbound', text: 'hello world' });
    expect(result.matched).toBe(false);
    expect(result.reason).toContain('keyword');
  });

  it('returns matched when keyword pattern matches', () => {
    const rule = makeRule({ triggerKeywordPattern: 'hello' });
    const result = evaluateRule(rule, { platform: 'slack', direction: 'inbound', text: 'hello world' });
    expect(result.matched).toBe(true);
  });

  it('falls back to substring match when regex is invalid', () => {
    const rule = makeRule({ triggerKeywordPattern: '[[invalid' });
    const result = evaluateRule(rule, { platform: 'slack', direction: 'inbound', text: '[[invalid pattern' });
    expect(result.matched).toBe(true); // substring match
  });
});

// ── RoutingRulesManager ───────────────────────────────────────────────────────

describe('RoutingRulesManager', () => {
  let deps: ReturnType<typeof makeDeps>;
  let manager: RoutingRulesManager;

  beforeEach(() => {
    deps = makeDeps();
    manager = new RoutingRulesManager(deps);
  });

  describe('evaluateRules', () => {
    it('returns empty array when no rules match', async () => {
      deps.storage.listEnabled.mockResolvedValue([makeRule({ triggerKeywordPattern: 'urgent' })]);
      const matched = await manager.evaluateRules(makeMessage({ text: 'hello' }));
      expect(matched).toHaveLength(0);
    });

    it('returns matching rules and records a match', async () => {
      const rule = makeRule();
      deps.storage.listEnabled.mockResolvedValue([rule]);
      const matched = await manager.evaluateRules(makeMessage());
      expect(matched).toHaveLength(1);
      expect(matched[0].id).toBe('rule-1');
      // recordMatch is fire-and-forget; wait a tick
      await new Promise((r) => setTimeout(r, 10));
      expect(deps.storage.recordMatch).toHaveBeenCalledWith('rule-1');
    });

    it('handles recordMatch error silently', async () => {
      deps.storage.recordMatch.mockRejectedValue(new Error('DB down'));
      deps.storage.listEnabled.mockResolvedValue([makeRule()]);
      await expect(manager.evaluateRules(makeMessage())).resolves.toHaveLength(1);
      await new Promise((r) => setTimeout(r, 10));
      // No throw propagated
    });
  });

  describe('applyRule — forward action', () => {
    it('forwards message using target integration and chat', async () => {
      const rule = makeRule({ actionType: 'forward', actionTargetIntegrationId: 'int-2', actionTargetChatId: 'chat-2' });
      const msg = makeMessage();
      await manager.applyRule(rule, msg);
      expect(deps.integrationManager.sendMessage).toHaveBeenCalledWith(
        'int-2', 'chat-2', msg.text, expect.objectContaining({ routedByRule: 'rule-1' })
      );
    });

    it('uses message template when provided', async () => {
      const rule = makeRule({ actionType: 'forward', actionMessageTemplate: 'From {{senderName}}: {{text}}' });
      const msg = makeMessage({ senderName: 'Bob', text: 'hi' });
      await manager.applyRule(rule, msg);
      expect(deps.integrationManager.sendMessage).toHaveBeenCalledWith(
        expect.any(String), expect.any(String), 'From Bob: hi', expect.any(Object)
      );
    });

    it('falls back to message integrationId and chatId when action targets not set', async () => {
      const rule = makeRule({ actionType: 'reply', actionTargetIntegrationId: null, actionTargetChatId: null });
      const msg = makeMessage({ integrationId: 'int-orig', chatId: 'chat-orig' });
      await manager.applyRule(rule, msg);
      expect(deps.integrationManager.sendMessage).toHaveBeenCalledWith(
        'int-orig', 'chat-orig', expect.any(String), expect.any(Object)
      );
    });

    it('logs error when sendMessage throws but does not rethrow', async () => {
      deps.integrationManager.sendMessage = vi.fn().mockRejectedValue(new Error('network error'));
      const rule = makeRule({ actionType: 'forward' });
      await expect(manager.applyRule(rule, makeMessage())).resolves.toBeUndefined();
      expect(deps.logger.error).toHaveBeenCalled();
    });
  });

  describe('applyRule — personality action', () => {
    it('calls onPersonalityOverride when set', async () => {
      const onPersonalityOverride = vi.fn().mockResolvedValue(undefined);
      const mgr = new RoutingRulesManager({ ...deps, onPersonalityOverride });
      const rule = makeRule({ actionType: 'personality', actionPersonalityId: 'persona-1' });
      const msg = makeMessage();
      await mgr.applyRule(rule, msg);
      expect(onPersonalityOverride).toHaveBeenCalledWith('persona-1', msg);
    });

    it('warns when actionPersonalityId is missing', async () => {
      const rule = makeRule({ actionType: 'personality', actionPersonalityId: null });
      await manager.applyRule(rule, makeMessage());
      expect(deps.logger.warn).toHaveBeenCalled();
    });

    it('warns when onPersonalityOverride is not provided', async () => {
      const rule = makeRule({ actionType: 'personality', actionPersonalityId: 'persona-1' });
      // deps has no onPersonalityOverride → should warn
      await manager.applyRule(rule, makeMessage());
      expect(deps.logger.warn).toHaveBeenCalled();
    });
  });

  describe('applyRule — notify action', () => {
    it('warns when actionWebhookUrl is missing', async () => {
      const rule = makeRule({ actionType: 'notify', actionWebhookUrl: null });
      await manager.applyRule(rule, makeMessage());
      expect(deps.logger.warn).toHaveBeenCalled();
    });

    it('posts to webhook and logs info on success', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', mockFetch);

      const rule = makeRule({ actionType: 'notify', actionWebhookUrl: 'https://hooks.example.com/notify' });
      await manager.applyRule(rule, makeMessage());
      expect(mockFetch).toHaveBeenCalledWith(
        'https://hooks.example.com/notify',
        expect.objectContaining({ method: 'POST' })
      );
      expect(deps.logger.info).toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it('warns when webhook returns non-ok status', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 503 });
      vi.stubGlobal('fetch', mockFetch);

      const rule = makeRule({ actionType: 'notify', actionWebhookUrl: 'https://hooks.example.com/notify' });
      await manager.applyRule(rule, makeMessage());
      expect(deps.logger.warn).toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it('uses message template in notify payload when set', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', mockFetch);

      const rule = makeRule({
        actionType: 'notify',
        actionWebhookUrl: 'https://hooks.example.com',
        actionMessageTemplate: 'Alert: {{text}} from {{platform}}',
      });
      await manager.applyRule(rule, makeMessage({ text: 'fire', platform: 'slack' }));

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.message.text).toBe('Alert: fire from slack');
      vi.unstubAllGlobals();
    });
  });

  describe('applyRule — unknown action type', () => {
    it('logs warn for unknown action type', async () => {
      const rule = makeRule({ actionType: 'unknown' as any });
      await manager.applyRule(rule, makeMessage());
      expect(deps.logger.warn).toHaveBeenCalled();
    });
  });

  describe('processMessage', () => {
    it('applies each matched rule to the message', async () => {
      const rule1 = makeRule({ id: 'r1' });
      const rule2 = makeRule({ id: 'r2', actionTargetChatId: 'chat-3' });
      deps.storage.listEnabled.mockResolvedValue([rule1, rule2]);

      await manager.processMessage(makeMessage());
      expect(deps.integrationManager.sendMessage).toHaveBeenCalledTimes(2);
    });

    it('processes message with no matching rules (no sends)', async () => {
      deps.storage.listEnabled.mockResolvedValue([
        makeRule({ enabled: false }),
      ]);
      await manager.processMessage(makeMessage());
      expect(deps.integrationManager.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('testRule', () => {
    it('returns matched=true when all conditions pass', () => {
      const rule = makeRule();
      const result = manager.testRule(rule, {
        platform: 'slack',
        direction: 'inbound',
        integrationId: 'int-1',
        chatId: 'chat-1',
        senderId: 'user-1',
        text: 'hello',
      });
      expect(result.matched).toBe(true);
      expect(result.rule).toBe(rule);
    });

    it('returns matched=false with reason when conditions fail', () => {
      const rule = makeRule({ triggerKeywordPattern: 'urgent' });
      const result = manager.testRule(rule, {
        platform: 'slack',
        direction: 'inbound',
        text: 'casual message',
      });
      expect(result.matched).toBe(false);
      expect(result.reason).toBeTruthy();
    });
  });
});
