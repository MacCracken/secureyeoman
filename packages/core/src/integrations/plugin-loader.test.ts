import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PluginLoader } from './plugin-loader.js';
import type { SecureLogger } from '../logging/logger.js';

function noopLogger(): SecureLogger {
  const noop = () => {};
  return {
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    child: () => noopLogger(),
    level: 'silent',
  };
}

function writePlugin(dir: string, filename: string, content: string): void {
  writeFileSync(join(dir, filename), content, 'utf-8');
}

describe('PluginLoader', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'secureyeoman-plugins-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should load a valid plugin from a .js file', async () => {
    writePlugin(
      tmpDir,
      'test-plugin.mjs',
      `
      export const platform = 'test-platform';
      export function createIntegration() {
        return { platform: 'test-platform' };
      }
    `
    );

    const loader = new PluginLoader({ pluginDir: tmpDir, logger: noopLogger() });
    const plugins = await loader.loadAll();

    expect(plugins).toHaveLength(1);
    expect(plugins[0].platform).toBe('test-platform');
    expect(typeof plugins[0].factory).toBe('function');
  });

  it('should reject plugin with missing exports', async () => {
    writePlugin(
      tmpDir,
      'bad-plugin.mjs',
      `
      export const notAPlatform = true;
    `
    );

    const loader = new PluginLoader({ pluginDir: tmpDir, logger: noopLogger() });
    const plugins = await loader.loadAll();

    // Bad plugin should be skipped, not cause a crash
    expect(plugins).toHaveLength(0);
  });

  it('should handle plugin load errors gracefully', async () => {
    writePlugin(
      tmpDir,
      'broken.mjs',
      `
      throw new Error('Module init failed');
    `
    );

    const loader = new PluginLoader({ pluginDir: tmpDir, logger: noopLogger() });
    const plugins = await loader.loadAll();

    expect(plugins).toHaveLength(0);
  });

  it('should return empty array when plugin dir does not exist', async () => {
    const loader = new PluginLoader({
      pluginDir: join(tmpDir, 'nonexistent'),
      logger: noopLogger(),
    });
    const plugins = await loader.loadAll();

    expect(plugins).toHaveLength(0);
  });

  it('should load plugin from directory with index.js', async () => {
    const pluginDir = join(tmpDir, 'my-plugin');
    mkdirSync(pluginDir);
    writePlugin(
      pluginDir,
      'index.js',
      `
      module.exports.platform = 'dir-platform';
      module.exports.createIntegration = function() { return {}; };
    `
    );

    const loader = new PluginLoader({ pluginDir: tmpDir, logger: noopLogger() });
    const plugins = await loader.loadAll();

    expect(plugins).toHaveLength(1);
    expect(plugins[0].platform).toBe('dir-platform');
  });
});
