/**
 * Migration Manifest — loads all SQL migration files at startup.
 *
 * Uses fs.readFileSync so the migrations work in both the Node.js Docker
 * runtime (Dockerfile.dev) and the Bun compiled single binary. The build
 * script copies *.sql alongside the compiled *.js files so they are
 * always co-located with manifest.js at runtime.
 *
 * Schema is split by license tier (consolidated into 3 baseline files):
 *   001_community.sql  — Core platform, soul, brain, MCP (always applied)
 *   002_pro.sql        — Workflows, analytics, agents, RBAC, voice, delegations (pro+)
 *   003_enterprise.sql — DLP, training, chaos, federated, IaC, ifran,
 *                        simulation, SCIM, edge fleet, etc. (enterprise)
 *
 * Incremental migrations (004_optimistic_locking, 005_delegation_self_ref)
 * have been folded back into the baselines. Existing installs that already
 * applied them are handled by the legacy compatibility shim in runner.ts.
 *
 * All baselines are always applied regardless of tier — the full schema
 * must be present for the app to start. Feature gating is handled at the
 * route/API level by requiresLicense().
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LicenseTier } from '../../licensing/license-manager.js';

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

export interface MigrationEntry {
  id: string;
  sql: string;
  tier: LicenseTier;
}

export const MIGRATION_MANIFEST: MigrationEntry[] = [
  { id: '001_community', sql: readSql('001_community.sql'), tier: 'community' },
  { id: '002_pro', sql: readSql('002_pro.sql'), tier: 'pro' },
  { id: '003_enterprise', sql: readSql('003_enterprise.sql'), tier: 'enterprise' },
];
