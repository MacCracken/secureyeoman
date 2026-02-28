import { describe, it, expect } from 'vitest';
import { BUILTIN_PROFILES } from './profiles.js';

describe('BUILTIN_PROFILES', () => {
  it('exports 8 built-in profiles', () => {
    expect(BUILTIN_PROFILES).toHaveLength(8);
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

  it('all profiles have non-empty system prompts', () => {
    for (const profile of BUILTIN_PROFILES) {
      expect(profile.systemPrompt.length).toBeGreaterThan(0);
    }
  });

  // ── Original four ──────────────────────────────────────────────────────────

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

  // ── Prompt Engineering Quartet ─────────────────────────────────────────────

  it('contains intent-engineer profile', () => {
    const p = BUILTIN_PROFILES.find((p) => p.id === 'builtin-intent-engineer');
    expect(p).toBeDefined();
    expect(p?.name).toBe('intent-engineer');
    expect(p?.maxTokenBudget).toBe(40000);
    expect(p?.systemPrompt).toContain('Intent Engineering Agent');
    expect(p?.allowedTools).toContain('memory_recall');
  });

  it('contains context-engineer profile', () => {
    const p = BUILTIN_PROFILES.find((p) => p.id === 'builtin-context-engineer');
    expect(p).toBeDefined();
    expect(p?.name).toBe('context-engineer');
    expect(p?.maxTokenBudget).toBe(50000);
    expect(p?.systemPrompt).toContain('Context Engineering Agent');
    expect(p?.allowedTools).toContain('knowledge_store');
  });

  it('contains prompt-crafter profile', () => {
    const p = BUILTIN_PROFILES.find((p) => p.id === 'builtin-prompt-crafter');
    expect(p).toBeDefined();
    expect(p?.name).toBe('prompt-crafter');
    expect(p?.maxTokenBudget).toBe(50000);
    expect(p?.systemPrompt).toContain('Prompt Crafting Agent');
    expect(p?.systemPrompt).toContain('Chain-of-Thought');
  });

  it('contains spec-engineer profile', () => {
    const p = BUILTIN_PROFILES.find((p) => p.id === 'builtin-spec-engineer');
    expect(p).toBeDefined();
    expect(p?.name).toBe('spec-engineer');
    expect(p?.maxTokenBudget).toBe(60000);
    expect(p?.systemPrompt).toContain('Specification Engineering Agent');
    expect(p?.systemPrompt).toContain('Acceptance Criteria');
  });

  it('prompt engineering quartet profiles have narrow tool scopes', () => {
    const quartetIds = [
      'builtin-intent-engineer',
      'builtin-context-engineer',
      'builtin-prompt-crafter',
      'builtin-spec-engineer',
    ];
    for (const id of quartetIds) {
      const p = BUILTIN_PROFILES.find((p) => p.id === id);
      expect(p).toBeDefined();
      // No filesystem, git, or web tools — reasoning-only profiles
      expect(p?.allowedTools.some((t) => t.startsWith('fs_'))).toBe(false);
      expect(p?.allowedTools.some((t) => t.startsWith('git_'))).toBe(false);
      expect(p?.allowedTools.some((t) => t.startsWith('web_'))).toBe(false);
    }
  });
});
