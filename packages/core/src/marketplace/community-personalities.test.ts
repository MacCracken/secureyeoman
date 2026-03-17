import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readCommunityPersonalities, parseFrontmatter } from './community-personalities.js';

vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  access: vi.fn(),
}));

const { readdir, readFile, access } = await import('node:fs/promises');
const mockReaddir = vi.mocked(readdir);
const mockReadFile = vi.mocked(readFile);
const mockAccess = vi.mocked(access);

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
  // Default: no avatar files exist (access rejects)
  mockAccess.mockRejectedValue(new Error('ENOENT'));
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

  // ── Folderized format tests ──────────────────────────────────────────────

  it('reads folderized personality.md files', async () => {
    mockReaddir.mockResolvedValue(['sci-fi/antagonist/ares/personality.md'] as any);
    mockReadFile.mockResolvedValue(VALID_MD);
    mockAccess.mockRejectedValue(new Error('ENOENT')); // no avatar

    const result = await readCommunityPersonalities('/repo');

    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('Captain Cortex');
    expect(result[0]!.category).toBe('sci-fi/antagonist');
    expect(result[0]!.filename).toBe('sci-fi/antagonist/ares');
  });

  it('derives category correctly for folderized format', async () => {
    mockReaddir.mockResolvedValue([
      'sci-fi/antagonist/master-control/personality.md',
      'sci-fi/tactical/flynn-ghost/personality.md',
      'professional/code-reviewer/personality.md',
    ] as any);
    mockReadFile.mockResolvedValue(VALID_MD);
    mockAccess.mockRejectedValue(new Error('ENOENT'));

    const result = await readCommunityPersonalities('/repo');

    expect(result).toHaveLength(3);
    expect(result[0]!.category).toBe('sci-fi/antagonist');
    expect(result[1]!.category).toBe('sci-fi/tactical');
    expect(result[2]!.category).toBe('professional');
  });

  it('finds avatar.svg in folderized format', async () => {
    mockReaddir.mockResolvedValue(['sci-fi/antagonist/ares/personality.md'] as any);
    mockReadFile.mockResolvedValue(VALID_MD);
    mockAccess.mockImplementation(async (path: any) => {
      if (String(path).endsWith('avatar.svg')) return undefined;
      throw new Error('ENOENT');
    });

    const result = await readCommunityPersonalities('/repo');

    expect(result[0]!.avatarFile).toBe('sci-fi/antagonist/ares/avatar.svg');
  });

  it('handles mixed flat and folderized formats', async () => {
    mockReaddir.mockResolvedValue([
      'sci-fi/antagonist/old-villain.md',
      'sci-fi/antagonist/new-villain/personality.md',
    ] as any);
    mockReadFile.mockResolvedValue(VALID_MD);
    mockAccess.mockRejectedValue(new Error('ENOENT'));

    const result = await readCommunityPersonalities('/repo');

    expect(result).toHaveLength(2);
    // Flat format
    expect(result[0]!.category).toBe('sci-fi/antagonist');
    expect(result[0]!.filename).toBe('sci-fi/antagonist/old-villain.md');
    // Folderized format
    expect(result[1]!.category).toBe('sci-fi/antagonist');
    expect(result[1]!.filename).toBe('sci-fi/antagonist/new-villain');
  });

  it('folderized personality in root-level folder gets category other', async () => {
    mockReaddir.mockResolvedValue(['some-personality/personality.md'] as any);
    mockReadFile.mockResolvedValue(VALID_MD);
    mockAccess.mockRejectedValue(new Error('ENOENT'));

    const result = await readCommunityPersonalities('/repo');

    expect(result[0]!.category).toBe('other');
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
