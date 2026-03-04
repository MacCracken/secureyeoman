import { describe, expect, it } from 'vitest';
import type { Memory } from '../types.js';
import {
  COMPRESSION_SYSTEM_PROMPT,
  buildTemporalCompressionPrompt,
  buildThematicCompressionPrompt,
  parseCompressionResponse,
} from './compression-prompts.js';

function makeMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: 'mem-1',
    personalityId: 'p-1',
    type: 'episodic',
    content: 'The user prefers dark mode.',
    source: 'conversation',
    context: {},
    importance: 0.75,
    accessCount: 3,
    lastAccessedAt: Date.now(),
    expiresAt: null,
    createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000, // 2 days ago
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('COMPRESSION_SYSTEM_PROMPT', () => {
  it('is a non-empty string', () => {
    expect(typeof COMPRESSION_SYSTEM_PROMPT).toBe('string');
    expect(COMPRESSION_SYSTEM_PROMPT.trim().length).toBeGreaterThan(0);
  });
});

describe('buildTemporalCompressionPrompt', () => {
  it('includes memory content and importance', () => {
    const memories = [
      makeMemory({ content: 'User likes TypeScript', importance: 0.9 }),
      makeMemory({ id: 'mem-2', content: 'User dislikes Java', importance: 0.4 }),
    ];
    const prompt = buildTemporalCompressionPrompt(memories);

    expect(prompt).toContain('User likes TypeScript');
    expect(prompt).toContain('User dislikes Java');
    expect(prompt).toContain('0.90');
    expect(prompt).toContain('0.40');
    expect(prompt).toContain('2 episodic memories');
  });

  it('includes the memory count in the prompt', () => {
    const memories = [makeMemory(), makeMemory({ id: 'mem-2' }), makeMemory({ id: 'mem-3' })];
    const prompt = buildTemporalCompressionPrompt(memories);
    expect(prompt).toContain('3 episodic memories');
  });
});

describe('buildThematicCompressionPrompt', () => {
  it('includes memory type and access count', () => {
    const memories = [
      makeMemory({ type: 'semantic', accessCount: 12, content: 'API endpoint is /v2/users' }),
      makeMemory({
        id: 'mem-2',
        type: 'procedural',
        accessCount: 5,
        content: 'Deploy with npm run deploy',
      }),
    ];
    const prompt = buildThematicCompressionPrompt(memories);

    expect(prompt).toContain('type: semantic');
    expect(prompt).toContain('type: procedural');
    expect(prompt).toContain('accesses: 12');
    expect(prompt).toContain('accesses: 5');
    expect(prompt).toContain('API endpoint is /v2/users');
    expect(prompt).toContain('Deploy with npm run deploy');
  });

  it('includes the memory count in the prompt', () => {
    const memories = [makeMemory()];
    const prompt = buildThematicCompressionPrompt(memories);
    expect(prompt).toContain('1 thematically related memories');
  });
});

describe('parseCompressionResponse', () => {
  it('returns plain text as-is (trimmed)', () => {
    const result = parseCompressionResponse('  User prefers dark mode.  ');
    expect(result).toBe('User prefers dark mode.');
  });

  it('strips markdown code blocks', () => {
    const result = parseCompressionResponse('```\nCompressed summary here.\n```');
    expect(result).toBe('Compressed summary here.');
  });

  it('strips markdown code blocks with language tag', () => {
    const result = parseCompressionResponse('```text\nCompressed summary here.\n```');
    expect(result).toBe('Compressed summary here.');
  });

  it('strips leading and trailing double quotes', () => {
    const result = parseCompressionResponse('"A quoted response"');
    expect(result).toBe('A quoted response');
  });

  it('returns null for empty string', () => {
    expect(parseCompressionResponse('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(parseCompressionResponse('   \n  ')).toBeNull();
  });

  it('returns the code block markers for a whitespace-only code block', () => {
    // The regex needs actual content to capture; whitespace-only content
    // inside a code block does not match the extraction pattern, so the
    // full trimmed string (with backticks) is returned as-is.
    const result = parseCompressionResponse('```\n   \n```');
    expect(result).toBe('```\n   \n```');
  });

  it('does not strip quotes that are not wrapping the entire string', () => {
    const result = parseCompressionResponse('He said "hello" to her');
    expect(result).toBe('He said "hello" to her');
  });
});
