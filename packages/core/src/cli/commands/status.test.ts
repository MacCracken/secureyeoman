import { describe, it, expect, vi, afterEach } from 'vitest';
import { statusCommand } from './status.js';

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

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetchMultiple(responses: Record<string, object>) {
  return vi.fn().mockImplementation((url: string) => {
    const path = new URL(url).pathname;
    const data = responses[path] ?? {};
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => data,
      text: async () => JSON.stringify(data),
    });
  });
}

describe('status command — help', () => {
  it('shows help with --help flag', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await statusCommand.run({ argv: ['--help'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('--url');
    expect(getStdout()).toContain('--json');
  });
});

describe('status command — successful status', () => {
  it('displays human-readable status', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchMultiple({
        '/health': { status: 'ok', version: '1.0.0', uptime: 60000 },
        '/api/v1/soul/personality': { personality: { id: 'pers-1', name: 'Aria' } },
        '/api/v1/security/policy': { allowSubAgents: true },
        '/api/v1/agents/config': { allowedBySecurityPolicy: true },
      })
    );
    const { stdout, stderr, getStdout } = createStreams();
    const code = await statusCommand.run({ argv: [], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('1.0.0');
    expect(getStdout()).toContain('Aria');
  });

  it('outputs JSON with --json flag', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchMultiple({
        '/health': { status: 'ok', version: '1.0.0', uptime: 1000 },
        '/api/v1/soul/personality': { personality: null },
        '/api/v1/security/policy': { allowSubAgents: false },
        '/api/v1/agents/config': { allowedBySecurityPolicy: false },
      })
    );
    const { stdout, stderr, getStdout } = createStreams();
    const code = await statusCommand.run({ argv: ['--json'], stdout, stderr });
    expect(code).toBe(0);
    const body = JSON.parse(getStdout());
    expect(body.health.status).toBe('ok');
  });

  it('returns 1 when server status is not ok (json mode)', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchMultiple({
        '/health': { status: 'error', version: '1.0.0', uptime: 0 },
        '/api/v1/soul/personality': {},
        '/api/v1/security/policy': {},
        '/api/v1/agents/config': {},
      })
    );
    const { stdout, stderr } = createStreams();
    const code = await statusCommand.run({ argv: ['--json'], stdout, stderr });
    expect(code).toBe(1);
  });
});

describe('status command — unreachable server', () => {
  it('returns 1 when health endpoint not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        headers: { get: () => 'application/json' },
        json: async () => ({}),
        text: async () => '{}',
      })
    );
    const { stdout, stderr, getStderr } = createStreams();
    const code = await statusCommand.run({ argv: [], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Cannot reach server');
  });

  it('returns 1 when health call throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')));
    const { stdout, stderr, getStderr } = createStreams();
    const code = await statusCommand.run({ argv: [], stdout, stderr });
    expect(code).toBe(1);
    // health .catch(() => null) returns null → Cannot reach server
    expect(getStderr()).toContain('Cannot reach server');
  });
});

describe('status command — partial responses', () => {
  it('handles null personality gracefully', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchMultiple({
        '/health': { status: 'ok', version: '2.0.0', uptime: 5000 },
        '/api/v1/soul/personality': { personality: null },
        '/api/v1/security/policy': { allowSubAgents: false },
        '/api/v1/agents/config': { allowedBySecurityPolicy: false },
      })
    );
    const { stdout, stderr, getStdout } = createStreams();
    const code = await statusCommand.run({ argv: [], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('None');
  });
});
