import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readCommunityPersonalities, parseFrontmatter } from './community-personalities.js';

vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
}));

const { readdir, readFile } = await import('node:fs/promises');
const mockReaddir = vi.mocked(readdir);
const mockReadFile = vi.mocked(readFile);

const VALID_MD = `---
name: "Captain Cortex"
description: "A bold sci-fi commander"
author: "JaneDoe"
version: "2026.3.1"
traits: [leadership, tactics, humor]
sex: "male"
---

# Identity & Purpose
You are Captain Cortex, a bold sci-fi commander.

# Traits
- **leadership**: commanding
- **tactics**: strategic
- **humor**: dry
`;

const MINIMAL_MD = `---
name: "Simple Bot"
---

Just a simple personality.
`;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('readCommunityPersonalities', () => {
  it('reads .md files from the personalities directory', async () => {
    mockReaddir.mockResolvedValue(['test.md'] as any);
    mockReadFile.mockResolvedValue(VALID_MD);

    const result = await readCommunityPersonalities('/repo');

    expect(mockReaddir).toHaveBeenCalledWith('/repo/personalities', { recursive: true });
    expect(mockReadFile).toHaveBeenCalledWith('/repo/personalities/test.md', 'utf-8');
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('Captain Cortex');
    expect(result[0]!.description).toBe('A bold sci-fi commander');
    expect(result[0]!.author).toBe('JaneDoe');
    expect(result[0]!.version).toBe('2026.3.1');
    expect(result[0]!.sex).toBe('male');
    expect(result[0]!.filename).toBe('test.md');
  });

  it('derives category from directory path', async () => {
    mockReaddir.mockResolvedValue([
      'sci-fi/antagonist/villain.md',
      'professional/analyst.md',
      'root-level.md',
    ] as any);
    mockReadFile.mockResolvedValue(VALID_MD);

    const result = await readCommunityPersonalities('/repo');

    expect(result).toHaveLength(3);
    expect(result[0]!.category).toBe('sci-fi/antagonist');
    expect(result[1]!.category).toBe('professional');
    expect(result[2]!.category).toBe('other');
  });

  it('parses YAML frontmatter correctly', async () => {
    mockReaddir.mockResolvedValue(['test.md'] as any);
    mockReadFile.mockResolvedValue(VALID_MD);

    const result = await readCommunityPersonalities('/repo');
    const p = result[0]!;

    expect(p.traits).toEqual({
      leadership: 'commanding',
      tactics: 'strategic',
      humor: 'dry',
    });
  });

  it('handles minimal frontmatter', async () => {
    mockReaddir.mockResolvedValue(['simple.md'] as any);
    mockReadFile.mockResolvedValue(MINIMAL_MD);

    const result = await readCommunityPersonalities('/repo');

    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('Simple Bot');
    expect(result[0]!.description).toBe('');
    expect(result[0]!.author).toBe('');
    expect(result[0]!.traits).toEqual({});
  });

  it('gracefully handles malformed files', async () => {
    mockReaddir.mockResolvedValue(['good.md', 'bad.md', 'nofm.md'] as any);
    mockReadFile.mockImplementation(async (path: any) => {
      if (String(path).includes('good')) return VALID_MD;
      if (String(path).includes('bad')) throw new Error('read error');
      return 'no frontmatter here';
    });

    const result = await readCommunityPersonalities('/repo');

    // Only the good file should be returned; bad throws, nofm has no frontmatter
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('Captain Cortex');
  });

  it('returns empty array for empty directory', async () => {
    mockReaddir.mockResolvedValue([] as any);

    const result = await readCommunityPersonalities('/repo');

    expect(result).toEqual([]);
  });

  it('returns empty array when directory does not exist', async () => {
    mockReaddir.mockRejectedValue(new Error('ENOENT'));

    const result = await readCommunityPersonalities('/nonexistent');

    expect(result).toEqual([]);
  });

  it('skips non-.md files', async () => {
    mockReaddir.mockResolvedValue(['test.md', 'readme.txt', 'image.png'] as any);
    mockReadFile.mockResolvedValue(VALID_MD);

    const result = await readCommunityPersonalities('/repo');

    expect(result).toHaveLength(1);
    expect(mockReadFile).toHaveBeenCalledTimes(1);
  });

  it('normalizes backslash paths to forward slashes', async () => {
    mockReaddir.mockResolvedValue(['sci-fi\\antagonist\\villain.md'] as any);
    mockReadFile.mockResolvedValue(VALID_MD);

    const result = await readCommunityPersonalities('/repo');

    expect(result[0]!.category).toBe('sci-fi/antagonist');
    expect(result[0]!.filename).toBe('sci-fi/antagonist/villain.md');
  });
});

describe('parseFrontmatter', () => {
  it('parses quoted string values', () => {
    const fm = parseFrontmatter('---\nname: "Hello World"\n---\n');
    expect(fm).toEqual({ name: 'Hello World' });
  });

  it('parses unquoted string values', () => {
    const fm = parseFrontmatter('---\nauthor: JaneDoe\n---\n');
    expect(fm).toEqual({ author: 'JaneDoe' });
  });

  it('parses inline arrays', () => {
    const fm = parseFrontmatter('---\ntraits: [a, b, c]\n---\n');
    expect(fm).toEqual({ traits: ['a', 'b', 'c'] });
  });

  it('parses booleans and numbers', () => {
    const fm = parseFrontmatter('---\nenabled: true\ncount: 42\n---\n');
    expect(fm).toEqual({ enabled: true, count: 42 });
  });

  it('returns null for missing frontmatter', () => {
    expect(parseFrontmatter('no frontmatter')).toBeNull();
  });

  it('returns null for empty frontmatter', () => {
    expect(parseFrontmatter('---\n\n---\n')).toBeNull();
  });
});
