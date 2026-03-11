/**
 * BreakGlassManager — Emergency access for when normal authentication is unavailable.
 *
 * Workflow:
 *   1. Admin calls generateRecoveryKey() once. The raw 256-bit key is printed
 *      and stored offline. Only its SHA-256 hash is persisted to the DB.
 *   2. In an emergency, call activateBreakGlass(rawKey, ip) to verify the key
 *      and receive a 1-hour admin JWT with type: 'break_glass'.
 *   3. After recovery, rotate the key via generateRecoveryKey() again and
 *      revoke any active sessions.
 *
 * All operations are recorded to the audit chain.
 */

import { randomBytes } from 'node:crypto';
import { SignJWT } from 'jose';
import { sha256, secureCompare, uuidv7 } from '../utils/crypto.js';
import type { BreakGlassStorage } from './break-glass-storage.js';
import type { AuditChain } from '../logging/audit-chain.js';
import type { SecureLogger } from '../logging/logger.js';

// ── Constants ────────────────────────────────────────────────────────

const BREAK_GLASS_SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour
const BREAK_GLASS_SESSION_TTL_SECONDS = 3600;
const BREAK_GLASS_SUB = 'break_glass';
const BREAK_GLASS_ROLE = 'admin';

// ── Public types ─────────────────────────────────────────────────────

export interface BreakGlassSession {
  id: string;
  recoveryKeyId: string;
  createdAt: number;
  expiresAt: number;
  ipAddress: string | null;
  revokedAt: number | null;
  isActive: boolean;
}

export interface BreakGlassActivateResult {
  token: string;
  expiresAt: number;
  sessionId: string;
}

// ── Config / deps ────────────────────────────────────────────────────

export interface BreakGlassConfig {
  /** HMAC secret used for signing break-glass JWTs (same as main token secret) */
  tokenSecret: string;
  /** JWT issuer (default: 'secureyeoman') */
  jwtIssuer?: string;
  /** JWT audience (default: 'secureyeoman-api') */
  jwtAudience?: string;
}

export interface BreakGlassManagerDeps {
  storage: BreakGlassStorage;
  auditChain: AuditChain;
  logger: SecureLogger;
}

// ── Manager ──────────────────────────────────────────────────────────

export class BreakGlassManager {
  private readonly secret: Uint8Array;
  private readonly jwtIssuer: string;
  private readonly jwtAudience: string;
  private readonly deps: BreakGlassManagerDeps;

  constructor(config: BreakGlassConfig, deps: BreakGlassManagerDeps) {
    this.secret = new TextEncoder().encode(config.tokenSecret);
    this.jwtIssuer = config.jwtIssuer ?? 'secureyeoman';
    this.jwtAudience = config.jwtAudience ?? 'secureyeoman-api';
    this.deps = deps;
  }

  /**
   * Generate a new 256-bit recovery key.
   *
   * The raw hex key is returned ONCE to the caller for offline storage.
   * Only its SHA-256 hash is written to the database.
   *
   * If a previous key exists it is marked as rotated before the new one
   * is inserted, so there is always at most one active key.
   */
  async generateRecoveryKey(): Promise<string> {
    const rawKey = randomBytes(32).toString('hex'); // 256-bit = 64 hex chars
    const keyHash = sha256(rawKey);
    const id = uuidv7();
    const now = Date.now();

    // Rotate any existing active key
    const existing = await this.deps.storage.getKeyHash();
    if (existing) {
      await this.deps.storage.rotateKey(existing.id, now);
    }

    await this.deps.storage.storeKeyHash(id, keyHash);

    await this.audit('break_glass_key_generated', 'Break-glass recovery key generated', {
      keyId: id,
    });

    this.deps.logger.warn(
      { keyId: id },
      'Break-glass recovery key generated — store the raw key securely offline'
    );

    return rawKey;
  }

  /**
   * Returns true if a recovery key has been generated and is active.
   */
  async hasRecoveryKey(): Promise<boolean> {
    const row = await this.deps.storage.getKeyHash();
    return row !== null;
  }

  /**
   * Activate a break-glass session using the raw recovery key.
   *
   * Verifies the key via constant-time comparison against the stored hash,
   * creates a 1-hour session, records to the audit chain, and returns a JWT
   * with `type: 'break_glass'`.
   */
  async activateBreakGlass(rawKey: string, ip: string): Promise<BreakGlassActivateResult> {
    const keyRow = await this.deps.storage.getKeyHash();

    if (!keyRow) {
      await this.audit('break_glass_activation_failed', 'Break-glass activation failed: no key', {
        ip,
        reason: 'no_key',
      });
      throw new BreakGlassError('No break-glass recovery key has been configured', 401);
    }

    const providedHash = sha256(rawKey);
    const valid = secureCompare(providedHash, keyRow.key_hash);

    if (!valid) {
      await this.audit(
        'break_glass_activation_failed',
        'Break-glass activation failed: invalid key',
        { ip, reason: 'invalid_key' }
      );
      this.deps.logger.warn({ ip }, 'Break-glass activation attempt with invalid key');
      throw new BreakGlassError('Invalid recovery key', 401);
    }

    const sessionId = uuidv7();
    const now = Date.now();
    const expiresAt = now + BREAK_GLASS_SESSION_TTL_MS;

    await this.deps.storage.createSession({
      id: sessionId,
      recovery_key_id: keyRow.id,
      created_at: now,
      expires_at: expiresAt,
      ip_address: ip,
      revoked_at: null,
    });

    const token = await new SignJWT({
      sub: BREAK_GLASS_SUB,
      role: BREAK_GLASS_ROLE,
      type: 'break_glass',
      sessionId,
      permissions: ['*'],
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setIssuer(this.jwtIssuer)
      .setAudience(this.jwtAudience)
      .setExpirationTime(`${BREAK_GLASS_SESSION_TTL_SECONDS}s`)
      .sign(this.secret);

    await this.audit('break_glass_activated', 'Break-glass session activated', {
      sessionId,
      ip,
      expiresAt,
    });

    this.deps.logger.warn({ sessionId, ip, expiresAt }, 'Break-glass session activated');

    return { token, expiresAt, sessionId };
  }

  /**
   * List all break-glass sessions for audit review.
   */
  async listSessions(): Promise<BreakGlassSession[]> {
    const rows = await this.deps.storage.listSessions();
    const now = Date.now();
    return rows.map((r) => ({
      id: r.id,
      recoveryKeyId: r.recovery_key_id,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      ipAddress: r.ip_address,
      revokedAt: r.revoked_at,
      isActive: r.revoked_at === null && r.expires_at > now,
    }));
  }

  /**
   * Early revocation of a break-glass session.
   */
  async revokeSession(sessionId: string): Promise<boolean> {
    const ok = await this.deps.storage.revokeSession(sessionId, Date.now());

    if (ok) {
      await this.audit('break_glass_session_revoked', 'Break-glass session revoked', {
        sessionId,
      });
      this.deps.logger.info({ sessionId }, 'Break-glass session revoked');
    }

    return ok;
  }

  // ── Private helpers ───────────────────────────────────────────────

  private async audit(
    event: string,
    message: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    try {
      await this.deps.auditChain.record({
        event,
        level: event.includes('failed') || event.includes('activated') ? 'warn' : 'info',
        message,
        metadata,
      });
    } catch (err) {
      this.deps.logger.error(
        { error: err instanceof Error ? err.message : 'Unknown' },
        'Failed to record break-glass audit event'
      );
    }
  }
}

// ── Error type ────────────────────────────────────────────────────────

export class BreakGlassError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'BreakGlassError';
    this.statusCode = statusCode;
  }
}
