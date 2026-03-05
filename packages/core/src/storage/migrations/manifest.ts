/**
 * Migration Manifest — loads all SQL migration files at startup.
 *
 * Uses fs.readFileSync so the migrations work in both the Node.js Docker
 * runtime (Dockerfile.dev) and the Bun compiled single binary. The build
 * script copies *.sql alongside the compiled *.js files so they are
 * always co-located with manifest.js at runtime.
 *
 * 001_baseline.sql is the consolidated initial-release schema (v2026.3.5).
 * New migrations should be appended after it starting at 002_*.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// In a Bun compiled standalone binary, import.meta.url is set to the virtual
// filesystem path of the binary itself (e.g. "file:///$bunfs/root/<binary-name>"),
// not the source file's path. fileURLToPath would either throw or return the
// wrong directory, so readFileSync would look in the virtual FS root instead
// of the migrations source directory.
//
// When compiled, SQL files are shipped in a "migrations/" subdirectory
// co-located with the binary (e.g. /usr/local/bin/migrations/ in Docker).
// We detect the compiled context via the "/$bunfs/" substring (present in both
// the raw virtual-FS form and the file:// URL form) and resolve from
// the binary's real directory instead.
const isBunBinary = import.meta.url.includes('/$bunfs/');
const __dirname = isBunBinary
  ? join(dirname(process.execPath), 'migrations')
  : dirname(fileURLToPath(import.meta.url));

function readSql(filename: string): string {
  return readFileSync(join(__dirname, filename), 'utf-8');
}

export const MIGRATION_MANIFEST: { id: string; sql: string }[] = [
  { id: '001_baseline', sql: readSql('001_baseline.sql') },
];
