/**
 * Extension Discovery — Filesystem plugin scanner for Phase 6.4a.
 *
 * Scans a directory for subdirectories containing manifest.json files
 * and returns parsed ExtensionManifest objects.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { ExtensionManifest } from './types.js';

export async function discoverPlugins(directory: string): Promise<ExtensionManifest[]> {
  const manifests: ExtensionManifest[] = [];

  let entries: string[];
  try {
    entries = await readdir(directory);
  } catch {
    // Directory doesn't exist or is unreadable — return empty
    return manifests;
  }

  for (const entry of entries) {
    const entryPath = join(directory, entry);

    try {
      const info = await stat(entryPath);
      if (!info.isDirectory()) continue;

      const manifestPath = join(entryPath, 'manifest.json');
      const raw = await readFile(manifestPath, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      // Validate required fields
      if (
        typeof parsed.id !== 'string' ||
        typeof parsed.name !== 'string' ||
        typeof parsed.version !== 'string' ||
        !Array.isArray(parsed.hooks)
      ) {
        continue;
      }

      const manifest: ExtensionManifest = {
        id: parsed.id,
        name: parsed.name,
        version: parsed.version,
        hooks: (parsed.hooks as Record<string, unknown>[])
          .filter((h) => typeof h.point === 'string' && typeof h.semantics === 'string')
          .map((h) => ({
            point: h.point as ExtensionManifest['hooks'][number]['point'],
            semantics: h.semantics as ExtensionManifest['hooks'][number]['semantics'],
            priority: typeof h.priority === 'number' ? h.priority : undefined,
          })),
      };

      manifests.push(manifest);
    } catch {
      // Skip invalid entries (missing manifest, invalid JSON, etc.)
      continue;
    }
  }

  return manifests;
}
