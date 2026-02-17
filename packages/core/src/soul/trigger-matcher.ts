/**
 * Skill Trigger System
 *
 * Matches and executes skill triggers based on user input, tool usage, and events.
 * See ADR 022: Skill Trigger System
 */

import {
  type Skill,
  type SkillTrigger,
  type MessageTrigger,
  type ToolUseTrigger,
  type EventTrigger,
  type ConditionTrigger,
} from '@friday/shared';

export interface TriggerContext {
  message?: {
    text: string;
    userId: string;
    timestamp: number;
  };
  tool?: {
    name: string;
    input: unknown;
    output?: unknown;
    success: boolean;
  };
  event?: {
    type: string;
    data: unknown;
  };
  sessionId: string;
  personalityId: string;
}

export interface TriggerMatch {
  skill: Skill;
  trigger: SkillTrigger;
  context: TriggerContext;
}

export interface CooldownTracker {
  skillId: string;
  triggerId: string;
  lastTriggered: number;
}

interface ConditionDef {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'between';
  value?: unknown;
}

export class SkillTriggerMatcher {
  private cooldowns = new Map<string, CooldownTracker>();

  findMatchingTriggers(skills: Skill[], context: TriggerContext): TriggerMatch[] {
    const matches: TriggerMatch[] = [];

    for (const skill of skills) {
      if (!skill.enabled || skill.status !== 'active') {
        continue;
      }

      const triggers = skill.triggers ?? [];

      for (const trigger of triggers) {
        if (!trigger.enabled) {
          continue;
        }

        const cooldownMs = trigger.cooldownMs ?? 0;
        if (!this.checkCooldown(skill.id, trigger.id, cooldownMs)) {
          continue;
        }

        const isMatch = this.matchesTrigger(trigger, context);
        if (isMatch) {
          matches.push({ skill, trigger, context });
        }
      }
    }

    return matches.sort((a, b) => b.trigger.priority - a.trigger.priority);
  }

  private matchesTrigger(trigger: SkillTrigger, context: TriggerContext): boolean {
    switch (trigger.type) {
      case 'message':
        return trigger.message ? this.matchesMessageTrigger(trigger.message, context) : false;
      case 'tool_use':
        return trigger.toolUse ? this.matchesToolUseTrigger(trigger.toolUse, context) : false;
      case 'event':
        return trigger.event ? this.matchesEventTrigger(trigger.event, context) : false;
      case 'condition':
        return trigger.condition ? this.matchesConditionTrigger(trigger.condition, context) : false;
      default:
        return false;
    }
  }

  private matchesMessageTrigger(trigger: MessageTrigger, context: TriggerContext): boolean {
    if (!context.message?.text) {
      return false;
    }

    const text = context.message.text;
    const searchText = trigger.caseSensitive ? text : text.toLowerCase();

    for (const pattern of trigger.patterns) {
      const searchPattern = trigger.caseSensitive ? pattern : pattern.toLowerCase();

      switch (trigger.matchMode) {
        case 'exact':
          if (text === searchPattern) return true;
          break;
        case 'contains':
          if (searchText.includes(searchPattern)) return true;
          break;
        case 'regex':
          try {
            const regex = new RegExp(searchPattern, trigger.caseSensitive ? '' : 'i');
            if (regex.test(text)) return true;
          } catch {
            // Invalid regex, skip
          }
          break;
        case 'startsWith':
          if (searchText.startsWith(searchPattern)) return true;
          break;
      }
    }

    return false;
  }

  private matchesToolUseTrigger(trigger: ToolUseTrigger, context: TriggerContext): boolean {
    if (!context.tool) {
      return false;
    }

    const toolName = context.tool.name;
    return trigger.toolNames.includes(toolName);
  }

  private matchesEventTrigger(trigger: EventTrigger, context: TriggerContext): boolean {
    if (!context.event) {
      return false;
    }

    return trigger.events.includes(context.event.type as never);
  }

  private matchesConditionTrigger(trigger: ConditionTrigger, context: TriggerContext): boolean {
    const results = trigger.conditions.map((cond: ConditionDef) => {
      const value = this.getFieldValue(cond.field, context);
      return this.evaluateCondition(value, cond.operator, cond.value);
    });

    if (trigger.logical === 'AND') {
      return results.every((r: boolean) => r);
    } else {
      return results.some((r: boolean) => r);
    }
  }

  private getFieldValue(field: string, _context: TriggerContext): unknown {
    switch (field) {
      case 'time':
        return Date.now();
      case 'day':
        return new Date().toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
      case 'hour':
        return new Date().getHours();
      default:
        return undefined;
    }
  }

  private evaluateCondition(value: unknown, operator: string, target: unknown): boolean {
    switch (operator) {
      case 'eq':
        return value === target;
      case 'ne':
        return value !== target;
      case 'gt':
        return typeof value === 'number' && typeof target === 'number' && value > target;
      case 'lt':
        return typeof value === 'number' && typeof target === 'number' && value < target;
      case 'gte':
        return typeof value === 'number' && typeof target === 'number' && value >= target;
      case 'lte':
        return typeof value === 'number' && typeof target === 'number' && value <= target;
      case 'between':
        if (Array.isArray(target) && target.length === 2) {
          return (
            typeof value === 'number' &&
            value >= (target[0] as number) &&
            value <= (target[1] as number)
          );
        }
        return false;
      default:
        return false;
    }
  }

  private checkCooldown(skillId: string, triggerId: string, cooldownMs: number): boolean {
    if (cooldownMs <= 0) {
      return true;
    }

    const key = `${skillId}:${triggerId}`;
    const tracker = this.cooldowns.get(key);

    if (!tracker) {
      return true;
    }

    return Date.now() - tracker.lastTriggered >= cooldownMs;
  }

  recordTrigger(skillId: string, triggerId: string, _cooldownMs: number): void {
    const key = `${skillId}:${triggerId}`;
    this.cooldowns.set(key, {
      skillId,
      triggerId,
      lastTriggered: Date.now(),
    });
  }

  clearCooldown(skillId: string, triggerId: string): void {
    const key = `${skillId}:${triggerId}`;
    this.cooldowns.delete(key);
  }

  clearAllCooldownsForSkill(skillId: string): void {
    for (const key of this.cooldowns.keys()) {
      if (key.startsWith(`${skillId}:`)) {
        this.cooldowns.delete(key);
      }
    }
  }
}

export function renderContextTemplate(template: string, context: TriggerContext): string {
  let result = template;

  if (context.message) {
    result = result.replace(/\{\{message\.text\}\}/g, context.message.text);
    result = result.replace(/\{\{message\.userId\}\}/g, context.message.userId);
  }

  if (context.tool) {
    result = result.replace(/\{\{tool\.name\}\}/g, context.tool.name);
    result = result.replace(/\{\{tool\.input\}\}/g, JSON.stringify(context.tool.input));
    result = result.replace(/\{\{tool\.output\}\}/g, JSON.stringify(context.tool.output ?? ''));
  }

  if (context.event) {
    result = result.replace(/\{\{event\.type\}\}/g, context.event.type);
    result = result.replace(/\{\{event\.data\}\}/g, JSON.stringify(context.event.data));
  }

  result = result.replace(/\{\{sessionId\}\}/g, context.sessionId);
  result = result.replace(/\{\{personalityId\}\}/g, context.personalityId);

  return result;
}
