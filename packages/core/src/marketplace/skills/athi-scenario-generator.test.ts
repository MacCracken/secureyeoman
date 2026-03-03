/**
 * ATHI Scenario Generator Skill Tests
 */

import { describe, it, expect } from 'vitest';
import { athiScenarioGeneratorSkill } from './athi-scenario-generator.js';

describe('ATHI Scenario Generator Skill', () => {
  it('has required fields', () => {
    expect(athiScenarioGeneratorSkill.name).toBe('ATHI Scenario Generator');
    expect(athiScenarioGeneratorSkill.description).toBeTruthy();
    expect(athiScenarioGeneratorSkill.category).toBe('security');
    expect(athiScenarioGeneratorSkill.author).toBe('YEOMAN');
    expect(athiScenarioGeneratorSkill.version).toBe('2026.3.3');
  });

  it('has authorInfo', () => {
    expect(athiScenarioGeneratorSkill.authorInfo).toBeDefined();
    expect(athiScenarioGeneratorSkill.authorInfo!.name).toBe('YEOMAN');
    expect(athiScenarioGeneratorSkill.authorInfo!.github).toBe('MacCracken');
  });

  it('has instructions within length limit (8000 chars)', () => {
    // instructions may be string[] (pre-join) or string (post-join by storage)
    const text = Array.isArray(athiScenarioGeneratorSkill.instructions)
      ? (athiScenarioGeneratorSkill.instructions as string[]).join('\n')
      : (athiScenarioGeneratorSkill.instructions as string);
    expect(text.length).toBeGreaterThan(100);
    expect(text.length).toBeLessThanOrEqual(8000);
  });

  it('has trigger patterns that compile as valid regex', () => {
    expect(Array.isArray(athiScenarioGeneratorSkill.triggerPatterns)).toBe(true);
    expect(athiScenarioGeneratorSkill.triggerPatterns!.length).toBeGreaterThan(0);
    for (const pattern of athiScenarioGeneratorSkill.triggerPatterns!) {
      expect(() => new RegExp(pattern, 'i')).not.toThrow();
    }
  });

  it('trigger patterns match expected inputs', () => {
    const patterns = athiScenarioGeneratorSkill.triggerPatterns!.map(
      (p) => new RegExp(p, 'i')
    );
    const shouldMatch = [
      'generate ATHI scenarios',
      'threat scenario generation for my org',
      'AI threat assessment',
      'athi scenario analysis',
    ];
    for (const input of shouldMatch) {
      const matched = patterns.some((rx) => rx.test(input));
      expect(matched, `Expected "${input}" to match at least one trigger`).toBe(true);
    }
  });

  it('has L2 autonomy and fuzzy routing', () => {
    expect(athiScenarioGeneratorSkill.autonomyLevel).toBe('L2');
    expect(athiScenarioGeneratorSkill.routing).toBe('fuzzy');
  });

  it('has successCriteria within length limit', () => {
    expect(athiScenarioGeneratorSkill.successCriteria).toBeTruthy();
    expect(athiScenarioGeneratorSkill.successCriteria!.length).toBeLessThanOrEqual(300);
  });

  it('instructions reference ATHI taxonomy elements', () => {
    const text = Array.isArray(athiScenarioGeneratorSkill.instructions)
      ? (athiScenarioGeneratorSkill.instructions as string[]).join('\n')
      : (athiScenarioGeneratorSkill.instructions as string);
    expect(text).toContain('nation_state');
    expect(text).toContain('prompt_injection');
    expect(text).toContain('data_breach');
    expect(text).toContain('regulatory_penalty');
    expect(text).toContain('Anti-Hallucination');
  });
});
