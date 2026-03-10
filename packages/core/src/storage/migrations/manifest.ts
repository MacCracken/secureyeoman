/**
 * Migration Manifest — loads all SQL migration files at startup.
 *
 * Uses fs.readFileSync so the migrations work in both the Node.js Docker
 * runtime (Dockerfile.dev) and the Bun compiled single binary. The build
 * script copies *.sql alongside the compiled *.js files so they are
 * always co-located with manifest.js at runtime.
 *
 * Schema is split by license tier:
 *   001_community.sql — Core platform (always applied)
 *   002_pro.sql       — Workflows, analytics, agents, RBAC (pro+)
 *   003_enterprise.sql — DLP, training, chaos, federated, IaC, etc.
 *
 * Incremental migrations (011+) carry a tier tag and are applied
 * only when the active tier permits.
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
  // Tier-split baselines (replace old 001_baseline + 002-007 incrementals)
  { id: '001_community', sql: readSql('001_community.sql'), tier: 'community' },
  { id: '002_pro', sql: readSql('002_pro.sql'), tier: 'pro' },
  { id: '003_enterprise', sql: readSql('003_enterprise.sql'), tier: 'enterprise' },
  // Incremental migrations with tier tags:
  { id: '008_synapse', sql: readSql('008_synapse.sql'), tier: 'enterprise' },
  { id: '009_security_hardening', sql: readSql('009_security_hardening.sql'), tier: 'community' },
  { id: '010_encrypt_idp_secrets', sql: readSql('010_encrypt_idp_secrets.sql'), tier: 'community' },
  { id: '011_sso_auth_codes', sql: readSql('011_sso_auth_codes.sql'), tier: 'community' },
];
