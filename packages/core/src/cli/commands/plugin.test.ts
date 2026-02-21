import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pluginCommand } from './plugin.js';

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

describe('plugin command', () => {
  let tmpDir: string;
  const originalEnv = process.env;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'sy-plugin-test-'));
    process.env = { ...originalEnv };
    delete process.env['INTEGRATION_PLUGIN_DIR'];
  });

  afterEach(() => {
    process.env = originalEnv;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should print help with --help', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await pluginCommand.run({ argv: ['--help'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('list');
    expect(getStdout()).toContain('info');
    expect(getStdout()).toContain('add');
    expect(getStdout()).toContain('remove');
    expect(getStdout()).toContain('INTEGRATION_PLUGIN_DIR');
  });

  it('should print help with no args', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await pluginCommand.run({ argv: [], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('list');
  });

  it('list: should fail when no plugin dir configured', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await pluginCommand.run({ argv: ['list'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Plugin directory not set');
  });

  it('list: should show empty result for empty directory via --dir', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await pluginCommand.run({ argv: ['list', '--dir', tmpDir], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('No plugins installed');
  });

  it('list: should read INTEGRATION_PLUGIN_DIR from env', async () => {
    process.env['INTEGRATION_PLUGIN_DIR'] = tmpDir;
    const { stdout, stderr, getStdout } = createStreams();
    const code = await pluginCommand.run({ argv: ['list'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain(tmpDir);
  });

  it('list: should detect .js files in plugin directory', async () => {
    writeFileSync(join(tmpDir, 'my-plugin.js'), '// stub');
    const { stdout, stderr, getStdout } = createStreams();
    const code = await pluginCommand.run({ argv: ['list', '--dir', tmpDir], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('my-plugin');
  });

  it('list: should ignore non-js files', async () => {
    writeFileSync(join(tmpDir, 'readme.md'), '# docs');
    writeFileSync(join(tmpDir, 'config.yaml'), 'key: val');
    const { stdout, stderr, getStdout } = createStreams();
    const code = await pluginCommand.run({ argv: ['list', '--dir', tmpDir], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('No plugins installed');
  });

  it('list: should output JSON with --json', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await pluginCommand.run({
      argv: ['list', '--dir', tmpDir, '--json'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout()) as { dir: string; plugins: unknown[]; total: number };
    expect(parsed.total).toBe(0);
    expect(parsed.plugins).toEqual([]);
  });

  it('list: should return 1 for nonexistent directory', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await pluginCommand.run({
      argv: ['list', '--dir', '/nonexistent/plugin/dir'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('not found');
  });

  it('info: should fail when no platform specified', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await pluginCommand.run({ argv: ['info', '--dir', tmpDir], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  it('info: should fail when plugin not found', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await pluginCommand.run({
      argv: ['info', 'nonexistent', '--dir', tmpDir],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Plugin not found');
  });

  it('info: should show plugin details for existing file', async () => {
    writeFileSync(join(tmpDir, 'slack.js'), '// stub');
    const { stdout, stderr, getStdout } = createStreams();
    const code = await pluginCommand.run({
      argv: ['info', 'slack', '--dir', tmpDir],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('slack');
    expect(getStdout()).toContain('File:');
    expect(getStdout()).toContain('Path:');
  });

  it('add: should fail when no path specified', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await pluginCommand.run({ argv: ['add', '--dir', tmpDir], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  it('add: should fail for nonexistent source file', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await pluginCommand.run({
      argv: ['add', '/nonexistent/plugin.js', '--dir', tmpDir],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('not found');
  });

  it('add: should fail for non-.js file', async () => {
    const badFile = join(tmpDir, 'plugin.txt');
    writeFileSync(badFile, '# not a plugin');
    const destDir = mkdtempSync(join(tmpdir(), 'sy-plugin-dest-'));
    try {
      const { stdout, stderr, getStderr } = createStreams();
      const code = await pluginCommand.run({
        argv: ['add', badFile, '--dir', destDir],
        stdout,
        stderr,
      });
      expect(code).toBe(1);
      expect(getStderr()).toContain('.js or .mjs');
    } finally {
      rmSync(destDir, { recursive: true, force: true });
    }
  });

  it('remove: should fail when no platform specified', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await pluginCommand.run({ argv: ['remove', '--dir', tmpDir], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  it('remove: should fail when plugin not found', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await pluginCommand.run({
      argv: ['remove', 'nonexistent', '--dir', tmpDir],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Plugin not found');
  });

  it('remove: should delete plugin file', async () => {
    const pluginFile = join(tmpDir, 'slack.js');
    writeFileSync(pluginFile, '// stub');
    const { stdout, stderr, getStdout } = createStreams();
    const code = await pluginCommand.run({
      argv: ['remove', 'slack', '--dir', tmpDir],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('removed');
    expect(existsSync(pluginFile)).toBe(false);
  });

  it('should return 1 for unknown action', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await pluginCommand.run({
      argv: ['unknown', '--dir', tmpDir],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Unknown action');
  });

  it('should detect directory-based plugins (with index.js)', async () => {
    const pluginSubdir = join(tmpDir, 'my-dir-plugin');
    mkdirSync(pluginSubdir);
    writeFileSync(join(pluginSubdir, 'index.js'), '// stub');
    const { stdout, stderr, getStdout } = createStreams();
    const code = await pluginCommand.run({ argv: ['list', '--dir', tmpDir], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('my-dir-plugin');
  });
});
