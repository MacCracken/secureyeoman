import { describe, it, expect, beforeEach } from 'vitest';
import { SkillTriggerMatcher, renderContextTemplate } from './trigger-matcher.js';
import type { TriggerContext } from './trigger-matcher.js';
import type { Skill } from '@secureyeoman/shared';

// ── Helpers ──────────────────────────────────────────────────────

function makeContext(overrides?: Partial<TriggerContext>): TriggerContext {
  return {
    sessionId: 'sess-1',
    personalityId: 'pers-1',
    ...overrides,
  };
}

function makeSkill(triggers: Skill['triggers'] = []): Skill {
  return {
    id: 'skill-1',
    name: 'Test Skill',
    description: 'desc',
    instructions: 'do stuff',
    enabled: true,
    status: 'active',
    source: 'user',
    tools: [],
    triggerPatterns: [],
    triggers,
    usageCount: 0,
    lastUsedAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as unknown as Skill;
}

function makeTrigger(overrides: Record<string, unknown>) {
  return {
    id: 'trigger-1',
    enabled: true,
    priority: 0,
    cooldownMs: 0,
    ...overrides,
  } as unknown as NonNullable<Skill['triggers']>[number];
}

// ── SkillTriggerMatcher Tests ────────────────────────────────────

describe('SkillTriggerMatcher', () => {
  let matcher: SkillTriggerMatcher;

  beforeEach(() => {
    matcher = new SkillTriggerMatcher();
  });

  describe('findMatchingTriggers', () => {
    it('returns empty array when no skills provided', () => {
      expect(matcher.findMatchingTriggers([], makeContext())).toEqual([]);
    });

    it('skips disabled skills', () => {
      const skill = { ...makeSkill(), enabled: false };
      skill.triggers = [
        makeTrigger({
          type: 'message',
          message: { patterns: ['hello'], matchMode: 'contains', caseSensitive: false },
        }),
      ];
      const ctx = makeContext({ message: { text: 'hello', userId: 'u1', timestamp: Date.now() } });
      expect(matcher.findMatchingTriggers([skill], ctx)).toHaveLength(0);
    });

    it('skips non-active skills', () => {
      const skill = { ...makeSkill(), status: 'pending_approval' } as Skill;
      skill.triggers = [
        makeTrigger({
          type: 'message',
          message: { patterns: ['hello'], matchMode: 'contains', caseSensitive: false },
        }),
      ];
      const ctx = makeContext({ message: { text: 'hello', userId: 'u1', timestamp: Date.now() } });
      expect(matcher.findMatchingTriggers([skill as Skill], ctx)).toHaveLength(0);
    });

    it('skips disabled triggers', () => {
      const skill = makeSkill([
        makeTrigger({
          enabled: false,
          type: 'message',
          message: { patterns: ['hello'], matchMode: 'contains', caseSensitive: false },
        }),
      ]);
      const ctx = makeContext({ message: { text: 'hello', userId: 'u1', timestamp: Date.now() } });
      expect(matcher.findMatchingTriggers([skill], ctx)).toHaveLength(0);
    });

    it('sorts matches by priority descending', () => {
      const skill = makeSkill([
        makeTrigger({
          id: 'low',
          priority: 1,
          type: 'message',
          message: { patterns: ['hello'], matchMode: 'contains', caseSensitive: false },
        }),
        makeTrigger({
          id: 'high',
          priority: 10,
          type: 'message',
          message: { patterns: ['hello'], matchMode: 'contains', caseSensitive: false },
        }),
      ]);
      const ctx = makeContext({ message: { text: 'hello', userId: 'u1', timestamp: Date.now() } });
      const matches = matcher.findMatchingTriggers([skill], ctx);
      expect(matches).toHaveLength(2);
      expect(matches[0].trigger.priority).toBe(10);
      expect(matches[1].trigger.priority).toBe(1);
    });
  });

  describe('message trigger matching', () => {
    it('matches contains mode (case-insensitive)', () => {
      const skill = makeSkill([
        makeTrigger({
          type: 'message',
          message: { patterns: ['HELLO'], matchMode: 'contains', caseSensitive: false },
        }),
      ]);
      const ctx = makeContext({
        message: { text: 'say hello world', userId: 'u1', timestamp: Date.now() },
      });
      expect(matcher.findMatchingTriggers([skill], ctx)).toHaveLength(1);
    });

    it('does not match contains mode when text absent', () => {
      const skill = makeSkill([
        makeTrigger({
          type: 'message',
          message: { patterns: ['missing'], matchMode: 'contains', caseSensitive: false },
        }),
      ]);
      const ctx = makeContext({ message: { text: 'hello', userId: 'u1', timestamp: Date.now() } });
      expect(matcher.findMatchingTriggers([skill], ctx)).toHaveLength(0);
    });

    it('matches exact mode', () => {
      const skill = makeSkill([
        makeTrigger({
          type: 'message',
          message: { patterns: ['ping'], matchMode: 'exact', caseSensitive: false },
        }),
      ]);
      expect(
        matcher.findMatchingTriggers(
          [skill],
          makeContext({ message: { text: 'ping', userId: 'u1', timestamp: 0 } })
        )
      ).toHaveLength(1);
      expect(
        matcher.findMatchingTriggers(
          [skill],
          makeContext({ message: { text: 'ping me', userId: 'u1', timestamp: 0 } })
        )
      ).toHaveLength(0);
    });

    it('matches startsWith mode', () => {
      const skill = makeSkill([
        makeTrigger({
          type: 'message',
          message: { patterns: ['hey'], matchMode: 'startsWith', caseSensitive: false },
        }),
      ]);
      expect(
        matcher.findMatchingTriggers(
          [skill],
          makeContext({ message: { text: 'hey there', userId: 'u1', timestamp: 0 } })
        )
      ).toHaveLength(1);
      expect(
        matcher.findMatchingTriggers(
          [skill],
          makeContext({ message: { text: 'say hey', userId: 'u1', timestamp: 0 } })
        )
      ).toHaveLength(0);
    });

    it('matches regex mode', () => {
      const skill = makeSkill([
        makeTrigger({
          type: 'message',
          message: { patterns: ['^hello\\s+world$'], matchMode: 'regex', caseSensitive: false },
        }),
      ]);
      expect(
        matcher.findMatchingTriggers(
          [skill],
          makeContext({ message: { text: 'hello   world', userId: 'u1', timestamp: 0 } })
        )
      ).toHaveLength(1);
      expect(
        matcher.findMatchingTriggers(
          [skill],
          makeContext({ message: { text: 'hello', userId: 'u1', timestamp: 0 } })
        )
      ).toHaveLength(0);
    });

    it('skips invalid regex without throwing', () => {
      const skill = makeSkill([
        makeTrigger({
          type: 'message',
          message: { patterns: ['[invalid('], matchMode: 'regex', caseSensitive: false },
        }),
      ]);
      const ctx = makeContext({ message: { text: '[invalid(', userId: 'u1', timestamp: 0 } });
      expect(() => matcher.findMatchingTriggers([skill], ctx)).not.toThrow();
      expect(matcher.findMatchingTriggers([skill], ctx)).toHaveLength(0);
    });

    it('does not match when no message in context', () => {
      const skill = makeSkill([
        makeTrigger({
          type: 'message',
          message: { patterns: ['hello'], matchMode: 'contains', caseSensitive: false },
        }),
      ]);
      expect(matcher.findMatchingTriggers([skill], makeContext())).toHaveLength(0);
    });
  });

  describe('tool_use trigger matching', () => {
    it('matches when tool name is in list', () => {
      const skill = makeSkill([
        makeTrigger({ type: 'tool_use', toolUse: { toolNames: ['search', 'read'] } }),
      ]);
      const ctx = makeContext({ tool: { name: 'search', input: {}, success: true } });
      expect(matcher.findMatchingTriggers([skill], ctx)).toHaveLength(1);
    });

    it('does not match when tool name not in list', () => {
      const skill = makeSkill([
        makeTrigger({ type: 'tool_use', toolUse: { toolNames: ['search'] } }),
      ]);
      const ctx = makeContext({ tool: { name: 'write', input: {}, success: true } });
      expect(matcher.findMatchingTriggers([skill], ctx)).toHaveLength(0);
    });

    it('does not match when no tool in context', () => {
      const skill = makeSkill([
        makeTrigger({ type: 'tool_use', toolUse: { toolNames: ['search'] } }),
      ]);
      expect(matcher.findMatchingTriggers([skill], makeContext())).toHaveLength(0);
    });
  });

  describe('event trigger matching', () => {
    it('matches when event type is in list', () => {
      const skill = makeSkill([
        makeTrigger({ type: 'event', event: { events: ['startup', 'shutdown'] } }),
      ]);
      const ctx = makeContext({ event: { type: 'startup', data: {} } });
      expect(matcher.findMatchingTriggers([skill], ctx)).toHaveLength(1);
    });

    it('does not match when event type not in list', () => {
      const skill = makeSkill([makeTrigger({ type: 'event', event: { events: ['startup'] } })]);
      const ctx = makeContext({ event: { type: 'shutdown', data: {} } });
      expect(matcher.findMatchingTriggers([skill], ctx)).toHaveLength(0);
    });

    it('does not match when no event in context', () => {
      const skill = makeSkill([makeTrigger({ type: 'event', event: { events: ['startup'] } })]);
      expect(matcher.findMatchingTriggers([skill], makeContext())).toHaveLength(0);
    });
  });

  describe('condition trigger matching', () => {
    it('matches with eq condition AND logic', () => {
      const skill = makeSkill([
        makeTrigger({
          type: 'condition',
          condition: {
            logical: 'AND',
            conditions: [{ field: 'hour', operator: 'gte', value: 0 }],
          },
        }),
      ]);
      expect(matcher.findMatchingTriggers([skill], makeContext())).toHaveLength(1);
    });

    it('matches with OR logic when one condition passes', () => {
      const currentHour = new Date().getHours();
      const skill = makeSkill([
        makeTrigger({
          type: 'condition',
          condition: {
            logical: 'OR',
            conditions: [
              { field: 'hour', operator: 'eq', value: 9999 }, // always false
              { field: 'hour', operator: 'eq', value: currentHour }, // always true
            ],
          },
        }),
      ]);
      expect(matcher.findMatchingTriggers([skill], makeContext())).toHaveLength(1);
    });

    it('evaluates between operator', () => {
      const skill = makeSkill([
        makeTrigger({
          type: 'condition',
          condition: {
            logical: 'AND',
            conditions: [{ field: 'hour', operator: 'between', value: [0, 23] }],
          },
        }),
      ]);
      expect(matcher.findMatchingTriggers([skill], makeContext())).toHaveLength(1);
    });

    it('returns false for unknown trigger type', () => {
      const skill = makeSkill([makeTrigger({ type: 'unknown_type' as never })]);
      expect(matcher.findMatchingTriggers([skill], makeContext())).toHaveLength(0);
    });
  });

  describe('cooldown', () => {
    it('blocks trigger within cooldown window', () => {
      const skill = makeSkill([
        makeTrigger({
          id: 'trig-cool',
          cooldownMs: 60000,
          type: 'message',
          message: { patterns: ['hi'], matchMode: 'contains', caseSensitive: false },
        }),
      ]);
      matcher.recordTrigger('skill-1', 'trig-cool', 60000);
      const ctx = makeContext({ message: { text: 'hi', userId: 'u1', timestamp: Date.now() } });
      expect(matcher.findMatchingTriggers([skill], ctx)).toHaveLength(0);
    });

    it('allows trigger after clearing cooldown', () => {
      const skill = makeSkill([
        makeTrigger({
          id: 'trig-clear',
          cooldownMs: 60000,
          type: 'message',
          message: { patterns: ['hi'], matchMode: 'contains', caseSensitive: false },
        }),
      ]);
      matcher.recordTrigger('skill-1', 'trig-clear', 60000);
      matcher.clearCooldown('skill-1', 'trig-clear');
      const ctx = makeContext({ message: { text: 'hi', userId: 'u1', timestamp: Date.now() } });
      expect(matcher.findMatchingTriggers([skill], ctx)).toHaveLength(1);
    });

    it('clears all cooldowns for a skill', () => {
      matcher.recordTrigger('skill-1', 'trig-a', 60000);
      matcher.recordTrigger('skill-1', 'trig-b', 60000);
      matcher.clearAllCooldownsForSkill('skill-1');

      const skill = makeSkill([
        makeTrigger({
          id: 'trig-a',
          cooldownMs: 60000,
          type: 'message',
          message: { patterns: ['hi'], matchMode: 'contains', caseSensitive: false },
        }),
      ]);
      const ctx = makeContext({ message: { text: 'hi', userId: 'u1', timestamp: Date.now() } });
      expect(matcher.findMatchingTriggers([skill], ctx)).toHaveLength(1);
    });
  });
});

// ── renderContextTemplate Tests ───────────────────────────────────

describe('renderContextTemplate', () => {
  const baseCtx: TriggerContext = {
    sessionId: 'sess-42',
    personalityId: 'pers-99',
  };

  it('replaces {{sessionId}} and {{personalityId}}', () => {
    const result = renderContextTemplate(
      'session={{sessionId}}, personality={{personalityId}}',
      baseCtx
    );
    expect(result).toBe('session=sess-42, personality=pers-99');
  });

  it('replaces message placeholders', () => {
    const ctx: TriggerContext = {
      ...baseCtx,
      message: { text: 'hello world', userId: 'user-1', timestamp: 0 },
    };
    const result = renderContextTemplate('{{message.text}} from {{message.userId}}', ctx);
    expect(result).toBe('hello world from user-1');
  });

  it('replaces tool placeholders', () => {
    const ctx: TriggerContext = {
      ...baseCtx,
      tool: { name: 'search', input: { q: 'test' }, output: { results: [] }, success: true },
    };
    const result = renderContextTemplate(
      'tool={{tool.name}}, in={{tool.input}}, out={{tool.output}}',
      ctx
    );
    expect(result).toContain('tool=search');
    expect(result).toContain('"q":"test"');
  });

  it('replaces event placeholders', () => {
    const ctx: TriggerContext = {
      ...baseCtx,
      event: { type: 'startup', data: { version: '1.0' } },
    };
    const result = renderContextTemplate('event={{event.type}} data={{event.data}}', ctx);
    expect(result).toContain('event=startup');
    expect(result).toContain('"version":"1.0"');
  });

  it('leaves unmatched placeholders unchanged', () => {
    const result = renderContextTemplate('{{unknown}} stays', baseCtx);
    expect(result).toBe('{{unknown}} stays');
  });
});
