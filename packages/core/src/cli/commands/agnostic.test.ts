import { describe, it, expect, vi, afterEach } from 'vitest';
import { agnosticCommand } from './agnostic.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}));

async function getExecFileMock() {
  const mod = await import('node:child_process');
  return vi.mocked(mod.execFile);
}

async function getFsMock() {
  const mod = await import('node:fs');
  return vi.mocked(mod.existsSync);
}

function makeComposeSuccess(stdout = '') {
  return (
    _cmd: string,
    _args: string[],
    _opts: unknown,
    cb: (err: null, stdout: string, stderr: string) => void
  ) => cb(null, stdout, '');
}

function makeComposeFailure(code = 1, stderr = 'error') {
  return (
    _cmd: string,
    _args: string[],
    _opts: unknown,
    cb: (err: Error & { code: number }, stdout: string, stderr: string) => void
  ) => {
    const err = Object.assign(new Error(stderr), { code });
    cb(err as Error & { code: number }, '', stderr);
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('agnostic command', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('help', () => {
    it('prints help with no arguments', async () => {
      const { stdout, stderr, getStdout } = createStreams();
      const code = await agnosticCommand.run({ argv: [], stdout, stderr });
      expect(code).toBe(0);
      expect(getStdout()).toContain('start');
      expect(getStdout()).toContain('stop');
      expect(getStdout()).toContain('status');
      expect(getStdout()).toContain('logs');
      expect(getStdout()).toContain('pull');
    });

    it('prints help with --help', async () => {
      const { stdout, stderr, getStdout } = createStreams();
      const code = await agnosticCommand.run({ argv: ['--help'], stdout, stderr });
      expect(code).toBe(0);
      expect(getStdout()).toContain('AGNOSTIC_PATH');
      expect(getStdout()).toContain('MCP_EXPOSE_AGNOSTIC_TOOLS');
    });

    it('prints help with -h', async () => {
      const { stdout, stderr, getStdout } = createStreams();
      const code = await agnosticCommand.run({ argv: ['-h'], stdout, stderr });
      expect(code).toBe(0);
      expect(getStdout()).toContain('start');
    });
  });

  describe('path resolution', () => {
    it('returns 1 when agnostic directory cannot be found', async () => {
      const fs = await getFsMock();
      fs.mockReturnValue(false);

      const { stdout, stderr, getStderr } = createStreams();
      const code = await agnosticCommand.run({ argv: ['start'], stdout, stderr });
      expect(code).toBe(1);
      expect(getStderr()).toContain('Cannot find the Agnostic project directory');
    });

    it('uses --path flag when provided', async () => {
      const fs = await getFsMock();
      // Only the --path candidate should be checked first
      fs.mockImplementation(
        (p: string) => p.endsWith('docker-compose.yml') && p.includes('/custom/agnostic/')
      );

      const execFile = await getExecFileMock();
      execFile.mockImplementation(makeComposeSuccess('Network qa-network Created'));

      const { stdout, stderr, getStdout } = createStreams();
      const code = await agnosticCommand.run({
        argv: ['start', '--path', '/custom/agnostic'],
        stdout,
        stderr,
      });
      expect(code).toBe(0);
      expect(getStdout()).toContain('started');
    });
  });

  describe('start', () => {
    it('runs docker compose up -d and prints config snippet', async () => {
      const fs = await getFsMock();
      fs.mockImplementation((p: string) => p.endsWith('docker-compose.yml'));

      const execFile = await getExecFileMock();
      execFile.mockImplementation(makeComposeSuccess('Started'));

      const { stdout, stderr, getStdout, getStderr } = createStreams();
      const code = await agnosticCommand.run({ argv: ['start'], stdout, stderr });
      expect(code).toBe(0);
      expect(getStdout()).toContain('MCP_EXPOSE_AGNOSTIC_TOOLS=true');
      expect(getStdout()).toContain('AGNOSTIC_URL=http://127.0.0.1:8000');
      expect(getStderr()).toBe('');
    });

    it('returns 1 when compose fails', async () => {
      const fs = await getFsMock();
      fs.mockImplementation((p: string) => p.endsWith('docker-compose.yml'));

      const execFile = await getExecFileMock();
      execFile.mockImplementation(makeComposeFailure(1, 'Cannot connect to Docker'));

      const { stdout, stderr, getStderr } = createStreams();
      const code = await agnosticCommand.run({ argv: ['start'], stdout, stderr });
      expect(code).toBe(1);
      expect(getStderr()).toContain('failed to start');
    });
  });

  describe('stop', () => {
    it('runs docker compose down', async () => {
      const fs = await getFsMock();
      fs.mockImplementation((p: string) => p.endsWith('docker-compose.yml'));

      const execFile = await getExecFileMock();
      execFile.mockImplementation(makeComposeSuccess('Network qa-network Removed'));

      const { stdout, stderr, getStdout, getStderr } = createStreams();
      const code = await agnosticCommand.run({ argv: ['stop'], stdout, stderr });
      expect(code).toBe(0);
      expect(getStdout()).toContain('stopped');
      expect(getStderr()).toBe('');
    });

    it('returns 1 when compose down fails', async () => {
      const fs = await getFsMock();
      fs.mockImplementation((p: string) => p.endsWith('docker-compose.yml'));

      const execFile = await getExecFileMock();
      execFile.mockImplementation(makeComposeFailure(1));

      const { stdout, stderr, getStderr } = createStreams();
      const code = await agnosticCommand.run({ argv: ['stop'], stdout, stderr });
      expect(code).toBe(1);
      expect(getStderr()).toContain('not stop cleanly');
    });
  });

  describe('status', () => {
    it('shows no containers message when stack is down', async () => {
      const fs = await getFsMock();
      fs.mockImplementation((p: string) => p.endsWith('docker-compose.yml'));

      const execFile = await getExecFileMock();
      execFile.mockImplementation(makeComposeSuccess('')); // empty output = no containers

      const { stdout, stderr, getStdout } = createStreams();
      const code = await agnosticCommand.run({ argv: ['status'], stdout, stderr });
      expect(code).toBe(0);
      expect(getStdout()).toContain('No containers running');
    });

    it('parses NDJSON container list', async () => {
      const fs = await getFsMock();
      fs.mockImplementation((p: string) => p.endsWith('docker-compose.yml'));

      const execFile = await getExecFileMock();
      const ndjson = [
        JSON.stringify({ Name: 'agnostic-qa-manager-1', State: 'running', Status: 'Up 2 minutes' }),
        JSON.stringify({ Name: 'agnostic-redis-1', State: 'running', Status: 'Up 2 minutes' }),
        JSON.stringify({ Name: 'agnostic-senior-qa-1', State: 'exited', Status: 'Exited (1)' }),
      ].join('\n');
      execFile.mockImplementation(makeComposeSuccess(ndjson));

      const { stdout, stderr, getStdout } = createStreams();
      const code = await agnosticCommand.run({ argv: ['status'], stdout, stderr });
      expect(code).toBe(0);
      expect(getStdout()).toContain('running');
      expect(getStdout()).toContain('exited');
      expect(getStdout()).toContain('http://127.0.0.1:8000');
    });

    it('returns 1 when compose ps fails', async () => {
      const fs = await getFsMock();
      fs.mockImplementation((p: string) => p.endsWith('docker-compose.yml'));

      const execFile = await getExecFileMock();
      execFile.mockImplementation(makeComposeFailure(1, 'compose error'));

      const { stdout, stderr, getStderr } = createStreams();
      const code = await agnosticCommand.run({ argv: ['status'], stdout, stderr });
      expect(code).toBe(1);
      expect(getStderr()).toContain('docker compose ps failed');
    });
  });

  describe('logs', () => {
    it('runs compose logs with default tail', async () => {
      const fs = await getFsMock();
      fs.mockImplementation((p: string) => p.endsWith('docker-compose.yml'));

      const execFile = await getExecFileMock();
      execFile.mockImplementation(makeComposeSuccess('[qa-manager] starting...'));

      const { stdout, stderr, getStdout } = createStreams();
      const code = await agnosticCommand.run({ argv: ['logs'], stdout, stderr });
      expect(code).toBe(0);
      expect(getStdout()).toContain('starting');
    });

    it('filters logs to a specific agent', async () => {
      const fs = await getFsMock();
      fs.mockImplementation((p: string) => p.endsWith('docker-compose.yml'));

      const execFile = await getExecFileMock();
      let capturedArgs: string[] = [];
      execFile.mockImplementation(
        (
          _cmd: string,
          args: string[],
          _opts: unknown,
          cb: (err: null, stdout: string, stderr: string) => void
        ) => {
          capturedArgs = args as string[];
          cb(null, '[senior-qa] ready', '');
        }
      );

      const { stdout, stderr } = createStreams();
      await agnosticCommand.run({ argv: ['logs', 'senior-qa'], stdout, stderr });
      expect(capturedArgs).toContain('senior-qa');
    });

    it('respects --tail flag', async () => {
      const fs = await getFsMock();
      fs.mockImplementation((p: string) => p.endsWith('docker-compose.yml'));

      const execFile = await getExecFileMock();
      let capturedArgs: string[] = [];
      execFile.mockImplementation(
        (
          _cmd: string,
          args: string[],
          _opts: unknown,
          cb: (err: null, stdout: string, stderr: string) => void
        ) => {
          capturedArgs = args as string[];
          cb(null, '', '');
        }
      );

      const { stdout, stderr } = createStreams();
      await agnosticCommand.run({ argv: ['logs', '--tail', '100'], stdout, stderr });
      expect(capturedArgs.some((a) => a.includes('100'))).toBe(true);
    });
  });

  describe('pull', () => {
    it('runs docker compose pull', async () => {
      const fs = await getFsMock();
      fs.mockImplementation((p: string) => p.endsWith('docker-compose.yml'));

      const execFile = await getExecFileMock();
      execFile.mockImplementation(makeComposeSuccess('Pulling redis... done'));

      const { stdout, stderr, getStdout, getStderr } = createStreams();
      const code = await agnosticCommand.run({ argv: ['pull'], stdout, stderr });
      expect(code).toBe(0);
      expect(getStdout()).toContain('updated');
      expect(getStderr()).toBe('');
    });

    it('returns 1 when pull fails', async () => {
      const fs = await getFsMock();
      fs.mockImplementation((p: string) => p.endsWith('docker-compose.yml'));

      const execFile = await getExecFileMock();
      execFile.mockImplementation(makeComposeFailure(1));

      const { stdout, stderr, getStderr } = createStreams();
      const code = await agnosticCommand.run({ argv: ['pull'], stdout, stderr });
      expect(code).toBe(1);
      expect(getStderr()).toContain('Pull failed');
    });
  });

  describe('unknown subcommand', () => {
    it('returns 1 for unknown subcommand', async () => {
      const fs = await getFsMock();
      fs.mockImplementation((p: string) => p.endsWith('docker-compose.yml'));

      const { stdout, stderr, getStderr } = createStreams();
      const code = await agnosticCommand.run({ argv: ['reboot'], stdout, stderr });
      expect(code).toBe(1);
      expect(getStderr()).toContain('Unknown subcommand');
    });
  });

  describe('command metadata', () => {
    it('has correct name', () => {
      expect(agnosticCommand.name).toBe('agnostic');
    });

    it('has ag alias', () => {
      expect(agnosticCommand.aliases).toContain('ag');
    });

    it('has usage string mentioning all subcommands', () => {
      expect(agnosticCommand.usage).toContain('start');
      expect(agnosticCommand.usage).toContain('stop');
    });
  });
});
