/**
 * TEE Encryption — TypeScript wrapper for the Rust NAPI bindings.
 *
 * Provides AES-256-GCM model weight sealing with hardware-backed keys.
 * Falls back to error when native module is unavailable (TEE requires native crypto).
 */

import { native } from './index.js';

export type TeeKeySource = 'tpm' | 'tee' | 'keyring';

/**
 * Seal (encrypt) data with the specified key source.
 * Requires native module — TEE operations cannot be done in pure JS.
 */
export function seal(plaintext: Buffer, keySource: TeeKeySource): Buffer {
  if (native?.teeSeal) {
    return native.teeSeal(plaintext, keySource);
  }
  throw new Error('TEE sealing requires native module (sy-napi)');
}

/**
 * Unseal (decrypt) sealed data. Optional key source override.
 * Requires native module.
 */
export function unseal(sealed: Buffer, keySourceOverride?: TeeKeySource): Buffer {
  if (native?.teeUnseal) {
    return native.teeUnseal(sealed, keySourceOverride ?? null);
  }
  throw new Error('TEE unsealing requires native module (sy-napi)');
}

/**
 * Check if data starts with the SEALED_V1 magic bytes.
 * Falls back to a JS check when native is unavailable.
 */
export function isSealed(data: Buffer): boolean {
  if (native?.teeIsSealed) {
    return native.teeIsSealed(data);
  }
  // JS fallback: check magic bytes
  const magic = Buffer.from('SEALED_V1');
  return data.length >= magic.length && data.subarray(0, magic.length).equals(magic);
}

/**
 * Clear cached encryption keys from the TEE manager.
 */
export function clearKeyCache(): void {
  if (native?.teeClearKeyCache) {
    native.teeClearKeyCache();
  }
}
