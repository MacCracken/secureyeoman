import { describe, it, expect } from 'vitest';
import { computeUnifiedDiff } from './diff-utils.js';

describe('computeUnifiedDiff', () => {
  it('returns empty string for identical inputs', () => {
    const text = 'line1\nline2\nline3';
    expect(computeUnifiedDiff(text, text)).toBe('');
  });

  it('shows added lines with + prefix', () => {
    const a = 'line1\nline2';
    const b = 'line1\nline2\nline3';
    const diff = computeUnifiedDiff(a, b, 'old', 'new');
    expect(diff).toContain('--- old');
    expect(diff).toContain('+++ new');
    expect(diff).toContain('+line3');
  });

  it('shows removed lines with - prefix', () => {
    const a = 'line1\nline2\nline3';
    const b = 'line1\nline2';
    const diff = computeUnifiedDiff(a, b);
    expect(diff).toContain('-line3');
  });

  it('handles mixed changes in unified format', () => {
    const a = 'alpha\nbeta\ngamma';
    const b = 'alpha\ndelta\ngamma';
    const diff = computeUnifiedDiff(a, b);
    expect(diff).toContain('-beta');
    expect(diff).toContain('+delta');
    expect(diff).toContain(' alpha');
    expect(diff).toContain(' gamma');
  });

  it('handles empty inputs', () => {
    expect(computeUnifiedDiff('', '')).toBe('');
    const diff = computeUnifiedDiff('', 'new content');
    expect(diff).toContain('+new content');
  });
});
