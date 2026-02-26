/**
 * Swarm Templates Tests
 *
 * Validates the structure of the built-in swarm template definitions.
 */

import { describe, it, expect } from 'vitest';
import { BUILTIN_SWARM_TEMPLATES } from './swarm-templates.js';

describe('BUILTIN_SWARM_TEMPLATES', () => {
  it('exports an array of templates', () => {
    expect(Array.isArray(BUILTIN_SWARM_TEMPLATES)).toBe(true);
    expect(BUILTIN_SWARM_TEMPLATES.length).toBeGreaterThan(0);
  });

  it('each template has required fields', () => {
    for (const tpl of BUILTIN_SWARM_TEMPLATES) {
      expect(typeof tpl.id).toBe('string');
      expect(typeof tpl.name).toBe('string');
      expect(typeof tpl.description).toBe('string');
      expect(['sequential', 'parallel', 'consensus', 'adaptive']).toContain(tpl.strategy);
      expect(Array.isArray(tpl.roles)).toBe(true);
      expect(tpl.roles.length).toBeGreaterThan(0);
      expect(tpl.isBuiltin).toBe(true);
    }
  });

  it('each role has required fields', () => {
    for (const tpl of BUILTIN_SWARM_TEMPLATES) {
      for (const role of tpl.roles) {
        expect(typeof role.role).toBe('string');
        expect(typeof role.profileName).toBe('string');
        expect(typeof role.description).toBe('string');
      }
    }
  });

  it('includes research-and-code template', () => {
    const tpl = BUILTIN_SWARM_TEMPLATES.find((t) => t.id === 'research-and-code');
    expect(tpl).toBeDefined();
    expect(tpl!.strategy).toBe('sequential');
    expect(tpl!.roles.map((r) => r.role)).toEqual(
      expect.arrayContaining(['researcher', 'coder', 'reviewer'])
    );
  });

  it('includes parallel-research template with parallel strategy', () => {
    const tpl = BUILTIN_SWARM_TEMPLATES.find((t) => t.id === 'parallel-research');
    expect(tpl).toBeDefined();
    expect(tpl!.strategy).toBe('parallel');
    expect(tpl!.coordinatorProfile).toBe('analyst');
  });

  it('includes code-review template', () => {
    const tpl = BUILTIN_SWARM_TEMPLATES.find((t) => t.id === 'code-review');
    expect(tpl).toBeDefined();
    expect(tpl!.roles.some((r) => r.role === 'coder')).toBe(true);
    expect(tpl!.roles.some((r) => r.role === 'reviewer')).toBe(true);
  });
});
