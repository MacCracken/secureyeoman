/**
 * Package version — single source of truth is the root VERSION file.
 *
 * Resolution order:
 *   1. Root VERSION file (works in Node.js, Docker, dev)
 *   2. Root package.json version field
 *   3. Static import of own package.json (Bun binary fallback — static
 *      imports are bundled into the virtual FS by `bun build --compile`)
 */

import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Static import so Bun bundles it into the compiled binary
import pkg from '../package.json' with { type: 'json' };

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
    // ignore
  }

  // Last resort: statically imported own package.json (bundled in Bun binary)
  return pkg.version;
}

export const VERSION = readVersion();
