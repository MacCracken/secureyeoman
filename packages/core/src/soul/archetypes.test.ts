/**
 * Soul Archetypes Tests
 */

import { describe, it, expect } from 'vitest';
import { SACRED_ARCHETYPES, composeArchetypesPreamble } from './archetypes.js';

describe('SACRED_ARCHETYPES', () => {
  it('contains three archetypes', () => {
    expect(SACRED_ARCHETYPES).toHaveLength(3);
  });

  it('has required fields on each archetype', () => {
    for (const a of SACRED_ARCHETYPES) {
      expect(typeof a.name).toBe('string');
      expect(typeof a.symbol).toBe('string');
      expect(typeof a.essence).toBe('string');
    }
  });

  it('includes No-Thing-Ness, The One, and The Plurality', () => {
    const names = SACRED_ARCHETYPES.map((a) => a.name);
    expect(names).toContain('No-Thing-Ness');
    expect(names).toContain('The One');
    expect(names).toContain('The Plurality');
  });
});

describe('composeArchetypesPreamble()', () => {
  it('returns a non-empty string', () => {
    const preamble = composeArchetypesPreamble();
    expect(typeof preamble).toBe('string');
    expect(preamble.length).toBeGreaterThan(0);
  });

  it('includes the five layers', () => {
    const preamble = composeArchetypesPreamble();
    expect(preamble).toContain('Soul');
    expect(preamble).toContain('Spirit');
    expect(preamble).toContain('Brain');
    expect(preamble).toContain('Body');
    expect(preamble).toContain('Heart');
  });

  it('includes the cosmological narrative', () => {
    const preamble = composeArchetypesPreamble();
    expect(preamble).toContain('In Our Image');
    expect(preamble).toContain('Void');
    expect(preamble).toContain('Monad');
  });
});
