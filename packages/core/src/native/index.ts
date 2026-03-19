/**
 * Native Module Loader — conditional import of Rust napi-rs addon.
 *
 * Auto-detects the compiled .node addon at startup.
 * Falls back gracefully when native module is unavailable.
 *
 * Disable native module: SECUREYEOMAN_NO_NATIVE=1
 */

import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

export interface NativeModule {
  // Hashing
  sha256(data: Buffer): string;
  md5(data: Buffer): string;

  // HMAC
  hmacSha256(data: Buffer, key: Buffer): string;

  // Comparison
  secureCompare(a: Buffer, b: Buffer): boolean;

  // AES-256-GCM
  aes256GcmEncrypt(plaintext: Buffer, key: Buffer, iv: Buffer): Buffer;
  aes256GcmDecrypt(ciphertext: Buffer, key: Buffer, iv: Buffer): Buffer;

  // X25519
  x25519Keypair(): { privateKey: Buffer; publicKey: Buffer };
  x25519DiffieHellman(privateKey: Buffer, publicKey: Buffer): Buffer;

  // Ed25519
  ed25519Keypair(): { privateKey: Buffer; publicKey: Buffer };
  ed25519Sign(data: Buffer, privateKey: Buffer): Buffer;
  ed25519Verify(data: Buffer, signature: Buffer, publicKey: Buffer): boolean;

  // HKDF
  hkdfSha256(ikm: Buffer, salt: Buffer, info: Buffer, length: number): Buffer;

  // Random
  randomBytes(length: number): Buffer;

  // Hardware probing
  probeAccelerators(): string;
  probeAcceleratorsByFamily(family: string): string;
}

let _native: NativeModule | null = null;
let _loaded = false;

function tryLoad(): NativeModule | null {
  if (_loaded) return _native;
  _loaded = true;

  // Environment override
  if (process.env.SECUREYEOMAN_NO_NATIVE === '1') {
    return null;
  }

  // Bun compiled binary — napi compatibility is limited
  if (typeof (globalThis as Record<string, unknown>).Bun !== 'undefined') {
    return null;
  }

  const require = createRequire(import.meta.url);

  // Candidate paths for the .node addon
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const candidates = [
    // napi-rs convention: <package>/native/sy-napi.<platform>.node
    join(__dirname, '..', '..', 'native', 'sy-napi.node'),
    // Fallback: direct .node in native/
    join(__dirname, '..', '..', 'native', 'libsy_napi.node'),
    // Development: cargo build output copied to native/
    join(__dirname, '..', '..', 'native', 'sy_napi.node'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      try {
        const mod = require(candidate) as NativeModule;
        _native = mod;
        return _native;
      } catch {
        // Failed to load this candidate, try next
      }
    }
  }

  return null;
}

/**
 * The native Rust module, or null if unavailable.
 * Loaded lazily on first access.
 */
export const native: NativeModule | null = tryLoad();

/**
 * Whether the native module is loaded and active.
 */
export const nativeAvailable: boolean = native !== null;
