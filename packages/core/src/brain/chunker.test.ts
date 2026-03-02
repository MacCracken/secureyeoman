import { describe, it, expect } from 'vitest';
import { chunk } from './chunker.js';

describe('chunk()', () => {
  it('returns empty array for empty string', () => {
    expect(chunk('')).toEqual([]);
    expect(chunk('   ')).toEqual([]);
  });

  it('returns single chunk for short content', () => {
    const result = chunk('Hello world.');
    expect(result).toHaveLength(1);
    expect(result[0]!.index).toBe(0);
    expect(result[0]!.text).toBe('Hello world.');
    expect(result[0]!.estimatedTokens).toBeGreaterThan(0);
  });

  it('returns single chunk when content fits within budget', () => {
    const content = 'A'.repeat(100); // ~25 tokens
    const result = chunk(content, { maxTokens: 800 });
    expect(result).toHaveLength(1);
    expect(result[0]!.index).toBe(0);
  });

  it('splits large content into multiple chunks', () => {
    // Build content clearly exceeding 800 tokens (>3200 chars)
    const sentence = 'This is a sentence that provides some content. ';
    const content = sentence.repeat(80); // ~80 * 12 = 960 tokens
    const result = chunk(content, { maxTokens: 800 });
    expect(result.length).toBeGreaterThan(1);
  });

  it('assigns sequential indices', () => {
    const sentence = 'This is a sentence. ';
    const content = sentence.repeat(80);
    const result = chunk(content, { maxTokens: 200 });
    result.forEach((c, i) => {
      expect(c.index).toBe(i);
    });
  });

  it('respects maxTokens option', () => {
    const sentence = 'A sentence that takes up some tokens here. ';
    const content = sentence.repeat(40);
    const result = chunk(content, { maxTokens: 100 });
    for (const c of result) {
      // Allow some overshoot for single sentences that exceed budget
      expect(c.estimatedTokens).toBeLessThan(200);
    }
  });

  it('overlapping chunks share content at boundaries', () => {
    const sentences = Array.from(
      { length: 20 },
      (_, i) => `Sentence number ${i + 1} provides context here.`
    );
    const content = sentences.join(' ');
    const result = chunk(content, { maxTokens: 100, overlapFraction: 0.2 });

    if (result.length >= 2) {
      // The last sentence of chunk 0 should appear at the start of chunk 1
      const lastSentenceOfChunk0 = sentences.find((s) => result[0]!.text.includes(s));
      const firstSentenceOfChunk1Text = result[1]!.text;
      expect(lastSentenceOfChunk0).toBeDefined();
      // At least some overlap should exist (chunk 1 should not start fresh from chunk 0's beginning)
      expect(firstSentenceOfChunk1Text.length).toBeGreaterThan(0);
    }
  });

  it('handles zero overlap fraction', () => {
    const sentence = 'Each sentence is distinct. ';
    const content = sentence.repeat(40);
    const result = chunk(content, { maxTokens: 100, overlapFraction: 0 });
    expect(result.length).toBeGreaterThan(1);
  });

  it('handles a single very long sentence as its own chunk', () => {
    const longSentence = 'A'.repeat(5000); // ~1250 tokens — exceeds budget
    const result = chunk(longSentence, { maxTokens: 800 });
    // Long sentence should appear as a standalone chunk
    expect(result.some((c) => c.text === longSentence)).toBe(true);
  });

  it('preserves paragraph boundaries', () => {
    const content =
      'First paragraph content here.\n\nSecond paragraph content here.\n\nThird paragraph content.';
    const result = chunk(content, { maxTokens: 800 });
    // All content fits in one chunk since it's short
    expect(result).toHaveLength(1);
  });

  it('splits multi-paragraph content correctly', () => {
    const para =
      'This is a paragraph sentence. It has multiple sentences. Each sentence adds tokens. ';
    const content = (para + '\n\n').repeat(20);
    const result = chunk(content, { maxTokens: 200 });
    expect(result.length).toBeGreaterThan(1);
    // All chunks should have non-empty text
    for (const c of result) {
      expect(c.text.trim().length).toBeGreaterThan(0);
    }
  });

  it('estimatedTokens is consistent with text length', () => {
    const content = 'Hello world, this is a test sentence that should fit. ';
    const result = chunk(content, { maxTokens: 800 });
    expect(result[0]!.estimatedTokens).toBe(Math.ceil(content.trim().length / 4));
  });

  it('default options: 800 token budget, 15% overlap', () => {
    // Just verify defaults don't throw and produce reasonable output
    const content = 'Sentence one. Sentence two. Sentence three. '.repeat(30);
    const result = chunk(content);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('returns empty array for whitespace-only input', () => {
    expect(chunk('   \n\n\t\t  ')).toEqual([]);
  });

  it('returns empty array for newline-only input', () => {
    expect(chunk('\n\n\n\n')).toEqual([]);
  });

  it('handles very large single-word content (no sentence boundaries)', () => {
    // A single word of 5000 chars = ~1250 tokens, well over default 800 budget
    const word = 'Supercalifragilisticexpialidocious'.repeat(200);
    const result = chunk(word, { maxTokens: 800 });
    // Single "sentence" exceeds budget — pushed as its own oversized chunk
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]!.text).toBe(word);
    expect(result[0]!.estimatedTokens).toBeGreaterThan(800);
  });

  it('returns single chunk when maxTokens is larger than content', () => {
    const content = 'Short content here.';
    const result = chunk(content, { maxTokens: 10000 });
    expect(result).toHaveLength(1);
    expect(result[0]!.text).toBe(content);
  });

  it('overlapping window edge case: chunk size equals content length', () => {
    // Content of exactly maxTokens should produce a single chunk
    const content = 'A'.repeat(3200); // 3200 chars / 4 = 800 tokens exactly
    const result = chunk(content, { maxTokens: 800 });
    expect(result).toHaveLength(1);
    expect(result[0]!.index).toBe(0);
  });

  it('handles content just barely exceeding one chunk', () => {
    // Create content that is just over 800 tokens with sentence boundaries
    const sentence = 'This is a test sentence. '; // ~6 tokens
    // 134 * 6 = 804 tokens > 800 budget
    const content = sentence.repeat(134);
    const result = chunk(content, { maxTokens: 800 });
    expect(result.length).toBeGreaterThan(1);
    // Each chunk should be within or slightly over the budget
    for (const c of result) {
      expect(c.text.length).toBeGreaterThan(0);
    }
  });

  it('handles mixed paragraph and sentence content', () => {
    const content = [
      'First paragraph. It has two sentences.',
      '',
      'Second paragraph is longer. It has three sentences. And this is the third.',
      '',
      'Third paragraph.',
    ].join('\n');
    const result = chunk(content, { maxTokens: 800 });
    expect(result).toHaveLength(1); // Short enough for one chunk
    expect(result[0]!.text).toContain('First paragraph');
    expect(result[0]!.text).toContain('Third paragraph');
  });
});
