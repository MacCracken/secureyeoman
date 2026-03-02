/**
 * License CLI command tests — Phase 94 coverage.
 *
 * Covers: --help, status (human + JSON), set (success + error + missing key),
 * unknown subcommand, API failure paths.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { licenseCommand } from './license.js';

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

const LICENSE_STATUS = {
  tier: 'enterprise',
  valid: true,
  organization: 'Acme Corp',
  seats: 50,
  licenseId: 'lic-123',
  features: ['sso_saml', 'multi_tenancy'],
  expiresAt: '2027-01-01T00:00:00Z',
};

describe('license command', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── help ──────────────────────────────────────────────────────

  it('prints help with --help', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await licenseCommand.run({ argv: ['--help'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('status');
    expect(getStdout()).toContain('set');
    expect(getStdout()).toContain('SECUREYEOMAN_LICENSE_KEY');
  });

  it('prints help with -h', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await licenseCommand.run({ argv: ['-h'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('status');
  });

  // ── status ────────────────────────────────────────────────────

  it('status shows license info in human-readable format', async () => {
    mockFetch(LICENSE_STATUS);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await licenseCommand.run({ argv: ['status'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Enterprise');
    expect(getStdout()).toContain('Acme Corp');
    expect(getStdout()).toContain('50');
    expect(getStdout()).toContain('sso_saml');
    expect(getStdout()).toContain('multi_tenancy');
    expect(getStdout()).toContain('2027-01-01');
  });

  it('status defaults when no subcommand provided', async () => {
    mockFetch(LICENSE_STATUS);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await licenseCommand.run({ argv: [], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('License');
  });

  it('status --json outputs raw JSON', async () => {
    mockFetch(LICENSE_STATUS);
    const { stdout, stderr, getStdout } = createStreams();
    const code = await licenseCommand.run({ argv: ['--json', 'status'], stdout, stderr });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout());
    expect(parsed.tier).toBe('enterprise');
    expect(parsed.features).toContain('sso_saml');
  });

  it('status returns 1 when API fails', async () => {
    mockFetch({ error: 'Unauthorized' }, 401);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await licenseCommand.run({ argv: ['status'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Failed to fetch license status');
  });

  it('status returns 1 when fetch throws (connection error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection refused')));
    const { stdout, stderr, getStderr } = createStreams();
    const code = await licenseCommand.run({ argv: ['status'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Connection refused');
  });

  it('status shows community tier with no features', async () => {
    mockFetch({
      tier: 'community',
      valid: false,
      organization: null,
      seats: null,
      licenseId: null,
      features: [],
      expiresAt: null,
    });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await licenseCommand.run({ argv: ['status'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Community');
  });

  it('status shows error field when present', async () => {
    mockFetch({
      tier: 'community',
      valid: false,
      error: 'License key has expired',
      features: [],
    });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await licenseCommand.run({ argv: ['status'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('License key has expired');
  });

  // ── set ───────────────────────────────────────────────────────

  it('set uploads key and shows success', async () => {
    mockFetch({ tier: 'enterprise', organization: 'Acme Corp' });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await licenseCommand.run({
      argv: ['set', 'abc123.payload.sig'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('License key accepted');
    expect(getStdout()).toContain('enterprise');
  });

  it('set --json outputs raw JSON on success', async () => {
    mockFetch({ tier: 'enterprise', organization: 'Acme Corp' });
    const { stdout, stderr, getStdout } = createStreams();
    const code = await licenseCommand.run({
      argv: ['--json', 'set', 'abc123.payload.sig'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout());
    expect(parsed.tier).toBe('enterprise');
  });

  it('set returns 1 when no key argument provided', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await licenseCommand.run({ argv: ['set'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  it('set returns 1 when API rejects the key', async () => {
    mockFetch({ error: 'Invalid license key format' }, 400);
    const { stdout, stderr, getStderr } = createStreams();
    const code = await licenseCommand.run({
      argv: ['set', 'bad-key'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Invalid license key format');
  });

  it('set returns 1 when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    const { stdout, stderr, getStderr } = createStreams();
    const code = await licenseCommand.run({
      argv: ['set', 'some-key'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Network error');
  });

  // ── unknown subcommand ────────────────────────────────────────

  it('unknown subcommand returns 1 with usage', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await licenseCommand.run({ argv: ['upgrade'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Unknown subcommand');
  });

  // ── metadata ──────────────────────────────────────────────────

  it('has aliases including "lic"', () => {
    expect(licenseCommand.aliases).toContain('lic');
  });

  it('has name "license"', () => {
    expect(licenseCommand.name).toBe('license');
  });

  // ── custom URL and token ──────────────────────────────────────

  it('status respects --url flag', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => LICENSE_STATUS,
    });
    vi.stubGlobal('fetch', fetchSpy);
    const { stdout, stderr } = createStreams();
    await licenseCommand.run({
      argv: ['--url', 'https://custom:8080', 'status'],
      stdout,
      stderr,
    });
    const calledUrl = fetchSpy.mock.calls[0]![0] as string;
    expect(calledUrl).toContain('https://custom:8080');
  });
});
