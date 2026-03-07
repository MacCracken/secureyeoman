/**
 * Guardrail Filter Loader — Phase 143
 *
 * Discovers and loads user-written TypeScript filter modules from the
 * configured guardrails/ directory. Each module must default-export a
 * `{ createFilter }` object conforming to GuardrailFilterModule.
 */

import { readdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { GuardrailFilter, GuardrailFilterModule } from '@secureyeoman/shared';

export interface FilterLoaderOptions {
  filterDir: string;
  logger?: {
    info(msg: string, ctx?: Record<string, unknown>): void;
    warn(msg: string, ctx?: Record<string, unknown>): void;
    error(msg: string, ctx?: Record<string, unknown>): void;
  };
}

const VALID_EXTENSIONS = new Set(['.js', '.mjs']);

export async function loadCustomFilters(opts: FilterLoaderOptions): Promise<GuardrailFilter[]> {
  const { filterDir, logger } = opts;
  const absDir = resolve(filterDir);

  if (!existsSync(absDir)) {
    logger?.info({ dir: absDir }, 'Custom guardrail filter directory does not exist, skipping');
    return [];
  }

  let entries: string[];
  try {
    entries = await readdir(absDir);
  } catch (err) {
    logger?.warn({ dir: absDir, error: String(err) }, 'Failed to read custom filter directory');
    return [];
  }

  const filterFiles = entries.filter((f) => VALID_EXTENSIONS.has(extname(f)));
  if (filterFiles.length === 0) {
    logger?.info({ dir: absDir }, 'No custom filter files found');
    return [];
  }

  const filters: GuardrailFilter[] = [];

  for (const file of filterFiles) {
    const filePath = resolve(absDir, file);
    try {
      const moduleUrl = pathToFileURL(filePath).href;
      const mod = (await import(moduleUrl)) as { default?: GuardrailFilterModule };
      const filterModule = mod.default;

      if (!filterModule?.createFilter || typeof filterModule.createFilter !== 'function') {
        logger?.warn({ file }, 'Custom filter module missing createFilter export, skipping');
        continue;
      }

      const filter = filterModule.createFilter();

      // Validate required fields
      if (!filter.id || !filter.name || typeof filter.priority !== 'number') {
        logger?.warn({
          file,
        }, 'Custom filter missing required fields (id, name, priority), skipping');
        continue;
      }

      // Namespace custom filter IDs
      if (!filter.id.startsWith('custom:')) {
        filter.id = `custom:${filter.id}`;
      }

      filters.push(filter);
      logger?.info(`Loaded custom guardrail filter: ${filter.name}`, {
        filterId: filter.id,
        priority: filter.priority,
      });
    } catch (err) {
      logger?.error({ file, error: String(err) }, 'Failed to load custom guardrail filter');
    }
  }

  return filters;
}
