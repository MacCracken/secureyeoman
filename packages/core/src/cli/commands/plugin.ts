/**
 * Plugin Command — Manage integration plugins from the CLI.
 *
 * Plugins are .js/.mjs files loaded from INTEGRATION_PLUGIN_DIR.
 * Each plugin must export: platform (string), createIntegration (function).
 */

import { existsSync, readdirSync, statSync, copyFileSync, unlinkSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import type { Command, CommandContext } from '../router.js';
import { extractFlag, extractBoolFlag, formatTable } from '../utils.js';

const USAGE = `
Usage: secureyeoman plugin <action> [options]

Actions:
  list               List installed plugins
  info <platform>    Show details for a specific plugin
  add <path>         Install a plugin from a file path
  remove <platform>  Remove an installed plugin

Options:
      --dir <path>   Plugin directory (default: INTEGRATION_PLUGIN_DIR env var)
      --json         Output raw JSON
  -h, --help         Show this help

Environment:
  INTEGRATION_PLUGIN_DIR   Default plugin directory
`;

interface PluginEntry {
  platform: string;
  file: string;
  path: string;
}

function resolvePluginDir(dirFlag: string | undefined): string | undefined {
  return dirFlag ?? process.env['INTEGRATION_PLUGIN_DIR'];
}

function scanPlugins(pluginDir: string): { entries: PluginEntry[]; errors: string[] } {
  const entries: PluginEntry[] = [];
  const errors: string[] = [];

  if (!existsSync(pluginDir)) {
    return { entries, errors: [`Plugin directory not found: ${pluginDir}`] };
  }

  const files = readdirSync(pluginDir);
  for (const file of files) {
    const fullPath = join(pluginDir, file);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      const indexPath = join(fullPath, 'index.js');
      if (!existsSync(indexPath)) continue;
      // Try to infer platform from directory name; actual name resolved on import
      entries.push({ platform: file, file: 'index.js', path: indexPath });
      continue;
    }

    if (!file.endsWith('.js') && !file.endsWith('.mjs')) continue;
    // Platform name inferred from filename (without extension) until we import it
    const platform = file.replace(/\.(m?js)$/, '');
    entries.push({ platform, file, path: fullPath });
  }

  return { entries, errors };
}

async function loadPlatform(pluginPath: string): Promise<string | undefined> {
  try {
    const mod = (await import(pluginPath)) as Record<string, unknown>;
    if (typeof mod.platform === 'string' && mod.platform) return mod.platform;
  } catch {
    // Ignore import errors; return undefined
  }
  return undefined;
}

export const pluginCommand: Command = {
  name: 'plugin',
  description: 'Manage integration plugins',
  usage: 'secureyeoman plugin <action> [options]',

  async run(ctx: CommandContext): Promise<number> {
    let argv = ctx.argv;

    const helpResult = extractBoolFlag(argv, 'help', 'h');
    if (helpResult.value || argv.length === 0) {
      ctx.stdout.write(USAGE + '\n');
      return 0;
    }
    argv = helpResult.rest;

    const dirResult = extractFlag(argv, 'dir');
    argv = dirResult.rest;
    const jsonResult = extractBoolFlag(argv, 'json');
    argv = jsonResult.rest;

    const action = argv[0];
    const actionArgs = argv.slice(1);
    const pluginDir = resolvePluginDir(dirResult.value);

    try {
      switch (action) {
        case 'list':
          return await listPlugins(ctx, pluginDir, jsonResult.value);
        case 'info':
          return await infoPlugin(ctx, pluginDir, actionArgs, jsonResult.value);
        case 'add':
          return await addPlugin(ctx, pluginDir, actionArgs);
        case 'remove':
          return await removePlugin(ctx, pluginDir, actionArgs);
        default:
          ctx.stderr.write(`Unknown action: ${action ?? ''}\n`);
          ctx.stderr.write(USAGE + '\n');
          return 1;
      }
    } catch (err) {
      ctx.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
      return 1;
    }
  },
};

async function listPlugins(
  ctx: CommandContext,
  pluginDir: string | undefined,
  json: boolean
): Promise<number> {
  if (!pluginDir) {
    ctx.stderr.write('Plugin directory not set. Use --dir or set INTEGRATION_PLUGIN_DIR.\n');
    return 1;
  }

  const dir = resolve(pluginDir);
  const { entries, errors } = scanPlugins(dir);

  if (errors.length > 0) {
    ctx.stderr.write(`${errors.join('\n')}\n`);
    return 1;
  }

  if (json) {
    ctx.stdout.write(
      JSON.stringify({ dir, plugins: entries, total: entries.length }, null, 2) + '\n'
    );
    return 0;
  }

  ctx.stdout.write(`Plugin directory: ${dir}\n`);
  ctx.stdout.write(`Total: ${String(entries.length)}\n\n`);

  if (entries.length === 0) {
    ctx.stdout.write('No plugins installed.\n');
    return 0;
  }

  const rows = entries.map((e) => ({ platform: e.platform, file: e.file }));
  ctx.stdout.write(formatTable(rows, ['platform', 'file']) + '\n');
  return 0;
}

