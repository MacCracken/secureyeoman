import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { configCommand } from './config.js';

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

describe('config command', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should print help with --help', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await configCommand.run({ argv: ['--help'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('--config');
    expect(getStdout()).toContain('--check-secrets');
  });

  it('should validate default config successfully', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await configCommand.run({ argv: [], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Configuration valid');
    expect(getStdout()).toContain('Environment:');
    expect(getStdout()).toContain('Gateway:');
    expect(getStdout()).toContain('Provider:');
  });

  it('should fail for non-existent config path', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await configCommand.run({
      argv: ['--config', '/nonexistent/config.yaml'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Config file not found');
  });

  it('should report missing secrets with --check-secrets', async () => {
    // Clear all secrets
    delete process.env.SECUREYEOMAN_SIGNING_KEY;
    delete process.env.SECUREYEOMAN_TOKEN_SECRET;
    delete process.env.SECUREYEOMAN_ENCRYPTION_KEY;
    delete process.env.SECUREYEOMAN_ADMIN_PASSWORD;
    delete process.env.ANTHROPIC_API_KEY;

    const { stdout, stderr, getStderr } = createStreams();
    const code = await configCommand.run({
      argv: ['--check-secrets'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Missing required secrets');
  });
});

describe('config validate subcommand', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should print help with validate --help', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await configCommand.run({ argv: ['validate', '--help'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('pre-startup');
    expect(getStdout()).toContain('--json');
  });

  it('should show validation checks when run', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await configCommand.run({ argv: ['validate'], stdout, stderr });
    // May pass or fail depending on test environment secrets; just check it ran
    expect([0, 1]).toContain(code);
    expect(getStdout()).toContain('config structure');
    expect(getStdout()).toContain('required secrets');
    expect(getStdout()).toContain('Result:');
  });

  it('should output JSON with --json', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await configCommand.run({ argv: ['validate', '--json'], stdout, stderr });
    expect([0, 1]).toContain(code);
    const parsed = JSON.parse(getStdout()) as { valid: boolean; checks: { name: string; passed: boolean }[] };
    expect(typeof parsed.valid).toBe('boolean');
    expect(Array.isArray(parsed.checks)).toBe(true);
    const names = parsed.checks.map((c) => c.name);
    expect(names).toContain('config_structure');
    expect(names).toContain('required_secrets');
  });

  it('should show FAIL for nonexistent config path', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await configCommand.run({
      argv: ['validate', '--config', '/nonexistent/config.yaml'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStdout()).toContain('FAIL');
    expect(getStdout()).toContain('✗');
  });

  it('should mark secrets as skipped when config fails', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    await configCommand.run({
      argv: ['validate', '--config', '/nonexistent/config.yaml'],
      stdout,
      stderr,
    });
    expect(getStdout()).toContain('Skipped');
  });

  it('should report FAIL with missing secrets', async () => {
    delete process.env.SECUREYEOMAN_SIGNING_KEY;
    delete process.env.SECUREYEOMAN_TOKEN_SECRET;
    delete process.env.SECUREYEOMAN_ENCRYPTION_KEY;
    delete process.env.SECUREYEOMAN_ADMIN_PASSWORD;
    delete process.env.ANTHROPIC_API_KEY;

    const { stdout, stderr, getStdout } = createStreams();
    const code = await configCommand.run({ argv: ['validate'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStdout()).toContain('FAIL');
  });
});
