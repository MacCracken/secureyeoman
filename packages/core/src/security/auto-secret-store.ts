/**
 * AutoSecretStore — persists auto-generated cryptographic secrets to PostgreSQL
 * so they survive container restarts without environment variables.
 *
 * Values are encrypted at rest using AES-256-GCM keyed by the admin password
 * (the one env var that is always present). This avoids a chicken-and-egg
 * problem since the encryption key itself is one of the secrets being stored.
 *
 * Uses the `internal.auto_secrets` table (migration 021).
 */

import { getPool } from '../storage/pg-pool.js';
import { encryptValue, decryptValue } from './secrets.js';

function getEncKey(): string {
  const adminPass = process.env.SECUREYEOMAN_ADMIN_PASSWORD;
  if (!adminPass) {
    throw new Error('SECUREYEOMAN_ADMIN_PASSWORD is required for auto-secret encryption');
  }
  return adminPass;
}

/** Load and decrypt a secret from DB. Returns undefined if not found. */
export async function loadAutoSecret(name: string): Promise<string | undefined> {
  const pool = getPool();
  const { rows } = await pool.query<{ value: string }>(
    'SELECT value FROM internal.auto_secrets WHERE name = $1',
    [name]
  );
  if (!rows[0]?.value) return undefined;
  return decryptValue(rows[0].value, getEncKey());
}

/** Encrypt and persist a secret to DB (upsert). */
export async function saveAutoSecret(name: string, value: string): Promise<void> {
  const pool = getPool();
  const encrypted = encryptValue(value, getEncKey());
  await pool.query(
    `INSERT INTO internal.auto_secrets (name, value)
     VALUES ($1, $2)
     ON CONFLICT (name) DO UPDATE SET value = $2, updated_at = now()`,
    [name, encrypted]
  );
}