async function infoPlugin(
  ctx: CommandContext,
  pluginDir: string | undefined,
  args: string[],
  json: boolean
): Promise<number> {
  const platform = args[0];
  if (!platform) {
    ctx.stderr.write('Usage: secureyeoman plugin info <platform>\n');
    return 1;
  }

  if (!pluginDir) {
    ctx.stderr.write('Plugin directory not set. Use --dir or set INTEGRATION_PLUGIN_DIR.\n');
    return 1;
  }

  const dir = resolve(pluginDir);
  const { entries, errors } = scanPlugins(dir);

  if (errors.length > 0) {
    ctx.stderr.write(`${errors.join('\n')}\n`);
    return 1;
  }

  // Match by filename-inferred name or actual exported platform
  let entry = entries.find((e) => e.platform === platform);
  if (!entry) {
    ctx.stderr.write(`Plugin not found: ${platform}\n`);
    return 1;
  }

  // Try to load actual exported platform name
  const actualPlatform = await loadPlatform(entry.path);

  const info = {
    platform: actualPlatform ?? entry.platform,
    file: entry.file,
    path: entry.path,
    loadable: actualPlatform !== undefined,
  };

  if (json) {
    ctx.stdout.write(JSON.stringify(info, null, 2) + '\n');
    return 0;
  }

  ctx.stdout.write(`\nPlugin: ${info.platform}\n`);
  ctx.stdout.write('─'.repeat(30) + '\n');
  ctx.stdout.write(`  File:      ${info.file}\n`);
  ctx.stdout.write(`  Path:      ${info.path}\n`);
  ctx.stdout.write(`  Loadable:  ${String(info.loadable)}\n`);
  ctx.stdout.write('\n');
  return 0;
}

async function addPlugin(
  ctx: CommandContext,
  pluginDir: string | undefined,
  args: string[]
): Promise<number> {
  const sourcePath = args[0];
  if (!sourcePath) {
    ctx.stderr.write('Usage: secureyeoman plugin add <path>\n');
    return 1;
  }

  if (!pluginDir) {
    ctx.stderr.write('Plugin directory not set. Use --dir or set INTEGRATION_PLUGIN_DIR.\n');
    return 1;
  }

  const resolvedSource = resolve(sourcePath);
  if (!existsSync(resolvedSource)) {
    ctx.stderr.write(`File not found: ${resolvedSource}\n`);
    return 1;
  }

  const stat = statSync(resolvedSource);
  if (!stat.isFile()) {
    ctx.stderr.write(`Not a file: ${resolvedSource}\n`);
    return 1;
  }

  const fileName = basename(resolvedSource);
  if (!fileName.endsWith('.js') && !fileName.endsWith('.mjs')) {
    ctx.stderr.write(`Plugin must be a .js or .mjs file: ${fileName}\n`);
    return 1;
  }

  // Validate plugin exports before installing
  const actualPlatform = await loadPlatform(resolvedSource);
  if (!actualPlatform) {
    ctx.stderr.write(
      `Invalid plugin: ${fileName} must export a "platform" string and "createIntegration" function.\n`
    );
    return 1;
  }

  const dir = resolve(pluginDir);
  if (!existsSync(dir)) {
    ctx.stderr.write(`Plugin directory does not exist: ${dir}\n`);
    return 1;
  }

  const destPath = join(dir, fileName);
  copyFileSync(resolvedSource, destPath);

  ctx.stdout.write(`Plugin installed: ${actualPlatform} → ${destPath}\n`);
  ctx.stdout.write('Restart the server for the plugin to take effect.\n');
  return 0;
}

async function removePlugin(
  ctx: CommandContext,
  pluginDir: string | undefined,
  args: string[]
): Promise<number> {
  const platform = args[0];
  if (!platform) {
    ctx.stderr.write('Usage: secureyeoman plugin remove <platform>\n');
    return 1;
  }

  if (!pluginDir) {
    ctx.stderr.write('Plugin directory not set. Use --dir or set INTEGRATION_PLUGIN_DIR.\n');
    return 1;
  }

  const dir = resolve(pluginDir);
  const { entries, errors } = scanPlugins(dir);

  if (errors.length > 0) {
    ctx.stderr.write(`${errors.join('\n')}\n`);
    return 1;
  }

  const entry = entries.find((e) => e.platform === platform);
  if (!entry) {
    ctx.stderr.write(`Plugin not found: ${platform}\n`);
    return 1;
  }

  unlinkSync(entry.path);
  ctx.stdout.write(`Plugin removed: ${platform} (${entry.file})\n`);
  ctx.stdout.write('Restart the server for the change to take effect.\n');
  return 0;
}
