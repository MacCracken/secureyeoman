/**
 * GroundingChecker — Unit Tests
 *
 * Phase 110 — Inline Citations & Grounding
 */

import { describe, it, expect } from 'vitest';
import { GroundingChecker, splitSentences, tokenOverlap } from './grounding-checker.js';
import type { SourceReference } from '@secureyeoman/shared';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSources(snippets: string[]): SourceReference[] {
  return snippets.map((content, i) => ({
    index: i + 1,
    type: 'knowledge' as const,
    sourceId: `src-${i}`,
    content,
    sourceLabel: `Source ${i + 1}`,
  }));
}

// ── splitSentences ───────────────────────────────────────────────────────────

describe('splitSentences', () => {
  it('splits on period, exclamation, question mark', () => {
    const result = splitSentences('Hello world. How are you? Great!');
    expect(result).toEqual(['Hello world.', 'How are you?', 'Great!']);
  });

  it('handles abbreviations without splitting', () => {
    const result = splitSentences('Dr. Smith went to the store. He bought milk.');
    expect(result).toHaveLength(2);
    expect(result[0]).toContain('Dr.');
  });

  it('handles decimal numbers without splitting', () => {
    const result = splitSentences('The price is 3.50 dollars. That is cheap.');
    expect(result).toHaveLength(2);
  });

  it('returns empty array for empty input', () => {
    expect(splitSentences('')).toEqual([]);
  });

  it('returns single sentence for text without terminators', () => {
    const result = splitSentences('No punctuation here');
    expect(result).toEqual(['No punctuation here']);
  });
});

// ── tokenOverlap ─────────────────────────────────────────────────────────────

describe('tokenOverlap', () => {
  it('returns 1.0 for identical strings', () => {
    expect(tokenOverlap('hello world', 'hello world')).toBeCloseTo(1.0);
  });

  it('returns 0.0 for completely different strings', () => {
    expect(tokenOverlap('hello world', 'foo bar baz')).toBeCloseTo(0.0);
  });

  it('returns partial overlap correctly', () => {
    const score = tokenOverlap('the cat sat on the mat', 'the cat is on the rug');
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it('is case insensitive', () => {
    expect(tokenOverlap('Hello World', 'hello world')).toBeCloseTo(1.0);
  });

  it('ignores punctuation', () => {
    expect(tokenOverlap('hello, world!', 'hello world')).toBeCloseTo(1.0);
  });

  it('returns 0 for empty strings', () => {
    expect(tokenOverlap('', 'hello')).toBeCloseTo(0.0);
    expect(tokenOverlap('hello', '')).toBeCloseTo(0.0);
  });
});

// ── GroundingChecker ─────────────────────────────────────────────────────────

describe('GroundingChecker', () => {
  const checker = new GroundingChecker();

  describe('mode: off', () => {
    it('returns score 1.0 and original content', () => {
      const result = checker.check('Some response text.', makeSources(['irrelevant']), 'off');
      expect(result.score).toBe(1.0);
      expect(result.content).toBe('Some response text.');
      expect(result.blocked).toBe(false);
    });
  });

  describe('mode: annotate_only', () => {
    it('marks ungrounded sentences with [unverified]', () => {
      const sources = makeSources(['The database uses PostgreSQL for storage and indexing.']);
      const content = 'The database uses PostgreSQL for storage. The weather is sunny today.';

      const result = checker.check(content, sources, 'annotate_only');
      expect(result.content).toContain('[unverified]');
      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThan(1);
      expect(result.blocked).toBe(false);
    });

    it('does not mark well-grounded sentences', () => {
      const sources = makeSources(['PostgreSQL is a relational database management system.']);
      const content = 'PostgreSQL is a relational database management system.';

      const result = checker.check(content, sources, 'annotate_only');
      expect(result.content).not.toContain('[unverified]');
      expect(result.score).toBe(1.0);
    });
  });

  describe('mode: block_unverified', () => {
    it('blocks when score is below threshold', () => {
      const sources = makeSources(['something completely unrelated']);
      const content =
        'The weather forecast shows rain tomorrow. ' +
        'Traffic will be heavy on the highway. ' +
        'Stock markets are expected to rise. ' +
        'New restaurant opens downtown.';

      const result = checker.check(content, sources, 'block_unverified');
      expect(result.blocked).toBe(true);
      expect(result.score).toBeLessThan(0.3);
    });

    it('does not block when score is above threshold', () => {
      const sources = makeSources([
        'The system uses PostgreSQL with full-text search and vector indexing for hybrid retrieval.',
      ]);
      const content =
        'The system uses PostgreSQL. It supports full-text search and vector indexing.';

      const result = checker.check(content, sources, 'block_unverified');
      expect(result.blocked).toBe(false);
    });
  });

  describe('mode: strip_unverified', () => {
    it('removes ungrounded sentences', () => {
      const sources = makeSources([
        'The brain module stores memories and knowledge entries in PostgreSQL.',
      ]);
      const content =
        'The brain module stores memories in PostgreSQL. Random unrelated claim about aliens.';

      const result = checker.check(content, sources, 'strip_unverified');
      // The grounded sentence should remain
      expect(result.content).toContain('brain');
      expect(result.content).toContain('PostgreSQL');
      expect(result.blocked).toBe(false);
    });

    it('falls back to original content if everything would be stripped', () => {
      const sources = makeSources(['xyz abc 123']);
      const content = 'Completely unrelated response about different topics entirely.';

      const result = checker.check(content, sources, 'strip_unverified');
      // Should not return empty — falls back to original
      expect(result.content.length).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('handles empty content', () => {
      const result = checker.check('', makeSources(['source']), 'annotate_only');
      expect(result.score).toBe(1.0);
      expect(result.content).toBe('');
    });

    it('handles empty sources', () => {
      const result = checker.check('Some text.', [], 'annotate_only');
      expect(result.score).toBe(1.0);
    });

    it('skips short sentences (< 4 words)', () => {
      const sources = makeSources(['something unrelated']);
      const content = 'Yes. The system uses advanced retrieval.';
      const result = checker.check(content, sources, 'annotate_only');
      // "Yes." should not be marked as unverified (too short)
      expect(result.content).not.toMatch(/^Yes\.\s*\[unverified\]/);
    });

    it('computes groundedSentences and totalSentences correctly', () => {
      const sources = makeSources(['PostgreSQL is used for data storage in the system.']);
      const content = 'PostgreSQL is used for data storage. Aliens live on Mars.';

      const result = checker.check(content, sources, 'annotate_only');
      expect(result.totalSentences).toBe(2);
      expect(result.groundedSentences).toBeGreaterThanOrEqual(1);
    });
  });
});
