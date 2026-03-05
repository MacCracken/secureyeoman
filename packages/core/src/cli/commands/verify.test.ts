import { describe, it, expect, vi, afterEach } from 'vitest';
import { verifyCommand } from './verify.js';

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

describe('verify command', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints help with --help', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await verifyCommand.run({ argv: ['--help'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('SHA256SUMS');
    expect(getStdout()).toContain('cosign');
    expect(getStdout()).toContain('binary');
  });

  it('prints help with -h', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await verifyCommand.run({ argv: ['-h'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Verify');
  });

  it('returns 1 when no binary path given', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await verifyCommand.run({ argv: [], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('binary path required');
  });

  it('has name "verify"', () => {
    expect(verifyCommand.name).toBe('verify');
  });
});
