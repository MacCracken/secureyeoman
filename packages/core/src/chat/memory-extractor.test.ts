import { describe, it, expect } from 'vitest';
import { extractMemories, stripMemoryTags, MEMORY_SYSTEM_HINT } from './memory-extractor.js';

describe('extractMemories', () => {
  it('returns empty array for content with no tags', () => {
    expect(extractMemories('Hello, how can I help you?')).toEqual([]);
  });

  it('extracts a single memory tag', () => {
    const content = 'I noted that. [MEMORY: User prefers Python over JavaScript]';
    const memories = extractMemories(content);
    expect(memories).toHaveLength(1);
    expect(memories[0]!.content).toBe('User prefers Python over JavaScript');
  });

  it('extracts multiple memory tags', () => {
    const content = '[MEMORY: User name is Alice] Some text [MEMORY: User lives in Berlin]';
    const memories = extractMemories(content);
    expect(memories).toHaveLength(2);
    expect(memories[0]!.content).toBe('User name is Alice');
    expect(memories[1]!.content).toBe('User lives in Berlin');
  });

  it('trims whitespace from extracted content', () => {
    const content = '[MEMORY:   extra spaces   ]';
    const memories = extractMemories(content);
    expect(memories).toHaveLength(1);
    expect(memories[0]!.content).toBe('extra spaces');
  });

  it('ignores empty memory tags', () => {
    const content = '[MEMORY:   ] Some text';
    const memories = extractMemories(content);
    expect(memories).toHaveLength(0);
  });

  it('handles tags spanning various content', () => {
    const content = `
      Great to meet you! [MEMORY: User's favorite fruit is mango]
      I'll remember that.
      [MEMORY: User works as a software engineer]
    `;
    const memories = extractMemories(content);
    expect(memories).toHaveLength(2);
    expect(memories[0]!.content).toBe("User's favorite fruit is mango");
    expect(memories[1]!.content).toBe('User works as a software engineer');
  });
});

describe('stripMemoryTags', () => {
  it('returns unchanged string when no tags present', () => {
    expect(stripMemoryTags('Hello world')).toBe('Hello world');
  });

  it('removes a single memory tag', () => {
    const content = 'I noted that. [MEMORY: User prefers dark mode]';
    const stripped = stripMemoryTags(content);
    expect(stripped).not.toContain('[MEMORY:');
    expect(stripped).toContain('I noted that.');
  });

  it('removes multiple memory tags', () => {
    const content = '[MEMORY: fact1] Hello [MEMORY: fact2] World';
    const stripped = stripMemoryTags(content);
    expect(stripped).not.toContain('[MEMORY:');
    expect(stripped).toContain('Hello');
    expect(stripped).toContain('World');
  });

  it('collapses multiple blank lines to at most two', () => {
    const content = 'Line one\n\n\n\n\nLine two';
    const stripped = stripMemoryTags(content);
    expect(stripped).not.toMatch(/\n{3,}/);
  });

  it('trims leading and trailing whitespace', () => {
    const content = '  [MEMORY: fact]  \n  ';
    const stripped = stripMemoryTags(content);
    expect(stripped).toBe('');
  });
});

describe('MEMORY_SYSTEM_HINT', () => {
  it('is a non-empty string', () => {
    expect(typeof MEMORY_SYSTEM_HINT).toBe('string');
    expect(MEMORY_SYSTEM_HINT.length).toBeGreaterThan(0);
  });

  it('instructs usage of [MEMORY: ...] tags', () => {
    expect(MEMORY_SYSTEM_HINT).toContain('[MEMORY:');
  });
});
