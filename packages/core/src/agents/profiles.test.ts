import { describe, it, expect } from 'vitest';
import { BUILTIN_PROFILES } from './profiles.js';

describe('BUILTIN_PROFILES', () => {
  it('exports 4 built-in profiles', () => {
    expect(BUILTIN_PROFILES).toHaveLength(4);
  });

  it('all profiles are marked as builtin', () => {
    for (const profile of BUILTIN_PROFILES) {
      expect(profile.isBuiltin).toBe(true);
    }
  });

  it('all profiles have unique ids', () => {
    const ids = BUILTIN_PROFILES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all profiles have llm type', () => {
    for (const profile of BUILTIN_PROFILES) {
      expect(profile.type).toBe('llm');
    }
  });

  it('contains researcher profile', () => {
    const p = BUILTIN_PROFILES.find((p) => p.id === 'builtin-researcher');
    expect(p).toBeDefined();
    expect(p?.name).toBe('researcher');
    expect(p?.maxTokenBudget).toBe(50000);
  });

  it('contains coder profile', () => {
    const p = BUILTIN_PROFILES.find((p) => p.id === 'builtin-coder');
    expect(p).toBeDefined();
    expect(p?.maxTokenBudget).toBe(80000);
  });

  it('contains analyst profile', () => {
    const p = BUILTIN_PROFILES.find((p) => p.id === 'builtin-analyst');
    expect(p).toBeDefined();
    expect(p?.maxTokenBudget).toBe(60000);
  });

  it('contains summarizer profile', () => {
    const p = BUILTIN_PROFILES.find((p) => p.id === 'builtin-summarizer');
    expect(p).toBeDefined();
    expect(p?.maxTokenBudget).toBe(30000);
  });

  it('all profiles have non-empty system prompts', () => {
    for (const profile of BUILTIN_PROFILES) {
      expect(profile.systemPrompt.length).toBeGreaterThan(0);
    }
  });
});
