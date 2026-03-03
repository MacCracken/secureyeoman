/**
 * Strategy CLI Command — unit tests.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { strategyCommand } from './strategy.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function createStreams() {
  let stdoutBuf = '';
  let stderrBuf = '';
  const stdout = {
    write: (s: string) => {
      stdoutBuf += s;
      return true;
    },
  } as NodeJS.WriteStream;
  const stderr = {
    write: (s: string) => {
      stderrBuf += s;
      return true;
    },
  } as NodeJS.WriteStream;
  return { stdout, stderr, getStdout: () => stdoutBuf, getStderr: () => stderrBuf };
}

function mockFetch(responses: Array<{ ok: boolean; status: number; data: unknown }>) {
  let call = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async () => {
      const r = responses[call] ?? responses[responses.length - 1]!;
      call++;
      return {
        ok: r.ok,
        status: r.status,
        headers: { get: () => 'application/json' },
        json: async () => r.data,
        text: async () => JSON.stringify(r.data),
      };
    })
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

const STRATEGY_LIST = {
  items: [
    {
      id: 's-1',
      name: 'Chain of Thought',
      slug: 'chain-of-thought',
      category: 'chain_of_thought',
      isBuiltin: true,
    },
    { id: 's-2', name: 'Reflexion', slug: 'reflexion', category: 'reflexion', isBuiltin: true },
    { id: 's-3', name: 'My Custom', slug: 'my-custom', category: 'standard', isBuiltin: false },
  ],
  total: 3,
};

const STRATEGY_DETAIL = {
  id: 's-1',
  name: 'Chain of Thought',
  slug: 'chain-of-thought',
  description: 'Step by step reasoning',
  promptPrefix: 'Think step by step.',
  category: 'chain_of_thought',
  isBuiltin: true,
};

// ── Help ─────────────────────────────────────────────────────────────────────

describe('strategy help', () => {
  it('shows help with --help', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await strategyCommand.run({ argv: ['--help'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Usage:');
  });

  it('shows help with no args', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await strategyCommand.run({ argv: [], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Usage:');
  });
});

// ── list ─────────────────────────────────────────────────────────────────────

describe('strategy list', () => {
  it('lists strategies as table', async () => {
    mockFetch([{ ok: true, status: 200, data: STRATEGY_LIST }]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await strategyCommand.run({ argv: ['list'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('chain-of-thought');
    expect(getStdout()).toContain('Chain of Thought');
  });

  it('lists strategies as JSON', async () => {
    mockFetch([{ ok: true, status: 200, data: STRATEGY_LIST }]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await strategyCommand.run({ argv: ['list', '--json'], stdout, stderr });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout());
    expect(parsed.items).toHaveLength(3);
  });

  it('handles empty list', async () => {
    mockFetch([{ ok: true, status: 200, data: { items: [], total: 0 } }]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await strategyCommand.run({ argv: ['list'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('No strategies found');
  });

  it('handles server error', async () => {
    mockFetch([{ ok: false, status: 500, data: { error: 'Internal' } }]);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await strategyCommand.run({ argv: ['list'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Error');
  });
});

// ── show ─────────────────────────────────────────────────────────────────────

describe('strategy show', () => {
  it('shows strategy details', async () => {
    mockFetch([{ ok: true, status: 200, data: STRATEGY_DETAIL }]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await strategyCommand.run({ argv: ['show', 'chain-of-thought'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Chain of Thought');
    expect(getStdout()).toContain('Think step by step');
  });

  it('requires slug argument', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await strategyCommand.run({ argv: ['show'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('slug is required');
  });
});

// ── create ───────────────────────────────────────────────────────────────────

describe('strategy create', () => {
  it('creates a strategy', async () => {
    mockFetch([{ ok: true, status: 201, data: { id: 's-new', slug: 'new-strat' } }]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await strategyCommand.run({
      argv: [
        'create',
        '--name',
        'New Strat',
        '--slug',
        'new-strat',
        '--category',
        'reflexion',
        '--prompt-prefix',
        'Reflect on this.',
      ],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('new-strat');
  });

  it('requires all flags', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await strategyCommand.run({
      argv: ['create', '--name', 'Only Name'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('required');
  });
});

// ── delete ───────────────────────────────────────────────────────────────────

describe('strategy delete', () => {
  it('deletes a strategy', async () => {
    mockFetch([{ ok: true, status: 204, data: {} }]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await strategyCommand.run({ argv: ['delete', 's-3'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('deleted');
  });

  it('requires strategy ID', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await strategyCommand.run({ argv: ['delete'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('ID is required');
  });
});

// ── unknown subcommand ───────────────────────────────────────────────────────

describe('unknown subcommand', () => {
  it('returns error for unknown subcommand', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await strategyCommand.run({ argv: ['unknown'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Unknown subcommand');
  });
});
