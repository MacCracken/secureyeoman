/**
 * Plugin Loader — Dynamically loads integration plugins from a directory.
 *
 * Each plugin module must export:
 *   - platform: Platform string identifier
 *   - createIntegration: () => Integration factory function
 *
 * Optionally:
 *   - configSchema: Zod schema for plugin config validation
 */

import { readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import type { Platform } from '@friday/shared';
import type { Integration } from './types.js';
import type { SecureLogger } from '../logging/logger.js';
import type { z } from 'zod';

export interface PluginExports {
  platform: Platform;
  createIntegration: () => Integration;
  configSchema?: z.ZodType;
}

export interface LoadedPlugin {
  platform: Platform;
  factory: () => Integration;
  configSchema?: z.ZodType;
  path: string;
}

export interface PluginLoaderOptions {
  /** Directory to scan for plugins */
  pluginDir: string;
  /** Logger instance */
  logger: SecureLogger;
}

/**
 * Validate that a module exports the required plugin interface
 */
function validatePluginExports(exports: unknown, path: string): PluginExports {
  if (!exports || typeof exports !== 'object') {
    throw new Error(`Plugin at ${path} does not export an object`);
  }

  const mod = exports as Record<string, unknown>;

  if (typeof mod.platform !== 'string' || !mod.platform) {
    throw new Error(`Plugin at ${path} must export a "platform" string`);
  }

  if (typeof mod.createIntegration !== 'function') {
    throw new Error(`Plugin at ${path} must export a "createIntegration" factory function`);
  }

  return mod as unknown as PluginExports;
}

export class PluginLoader {
  private readonly pluginDir: string;
  private readonly logger: SecureLogger;
  private readonly plugins = new Map<string, LoadedPlugin>();

  constructor(opts: PluginLoaderOptions) {
    this.pluginDir = resolve(opts.pluginDir);
    this.logger = opts.logger;
  }

  /**
   * Scan the plugin directory and load all valid plugins
   */
  async loadAll(): Promise<LoadedPlugin[]> {
    if (!existsSync(this.pluginDir)) {
      this.logger.info(`Plugin directory not found: ${this.pluginDir}`);
      return [];
    }

    const entries = readdirSync(this.pluginDir);
    const loaded: LoadedPlugin[] = [];

    for (const entry of entries) {
      const fullPath = join(this.pluginDir, entry);
      const stat = statSync(fullPath);

      // Support both single files and directories with index
      let modulePath: string;
      if (stat.isDirectory()) {
        const indexPath = join(fullPath, 'index.js');
        if (!existsSync(indexPath)) {
          this.logger.warn(`Plugin directory ${entry} has no index.js, skipping`);
          continue;
        }
        modulePath = indexPath;
      } else if (entry.endsWith('.js') || entry.endsWith('.mjs')) {
        modulePath = fullPath;
      } else {
        continue;
      }

      try {
        const plugin = await this.loadPlugin(modulePath);
        loaded.push(plugin);
        this.plugins.set(plugin.platform, plugin);
        this.logger.info(`Loaded plugin: ${plugin.platform} from ${entry}`);
      } catch (err) {
        this.logger.error(`Failed to load plugin from ${entry}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return loaded;
  }

  /**
   * Load a single plugin from a module path
   */
  async loadPlugin(modulePath: string): Promise<LoadedPlugin> {
    const mod = await import(modulePath);
    const exports = validatePluginExports(mod, modulePath);

    return {
      platform: exports.platform,
      factory: exports.createIntegration,
      configSchema: exports.configSchema,
      path: modulePath,
    };
  }

  /**
   * Get all loaded plugins
   */
  getPlugins(): LoadedPlugin[] {
    return [...this.plugins.values()];
  }

  /**
   * Get a specific loaded plugin by platform
   */
  getPlugin(platform: string): LoadedPlugin | undefined {
    return this.plugins.get(platform);
  }
}
