import { describe, it, expect, vi, afterEach } from 'vitest';
import { sbomCommand } from './sbom.js';

function createStreams() {
  let stdoutBuf = '';
  let stderrBuf = '';
  const stdout = {
    write: (s: string) => { stdoutBuf += s; return true; },
  } as NodeJS.WritableStream;
  const stderr = {
    write: (s: string) => { stderrBuf += s; return true; },
  } as NodeJS.WritableStream;
  return { stdout, stderr, getStdout: () => stdoutBuf, getStderr: () => stderrBuf };
}

describe('sbom command', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints help with --help', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await sbomCommand.run({ argv: ['--help'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('generate');
    expect(getStdout()).toContain('compliance');
    expect(getStdout()).toContain('deps');
    expect(getStdout()).toContain('CycloneDX');
  });

  it('prints help with -h', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await sbomCommand.run({ argv: ['-h'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('generate');
  });

  it('returns 1 for unknown subcommand', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await sbomCommand.run({ argv: ['unknown'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Unknown subcommand');
  });

  it('has name and aliases', () => {
    expect(sbomCommand.name).toBe('sbom');
    expect(sbomCommand.aliases).toContain('bom');
  });

  // compliance subcommand
  it('compliance lists all frameworks', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await sbomCommand.run({ argv: ['compliance'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('nist-800-53');
    expect(getStdout()).toContain('soc2');
    expect(getStdout()).toContain('iso27001');
  });

  it('compliance --json outputs JSON', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await sbomCommand.run({ argv: ['compliance', '--json'], stdout, stderr });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout());
    expect(parsed.summaries).toBeDefined();
    expect(parsed.mappings).toBeDefined();
    expect(Array.isArray(parsed.mappings)).toBe(true);
  });

  it('compliance --framework filters to specific framework', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await sbomCommand.run({ argv: ['compliance', '--framework', 'hipaa'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('hipaa');
  });

  it('compliance returns 1 for unknown framework', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await sbomCommand.run({ argv: ['compliance', '--framework', 'bogus'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Unknown framework');
  });
});
