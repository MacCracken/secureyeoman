import { describe, it, expect } from 'vitest';
import { autoresearchSkill } from './autoresearch.js';

describe('autoresearchSkill', () => {
  it('has required fields', () => {
    expect(autoresearchSkill.name).toBe('Autoresearch');
    expect(autoresearchSkill.category).toBe('productivity');
    expect(autoresearchSkill.author).toBe('YEOMAN');
    expect(autoresearchSkill.version).toBeTruthy();
    expect(autoresearchSkill.instructions).toBeTruthy();
    expect(autoresearchSkill.tags).toContain('autoresearch');
    expect(autoresearchSkill.tags).toContain('experiment');
  });

  it('instructions cover core methodology', () => {
    const instructions = autoresearchSkill.instructions!;
    expect(instructions).toContain('Fixed Budget');
    expect(instructions).toContain('Single-Scope Modification');
    expect(instructions).toContain('Metric-Driven');
    expect(instructions).toContain('Journal Everything');
    expect(instructions).toContain('Retain or Discard');
  });

  it('instructions include workflow phases', () => {
    const instructions = autoresearchSkill.instructions!;
    expect(instructions).toContain('Session Setup');
    expect(instructions).toContain('Hypothesis Generation');
    expect(instructions).toContain('Execution & Evaluation');
    expect(instructions).toContain('Analysis & Iteration');
  });

  it('has authorInfo with expected fields', () => {
    expect(autoresearchSkill.authorInfo).toEqual({
      name: 'YEOMAN',
      github: 'MacCracken',
      website: 'https://secureyeoman.ai',
    });
  });
});
