import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  aliasCommand,
  loadAliases,
  _saveAliases,
  resolveAlias,
  getAliasesPath,
  type _AliasMap,
} from './alias.js';
import type { CommandContext } from '../router.js';

// ── Mock fs ─────────────────────────────────────────────────────────
const mockStore: Record<string, string> = {};

vi.mock('node:fs', () => ({
  readFileSync: vi.fn((path: string) => {
    if (mockStore[path]) return mockStore[path];
    throw new Error('ENOENT');
  }),
  writeFileSync: vi.fn((path: string, content: string) => {
    mockStore[path] = content;
  }),
  existsSync: vi.fn((path: string) => path in mockStore || path.endsWith('secureyeoman')),
  mkdirSync: vi.fn(),
}));

// ── Helpers ─────────────────────────────────────────────────────────

function makeCtx(argv: string[] = []): CommandContext & { outLines: string[]; errLines: string[] } {
  const outLines: string[] = [];
  const errLines: string[] = [];
  return {
    argv,
    stdout: {
      write: (s: string) => {
        outLines.push(s);
        return true;
      },
    } as any,
    stderr: {
      write: (s: string) => {
        errLines.push(s);
        return true;
      },
    } as any,
    outLines,
    errLines,
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('aliasCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear the mock store
    Object.keys(mockStore).forEach((k) => delete mockStore[k]);
  });

  it('shows help with --help', async () => {
    const ctx = makeCtx(['--help']);
    const code = await aliasCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.outLines.join('')).toContain('Usage: secureyeoman alias');
  });

  it('shows help with no args', async () => {
    const ctx = makeCtx([]);
    const code = await aliasCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.outLines.join('')).toContain('Usage: secureyeoman alias');
  });

  it('creates an alias', async () => {
    const ctx = makeCtx(['create', 'wisdom', 'chat', '-p', 'friday', '--strategy', 'cot']);
    const code = await aliasCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.outLines.join('')).toContain('Created alias');
    expect(ctx.outLines.join('')).toContain('wisdom');
  });

  it('rejects reserved command names as aliases', async () => {
    const ctx = makeCtx(['create', 'help', 'chat -p friday']);
    const code = await aliasCommand.run(ctx);
    expect(code).toBe(1);
    expect(ctx.errLines.join('')).toContain('reserved command name');
  });

  it('rejects missing alias name on create', async () => {
    const ctx = makeCtx(['create']);
    const code = await aliasCommand.run(ctx);
    expect(code).toBe(1);
    expect(ctx.errLines.join('')).toContain('Missing alias name');
  });

  it('rejects missing expansion on create', async () => {
    const ctx = makeCtx(['create', 'myalias']);
    const code = await aliasCommand.run(ctx);
    expect(code).toBe(1);
    expect(ctx.errLines.join('')).toContain('Missing command expansion');
  });

  it('lists aliases', async () => {
    // Pre-populate a file
    const { writeFileSync } = await import('node:fs');
    const _path = (await import('./alias.js')).getAliasesPath();
    vi.mocked(writeFileSync).mockImplementation((p: any, content: any) => {
      mockStore[p as string] = content as string;
    });

    // Create an alias first
    const createCtx = makeCtx(['create', 'test1', 'chat', '-p', 'friday']);
    await aliasCommand.run(createCtx);

    const ctx = makeCtx(['list']);
    const code = await aliasCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.outLines.join('')).toContain('test1');
  });

  it('shows empty message when no aliases defined', async () => {
    const ctx = makeCtx(['list']);
    const code = await aliasCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.outLines.join('')).toContain('No aliases defined');
  });

  it('deletes an alias', async () => {
    // Create first
    const createCtx = makeCtx(['create', 'todelete', 'chat', '-p', 'friday']);
    await aliasCommand.run(createCtx);

    const ctx = makeCtx(['delete', 'todelete']);
    const code = await aliasCommand.run(ctx);
    expect(code).toBe(0);
    expect(ctx.outLines.join('')).toContain('Deleted alias');
  });

  it('returns error when deleting non-existent alias', async () => {
    const ctx = makeCtx(['delete', 'nonexistent']);
    const code = await aliasCommand.run(ctx);
    expect(code).toBe(1);
    expect(ctx.errLines.join('')).toContain('not found');
  });

  it('rejects unknown action', async () => {
    const ctx = makeCtx(['bogus']);
    const code = await aliasCommand.run(ctx);
    expect(code).toBe(1);
    expect(ctx.errLines.join('')).toContain('Unknown action');
  });
});

describe('resolveAlias', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockStore).forEach((k) => delete mockStore[k]);
  });

  it('returns null for unknown alias', () => {
    const result = resolveAlias('nonexistent');
    expect(result).toBeNull();
  });

  it('resolves a known alias to tokens', async () => {
    const aliasesPath = getAliasesPath();
    mockStore[aliasesPath] = JSON.stringify({ wisdom: 'chat -p friday --strategy cot' });

    const result = resolveAlias('wisdom');
    expect(result).toEqual(['chat', '-p', 'friday', '--strategy', 'cot']);
  });
});

describe('loadAliases / saveAliases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockStore).forEach((k) => delete mockStore[k]);
  });

  it('returns empty object when file does not exist', () => {
    const result = loadAliases('/tmp/nonexistent.json');
    expect(result).toEqual({});
  });

  it('returns empty object on malformed JSON', () => {
    mockStore['/tmp/bad.json'] = '{invalid';
    const result = loadAliases('/tmp/bad.json');
    expect(result).toEqual({});
  });
});
