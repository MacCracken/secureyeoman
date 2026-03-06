import { describe, it, expect, vi, afterEach } from 'vitest';
import { sbomCommand } from './sbom.js';

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

describe('sbom command', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── help ──────────────────────────────────────────────────────

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

  // ── unknown subcommand ────────────────────────────────────────

  it('returns 1 for unknown subcommand', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await sbomCommand.run({ argv: ['unknown'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Unknown subcommand');
  });

  // ── metadata ──────────────────────────────────────────────────

  it('has name and aliases', () => {
    expect(sbomCommand.name).toBe('sbom');
    expect(sbomCommand.aliases).toContain('bom');
  });

  // ── generate subcommand ───────────────────────────────────────

  it('generate outputs SBOM JSON to stdout', async () => {
    vi.doMock('../../supply-chain/sbom-generator.js', () => ({
      generateSbom: vi.fn().mockReturnValue({
        bomFormat: 'CycloneDX',
        specVersion: '1.5',
        components: [{ name: 'lodash', version: '4.17.21' }],
      }),
    }));

    const { sbomCommand: cmd } = await import('./sbom.js');
    const { stdout, stderr, getStdout } = createStreams();
    const code = await cmd.run({ argv: ['generate'], stdout, stderr });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout());
    expect(parsed.bomFormat).toBe('CycloneDX');
    expect(parsed.components).toHaveLength(1);

    vi.doUnmock('../../supply-chain/sbom-generator.js');
  });

  it('generate with no sub defaults to generate', async () => {
    vi.doMock('../../supply-chain/sbom-generator.js', () => ({
      generateSbom: vi.fn().mockReturnValue({
        bomFormat: 'CycloneDX',
        specVersion: '1.5',
        components: [],
      }),
    }));

    const { sbomCommand: cmd } = await import('./sbom.js');
    const { stdout, stderr, getStdout } = createStreams();
    const code = await cmd.run({ argv: [], stdout, stderr });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout());
    expect(parsed.bomFormat).toBe('CycloneDX');

    vi.doUnmock('../../supply-chain/sbom-generator.js');
  });

  it('generate with --output writes to file', async () => {
    const mockWriteFileSync = vi.fn();
    vi.doMock('../../supply-chain/sbom-generator.js', () => ({
      generateSbom: vi.fn().mockReturnValue({
        bomFormat: 'CycloneDX',
        specVersion: '1.5',
        components: [{ name: 'a' }, { name: 'b' }],
      }),
    }));
    vi.doMock('node:fs', () => ({
      writeFileSync: mockWriteFileSync,
    }));

    const { sbomCommand: cmd } = await import('./sbom.js');
    const { stdout, stderr, getStdout } = createStreams();
    const code = await cmd.run({
      argv: ['generate', '--output', '/tmp/sbom.json'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('SBOM written to /tmp/sbom.json');
    expect(getStdout()).toContain('Components: 2');
    expect(getStdout()).toContain('CycloneDX 1.5');

    vi.doUnmock('../../supply-chain/sbom-generator.js');
    vi.doUnmock('node:fs');
  });

  it('generate with --dir passes directory', async () => {
    const mockGenerate = vi.fn().mockReturnValue({
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      components: [],
    });
    vi.doMock('../../supply-chain/sbom-generator.js', () => ({
      generateSbom: mockGenerate,
    }));

    const { sbomCommand: cmd } = await import('./sbom.js');
    const { stdout, stderr } = createStreams();
    await cmd.run({ argv: ['generate', '--dir', '/custom/path'], stdout, stderr });
    expect(mockGenerate).toHaveBeenCalledWith(expect.objectContaining({ rootDir: '/custom/path' }));

    vi.doUnmock('../../supply-chain/sbom-generator.js');
  });

  it('generate with --include-dev passes flag', async () => {
    const mockGenerate = vi.fn().mockReturnValue({
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      components: [],
    });
    vi.doMock('../../supply-chain/sbom-generator.js', () => ({
      generateSbom: mockGenerate,
    }));

    const { sbomCommand: cmd } = await import('./sbom.js');
    const { stdout, stderr } = createStreams();
    await cmd.run({ argv: ['generate', '--include-dev'], stdout, stderr });
    expect(mockGenerate).toHaveBeenCalledWith(expect.objectContaining({ includeDev: true }));

    vi.doUnmock('../../supply-chain/sbom-generator.js');
  });

  it('generate handles error from sbom generator', async () => {
    vi.doMock('../../supply-chain/sbom-generator.js', () => ({
      generateSbom: vi.fn().mockImplementation(() => {
        throw new Error('No package.json found');
      }),
    }));

    const { sbomCommand: cmd } = await import('./sbom.js');
    const { stdout, stderr, getStderr } = createStreams();
    const code = await cmd.run({ argv: ['generate'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('No package.json found');

    vi.doUnmock('../../supply-chain/sbom-generator.js');
  });

  it('generate handles non-Error thrown value', async () => {
    vi.doMock('../../supply-chain/sbom-generator.js', () => ({
      generateSbom: vi.fn().mockImplementation(() => {
        throw 'string error';
      }),
    }));

    const { sbomCommand: cmd } = await import('./sbom.js');
    const { stdout, stderr, getStderr } = createStreams();
    const code = await cmd.run({ argv: ['generate'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('string error');

    vi.doUnmock('../../supply-chain/sbom-generator.js');
  });

  // ── compliance subcommand ─────────────────────────────────────

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
    const code = await sbomCommand.run({
      argv: ['compliance', '--framework', 'hipaa'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('hipaa');
  });

  it('compliance returns 1 for unknown framework', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await sbomCommand.run({
      argv: ['compliance', '--framework', 'bogus'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Unknown framework');
    expect(getStderr()).toContain('Available:');
  });

  it('compliance --format json outputs JSON', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await sbomCommand.run({
      argv: ['compliance', '--format', 'json'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout());
    expect(parsed.summaries).toBeDefined();
  });

  it('compliance --framework with --json filters and outputs JSON', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await sbomCommand.run({
      argv: ['compliance', '--framework', 'soc2', '--json'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout());
    expect(parsed.mappings).toBeDefined();
  });

  it('compliance md output shows coverage with use-framework hint', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await sbomCommand.run({ argv: ['compliance'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Compliance Framework Coverage');
    expect(getStdout()).toContain('--framework');
  });

  it('compliance --framework nist-800-53 shows detailed mapping', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await sbomCommand.run({
      argv: ['compliance', '--framework', 'nist-800-53'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    // It should contain NIST framework content
    expect(getStdout().length).toBeGreaterThan(0);
  });

  it('compliance --framework eu-ai-act shows mapping', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await sbomCommand.run({
      argv: ['compliance', '--framework', 'eu-ai-act'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout().length).toBeGreaterThan(0);
  });

  // ── deps subcommand ───────────────────────────────────────────

  it('deps tracks dependency changes', async () => {
    vi.doMock('../../supply-chain/dependency-tracker.js', () => ({
      trackDependencies: vi.fn().mockReturnValue({
        baselineCreated: false,
        diff: { added: [], removed: [], versionChanged: [] },
        alerts: [],
      }),
    }));

    const { sbomCommand: cmd } = await import('./sbom.js');
    const { stdout, stderr, getStdout } = createStreams();
    const code = await cmd.run({ argv: ['deps'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('No dependency changes detected');

    vi.doUnmock('../../supply-chain/dependency-tracker.js');
  });

  it('deps shows baseline created message on first run', async () => {
    vi.doMock('../../supply-chain/dependency-tracker.js', () => ({
      trackDependencies: vi.fn().mockReturnValue({
        baselineCreated: true,
        diff: { added: [], removed: [], versionChanged: [] },
        alerts: [],
      }),
    }));

    const { sbomCommand: cmd } = await import('./sbom.js');
    const { stdout, stderr, getStdout } = createStreams();
    const code = await cmd.run({ argv: ['deps'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Dependency baseline created');

    vi.doUnmock('../../supply-chain/dependency-tracker.js');
  });

  it('deps --json outputs raw JSON', async () => {
    vi.doMock('../../supply-chain/dependency-tracker.js', () => ({
      trackDependencies: vi.fn().mockReturnValue({
        baselineCreated: false,
        diff: { added: ['pkg-a'], removed: [], versionChanged: [] },
        alerts: [],
      }),
    }));

    const { sbomCommand: cmd } = await import('./sbom.js');
    const { stdout, stderr, getStdout } = createStreams();
    const code = await cmd.run({ argv: ['deps', '--json'], stdout, stderr });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout());
    expect(parsed.diff.added).toContain('pkg-a');

    vi.doUnmock('../../supply-chain/dependency-tracker.js');
  });

  it('deps shows added, removed, and changed counts', async () => {
    vi.doMock('../../supply-chain/dependency-tracker.js', () => ({
      trackDependencies: vi.fn().mockReturnValue({
        baselineCreated: false,
        diff: {
          added: ['new-pkg'],
          removed: ['old-pkg'],
          versionChanged: ['changed-pkg'],
        },
        alerts: [],
      }),
    }));

    const { sbomCommand: cmd } = await import('./sbom.js');
    const { stdout, stderr, getStdout } = createStreams();
    const code = await cmd.run({ argv: ['deps'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Added: 1');
    expect(getStdout()).toContain('Removed: 1');
    expect(getStdout()).toContain('Changed: 1');
    expect(getStdout()).toContain('Dependency Provenance Report');

    vi.doUnmock('../../supply-chain/dependency-tracker.js');
  });

  it('deps shows alerts with different severity levels', async () => {
    vi.doMock('../../supply-chain/dependency-tracker.js', () => ({
      trackDependencies: vi.fn().mockReturnValue({
        baselineCreated: false,
        diff: { added: ['x'], removed: [], versionChanged: [] },
        alerts: [
          { level: 'critical', message: 'Critical vulnerability detected' },
          { level: 'high', message: 'High risk package' },
          { level: 'medium', message: 'Medium concern' },
          { level: 'low', message: 'Low priority info' },
        ],
      }),
    }));

    const { sbomCommand: cmd } = await import('./sbom.js');
    const { stdout, stderr, getStdout } = createStreams();
    const code = await cmd.run({ argv: ['deps'], stdout, stderr });
    // Should return 1 because critical/high alerts present
    expect(code).toBe(1);
    expect(getStdout()).toContain('[CRITICAL]');
    expect(getStdout()).toContain('[HIGH]');
    expect(getStdout()).toContain('[MEDIUM]');
    expect(getStdout()).toContain('[LOW]');
    expect(getStdout()).toContain('Alerts:');

    vi.doUnmock('../../supply-chain/dependency-tracker.js');
  });

  it('deps returns 0 when only medium/low alerts', async () => {
    vi.doMock('../../supply-chain/dependency-tracker.js', () => ({
      trackDependencies: vi.fn().mockReturnValue({
        baselineCreated: false,
        diff: { added: ['y'], removed: [], versionChanged: [] },
        alerts: [{ level: 'medium', message: 'Medium concern' }],
      }),
    }));

    const { sbomCommand: cmd } = await import('./sbom.js');
    const { stdout, stderr, getStdout } = createStreams();
    const code = await cmd.run({ argv: ['deps'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('[MEDIUM]');

    vi.doUnmock('../../supply-chain/dependency-tracker.js');
  });

  it('deps shows accept-changes hint', async () => {
    vi.doMock('../../supply-chain/dependency-tracker.js', () => ({
      trackDependencies: vi.fn().mockReturnValue({
        baselineCreated: false,
        diff: { added: ['z'], removed: [], versionChanged: [] },
        alerts: [],
      }),
    }));

    const { sbomCommand: cmd } = await import('./sbom.js');
    const { stdout, stderr, getStdout } = createStreams();
    await cmd.run({ argv: ['deps'], stdout, stderr });
    expect(getStdout()).toContain('secureyeoman sbom deps baseline');

    vi.doUnmock('../../supply-chain/dependency-tracker.js');
  });

  it('deps with --dir passes directory', async () => {
    const mockTrack = vi.fn().mockReturnValue({
      baselineCreated: true,
      diff: { added: [], removed: [], versionChanged: [] },
      alerts: [],
    });
    vi.doMock('../../supply-chain/dependency-tracker.js', () => ({
      trackDependencies: mockTrack,
    }));

    const { sbomCommand: cmd } = await import('./sbom.js');
    const { stdout, stderr } = createStreams();
    await cmd.run({ argv: ['deps', '--dir', '/custom/dir'], stdout, stderr });
    expect(mockTrack).toHaveBeenCalledWith('/custom/dir');

    vi.doUnmock('../../supply-chain/dependency-tracker.js');
  });

  it('deps handles tracker error', async () => {
    vi.doMock('../../supply-chain/dependency-tracker.js', () => ({
      trackDependencies: vi.fn().mockImplementation(() => {
        throw new Error('Cannot read baseline');
      }),
    }));

    const { sbomCommand: cmd } = await import('./sbom.js');
    const { stdout, stderr, getStderr } = createStreams();
    const code = await cmd.run({ argv: ['deps'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Cannot read baseline');

    vi.doUnmock('../../supply-chain/dependency-tracker.js');
  });

  it('deps handles non-Error thrown value', async () => {
    vi.doMock('../../supply-chain/dependency-tracker.js', () => ({
      trackDependencies: vi.fn().mockImplementation(() => {
        throw 'string tracker error';
      }),
    }));

    const { sbomCommand: cmd } = await import('./sbom.js');
    const { stdout, stderr, getStderr } = createStreams();
    const code = await cmd.run({ argv: ['deps'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('string tracker error');

    vi.doUnmock('../../supply-chain/dependency-tracker.js');
  });

  // ── deps baseline subcommand ──────────────────────────────────

  it('deps baseline updates baseline', async () => {
    vi.doMock('../../supply-chain/dependency-tracker.js', () => ({
      updateBaseline: vi.fn(),
    }));

    const { sbomCommand: cmd } = await import('./sbom.js');
    const { stdout, stderr, getStdout } = createStreams();
    const code = await cmd.run({ argv: ['deps', 'baseline'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Dependency baseline updated');

    vi.doUnmock('../../supply-chain/dependency-tracker.js');
  });

  it('deps baseline with --dir passes directory', async () => {
    const mockUpdateBaseline = vi.fn();
    vi.doMock('../../supply-chain/dependency-tracker.js', () => ({
      updateBaseline: mockUpdateBaseline,
    }));

    const { sbomCommand: cmd } = await import('./sbom.js');
    const { stdout, stderr } = createStreams();
    await cmd.run({ argv: ['deps', '--dir', '/my/project', 'baseline'], stdout, stderr });
    expect(mockUpdateBaseline).toHaveBeenCalledWith('/my/project');

    vi.doUnmock('../../supply-chain/dependency-tracker.js');
  });

  it('deps baseline handles error', async () => {
    vi.doMock('../../supply-chain/dependency-tracker.js', () => ({
      updateBaseline: vi.fn().mockImplementation(() => {
        throw new Error('Permission denied');
      }),
    }));

    const { sbomCommand: cmd } = await import('./sbom.js');
    const { stdout, stderr, getStderr } = createStreams();
    const code = await cmd.run({ argv: ['deps', 'baseline'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Permission denied');

    vi.doUnmock('../../supply-chain/dependency-tracker.js');
  });

  it('deps baseline handles non-Error thrown value', async () => {
    vi.doMock('../../supply-chain/dependency-tracker.js', () => ({
      updateBaseline: vi.fn().mockImplementation(() => {
        throw 'baseline fail';
      }),
    }));

    const { sbomCommand: cmd } = await import('./sbom.js');
    const { stdout, stderr, getStderr } = createStreams();
    const code = await cmd.run({ argv: ['deps', 'baseline'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('baseline fail');

    vi.doUnmock('../../supply-chain/dependency-tracker.js');
  });

  // ── deps shows only added ────────────────────────────────────

  it('deps shows only added when no removed or changed', async () => {
    vi.doMock('../../supply-chain/dependency-tracker.js', () => ({
      trackDependencies: vi.fn().mockReturnValue({
        baselineCreated: false,
        diff: { added: ['new-lib'], removed: [], versionChanged: [] },
        alerts: [],
      }),
    }));

    const { sbomCommand: cmd } = await import('./sbom.js');
    const { stdout, stderr, getStdout } = createStreams();
    const code = await cmd.run({ argv: ['deps'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Added: 1');
    expect(getStdout()).not.toContain('Removed:');
    expect(getStdout()).not.toContain('Changed:');

    vi.doUnmock('../../supply-chain/dependency-tracker.js');
  });

  // ── deps shows only removed ──────────────────────────────────

  it('deps shows only removed when no added or changed', async () => {
    vi.doMock('../../supply-chain/dependency-tracker.js', () => ({
      trackDependencies: vi.fn().mockReturnValue({
        baselineCreated: false,
        diff: { added: [], removed: ['gone-lib'], versionChanged: [] },
        alerts: [],
      }),
    }));

    const { sbomCommand: cmd } = await import('./sbom.js');
    const { stdout, stderr, getStdout } = createStreams();
    const code = await cmd.run({ argv: ['deps'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).not.toContain('Added:');
    expect(getStdout()).toContain('Removed: 1');
    expect(getStdout()).not.toContain('Changed:');

    vi.doUnmock('../../supply-chain/dependency-tracker.js');
  });
});
