/**
 * Provider CLI command tests.
 *
 * Covers: --help, list (human + JSON + empty + failure), add (success + missing args + JSON),
 * validate (success + missing id), set-default (success + missing id),
 * costs (human + empty + JSON), rotate (success + missing id + missing key),
 * missing subcommand, unknown subcommand.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { providerCommand } from './provider.js';

function createStreams() {
  let stdoutBuf = '';
  let stderrBuf = '';
  const stdout = {
    write: (s: string) => {
      stdoutBuf += s;
      return true;
    },
  } as NodeJS.WritableStream;
  const stderr = {
    write: (s: string) => {
      stderrBuf += s;
      return true;
    },
  } as NodeJS.WritableStream;
  return { stdout, stderr, getStdout: () => stdoutBuf, getStderr: () => stderrBuf };
}

function mockFetch(data: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => 'application/json' },
      json: async () => data,
    })
  );
}

const ACCOUNTS = [
  { id: 'acc-1', provider: 'anthropic', label: 'My Key', status: 'active', isDefault: true },
  { id: 'acc-2', provider: 'openai', label: 'GPT Key', status: 'active', isDefault: false },
];

const COSTS = [
  {
    accountId: 'acc-1',
    provider: 'anthropic',
    label: 'My Key',
    totalCostUsd: 1.5,
    totalInputTokens: 1000,
    totalOutputTokens: 500,
    totalRequests: 10,
  },
];

describe('provider command', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -- help ----------------------------------------------------------------

  it('prints help with --help', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await providerCommand.run({ argv: ['--help'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('list');
    expect(getStdout()).toContain('add');
    expect(getStdout()).toContain('validate');
    expect(getStdout()).toContain('set-default');
    expect(getStdout()).toContain('costs');
    expect(getStdout()).toContain('rotate');
  });

  it('prints help with -h', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await providerCommand.run({ argv: ['-h'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('list');
  });

  // -- missing / unknown subcommand ----------------------------------------

  it('errors on missing subcommand', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await providerCommand.run({ argv: [], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Missing subcommand');
  });

  it('errors on unknown subcommand', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await providerCommand.run({ argv: ['nope'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Unknown subcommand');
  });

  // -- list ----------------------------------------------------------------

  it('list shows accounts in human-readable format', async () => {
    mockFetch(ACCOUNTS);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await providerCommand.run({ argv: ['list'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('My Key');
    expect(getStdout()).toContain('GPT Key');
    expect(getStdout()).toContain('anthropic');
    expect(getStdout()).toContain('openai');
    expect(getStdout()).toContain('acc-1');
    expect(getStdout()).toContain('DEFAULT');
  });

  it('list returns 0 with --json', async () => {
    mockFetch(ACCOUNTS);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await providerCommand.run({ argv: ['--json', 'list'], stdout, stderr });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout());
    expect(parsed).toHaveLength(2);
    expect(parsed[0].provider).toBe('anthropic');
    expect(parsed[1].provider).toBe('openai');
  });

  it('list shows "No provider accounts" when empty', async () => {
    mockFetch([]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await providerCommand.run({ argv: ['list'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('No provider accounts');
  });

  it('list handles API failure', async () => {
    mockFetch({ error: 'Unauthorized' }, 401);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await providerCommand.run({ argv: ['list'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Failed to list provider accounts');
  });

  // -- add -----------------------------------------------------------------

  it('add creates account successfully', async () => {
    mockFetch({ id: 'acc-new', label: 'New Key', provider: 'anthropic' });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await providerCommand.run({
      argv: ['add', 'anthropic', '--label', 'New Key', '--key', 'sk-test-123'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Account created');
    expect(getStdout()).toContain('acc-new');
    expect(getStdout()).toContain('New Key');
  });

  it('add errors when --label or --key missing', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await providerCommand.run({
      argv: ['add', 'anthropic', '--label', 'My Label'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('--label and --key are required');
  });

  it('add errors when provider missing', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await providerCommand.run({
      argv: ['add'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  it('add --json outputs raw JSON on success', async () => {
    mockFetch({ id: 'acc-new', label: 'New Key', provider: 'anthropic' });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await providerCommand.run({
      argv: ['--json', 'add', 'anthropic', '--label', 'New Key', '--key', 'sk-test-123'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout());
    expect(parsed.id).toBe('acc-new');
    expect(parsed.provider).toBe('anthropic');
  });

  // -- validate ------------------------------------------------------------

  it('validate validates account successfully', async () => {
    mockFetch({ id: 'acc-1', status: 'active' });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await providerCommand.run({
      argv: ['validate', 'acc-1'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('acc-1');
    expect(getStdout()).toContain('active');
  });

  it('validate errors when id missing', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await providerCommand.run({
      argv: ['validate'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  // -- set-default ---------------------------------------------------------

  it('set-default sets default successfully', async () => {
    mockFetch({ id: 'acc-1', label: 'My Key', provider: 'anthropic' });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await providerCommand.run({
      argv: ['set-default', 'acc-1'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Default set');
    expect(getStdout()).toContain('My Key');
    expect(getStdout()).toContain('anthropic');
  });

  it('set-default errors when id missing', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await providerCommand.run({
      argv: ['set-default'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  // -- costs ---------------------------------------------------------------

  it('costs shows cost table', async () => {
    mockFetch(COSTS);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await providerCommand.run({ argv: ['costs'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Provider Account Costs');
    expect(getStdout()).toContain('anthropic');
    expect(getStdout()).toContain('My Key');
    expect(getStdout()).toContain('1.5000');
    expect(getStdout()).toContain('10');
  });

  it('costs shows "No cost data" when empty', async () => {
    mockFetch([]);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await providerCommand.run({ argv: ['costs'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('No cost data');
  });

  it('costs --json outputs raw JSON', async () => {
    mockFetch(COSTS);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await providerCommand.run({ argv: ['--json', 'costs'], stdout, stderr });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout());
    expect(parsed).toHaveLength(1);
    expect(parsed[0].totalCostUsd).toBe(1.5);
    expect(parsed[0].totalRequests).toBe(10);
  });

  // -- rotate --------------------------------------------------------------

  it('rotate rotates key successfully', async () => {
    mockFetch({ id: 'acc-1', label: 'My Key', status: 'active' });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await providerCommand.run({
      argv: ['rotate', 'acc-1', '--key', 'sk-new-key-456'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Key rotated');
    expect(getStdout()).toContain('My Key');
    expect(getStdout()).toContain('active');
  });

  it('rotate errors when id missing', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await providerCommand.run({
      argv: ['rotate'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  it('rotate errors when --key missing', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await providerCommand.run({
      argv: ['rotate', 'acc-1'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('--key');
  });
});
