/**
 * Package version — reads from the root VERSION file at runtime.
 *
 * Falls back to the root package.json for environments where file I/O works
 * (Node.js, Docker). In a Bun-compiled standalone binary the virtual FS
 * doesn't include external files, so a compile-time constant is used as a
 * last resort. Update the root VERSION file and run `set-version.sh` to
 * keep everything in sync.
 */

import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

function readVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));

  // Try root VERSION file first (single source of truth)
  for (const rel of ['../../../VERSION', '../../VERSION', '../../../../VERSION']) {
    try {
      return readFileSync(join(here, rel), 'utf-8').trim();
    } catch {
      // try next candidate
    }
  }

  // Fallback: read from root package.json
  try {
    const require = createRequire(import.meta.url);
    return (require(join(here, '../../../package.json')) as { version: string }).version;
  } catch {
    // Bun compiled binary — use build-time constant injected by set-version.sh
    return BAKED_VERSION;
  }
}

// Updated by set-version.sh for Bun binary builds
const BAKED_VERSION = '2026.3.4';

export const VERSION = readVersion();
