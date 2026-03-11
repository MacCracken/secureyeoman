/**
 * WebAuthn/FIDO2 Credential Storage — PgBaseStorage subclass.
 *
 * Stores WebAuthn credentials and challenges in PostgreSQL.
 */

import { PgBaseStorage } from '../storage/pg-base.js';

// ── Row types ──────────────────────────────────────────────────────

export interface WebAuthnCredentialRow {
  id: string;
  user_id: string;
  credential_id: string;
  public_key: string;
  counter: number;
  device_type: string | null;
  backed_up: boolean;
  transports: string[] | null;
  display_name: string | null;
  created_at: number;
  last_used_at: number | null;
}

export interface WebAuthnChallengeRow {
  id: string;
  challenge: string;
  user_id: string | null;
  type: string;
  expires_at: number;
  created_at: number;
}

// ── Storage ─────────────────────────────────────────────────────────

export class WebAuthnStorage extends PgBaseStorage {
  async storeCredential(credential: WebAuthnCredentialRow): Promise<void> {
    await this.execute(
      `INSERT INTO webauthn_credentials
         (id, user_id, credential_id, public_key, counter, device_type, backed_up, transports, display_name, created_at, last_used_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        credential.id,
        credential.user_id,
        credential.credential_id,
        credential.public_key,
        credential.counter,
        credential.device_type,
        credential.backed_up,
        credential.transports,
        credential.display_name,
        credential.created_at,
        credential.last_used_at,
      ]
    );
  }

  async getCredential(credentialId: string): Promise<WebAuthnCredentialRow | null> {
    return this.queryOne<WebAuthnCredentialRow>(
      'SELECT * FROM webauthn_credentials WHERE credential_id = $1',
      [credentialId]
    );
  }

  async getCredentialsByUser(userId: string): Promise<WebAuthnCredentialRow[]> {
    return this.queryMany<WebAuthnCredentialRow>(
      'SELECT * FROM webauthn_credentials WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
  }

  async updateCounter(credentialId: string, newCounter: number): Promise<void> {
    await this.execute('UPDATE webauthn_credentials SET counter = $1 WHERE credential_id = $2', [
      newCounter,
      credentialId,
    ]);
  }

  async updateLastUsed(credentialId: string): Promise<void> {
    await this.execute(
      'UPDATE webauthn_credentials SET last_used_at = $1 WHERE credential_id = $2',
      [Date.now(), credentialId]
    );
  }

  async deleteCredential(credentialId: string): Promise<number> {
    return this.execute('DELETE FROM webauthn_credentials WHERE credential_id = $1', [
      credentialId,
    ]);
  }

  async storeChallenge(
    id: string,
    challenge: string,
    userId: string | null,
    type: string,
    expiresAt: number
  ): Promise<void> {
    await this.execute(
      `INSERT INTO webauthn_challenges (id, challenge, user_id, type, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, challenge, userId, type, expiresAt, Date.now()]
    );
  }

  async getChallenge(challenge: string): Promise<WebAuthnChallengeRow | null> {
    return this.queryOne<WebAuthnChallengeRow>(
      'SELECT * FROM webauthn_challenges WHERE challenge = $1',
      [challenge]
    );
  }

  async deleteChallenge(id: string): Promise<void> {
    await this.execute('DELETE FROM webauthn_challenges WHERE id = $1', [id]);
  }

  async cleanExpiredChallenges(): Promise<number> {
    return this.execute('DELETE FROM webauthn_challenges WHERE expires_at < $1', [Date.now()]);
  }
}
