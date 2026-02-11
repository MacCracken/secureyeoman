import { describe, it, expect } from 'vitest';
import { parseCommit, generateMarkdown, type ParsedCommit } from './generate-release-notes.js';

describe('parseCommit', () => {
  it('should parse a conventional commit', () => {
    const result = parseCommit('abc1234||John Doe||feat: add login page');
    expect(result).toEqual({
      type: 'feat',
      scope: undefined,
      description: 'add login page',
      hash: 'abc1234',
      author: 'John Doe',
    });
  });

  it('should parse commit with scope', () => {
    const result = parseCommit('def5678||Jane||fix(auth): handle token expiry');
    expect(result).toEqual({
      type: 'fix',
      scope: 'auth',
      description: 'handle token expiry',
      hash: 'def5678',
      author: 'Jane',
    });
  });

  it('should return null for non-conventional commits', () => {
    expect(parseCommit('abc1234||Author||random commit message')).toBeNull();
    expect(parseCommit('abc1234||Author||Update README')).toBeNull();
  });

  it('should handle breaking change marker', () => {
    const result = parseCommit('aaa1111||Dev||feat!: complete API overhaul');
    expect(result).not.toBeNull();
    expect(result!.description).toBe('complete API overhaul');
  });
});

describe('generateMarkdown', () => {
  it('should group commits by type', () => {
    const commits: ParsedCommit[] = [
      { type: 'feat', description: 'new feature', hash: 'abc1234', author: 'Dev' },
      { type: 'fix', description: 'bug fix', hash: 'def5678', author: 'Dev' },
      { type: 'feat', description: 'another feature', hash: 'ghi9012', author: 'Dev' },
    ];

    const md = generateMarkdown(commits, 'v1.0.0');
    expect(md).toContain('# Release v1.0.0');
    expect(md).toContain('## Features');
    expect(md).toContain('## Bug Fixes');
    expect(md).toContain('new feature');
    expect(md).toContain('another feature');
    expect(md).toContain('bug fix');
  });

  it('should include contributors', () => {
    const commits: ParsedCommit[] = [
      { type: 'feat', description: 'x', hash: 'a', author: 'Alice' },
      { type: 'feat', description: 'y', hash: 'b', author: 'Bob' },
      { type: 'feat', description: 'z', hash: 'c', author: 'Alice' },
    ];

    const md = generateMarkdown(commits);
    expect(md).toContain('## Contributors');
    expect(md).toContain('Alice');
    expect(md).toContain('Bob');
  });

  it('should handle missing tags gracefully', () => {
    const md = generateMarkdown([], undefined);
    expect(md).toContain('Unreleased Changes');
  });
});
