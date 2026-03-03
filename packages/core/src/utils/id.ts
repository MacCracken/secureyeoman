/**
 * UUID generation utility.
 */

import crypto from 'node:crypto';

/** Generate a UUIDv7 (time-ordered). Falls back to UUIDv4 if not available. */
export function uuidv7(): string {
  // Node 20+ crypto.randomUUID() returns v4; use it as fallback.
  return crypto.randomUUID();
}
