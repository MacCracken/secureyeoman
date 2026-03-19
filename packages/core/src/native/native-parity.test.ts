/**
 * Native Parity Tests — verify Rust and TypeScript crypto produce identical results.
 *
 * These tests run both code paths (native + fallback) with the same inputs
 * and assert they produce identical outputs.
 */

import { describe, it, expect } from 'vitest';
import {
  createHash,
  createHmac,
  timingSafeEqual,
  randomBytes as nodeRandomBytes,
} from 'node:crypto';

// Import the wrapped functions (which may use native)
import { sha256, md5, hmacSha256, secureCompare } from '../utils/crypto.js';

// Direct TS implementations for comparison
function tsSha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function tsMd5(data: string | Buffer): string {
  return createHash('md5').update(data).digest('hex');
}

function tsHmacSha256(data: string | Buffer, key: string | Buffer): string {
  return createHmac('sha256', key).update(data).digest('hex');
}

function tsSecureCompare(a: string | Buffer, b: string | Buffer): boolean {
  const bufA = typeof a === 'string' ? Buffer.from(a) : a;
  const bufB = typeof b === 'string' ? Buffer.from(b) : b;
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

describe('native parity', () => {
  const testVectors = [
    '',
    'hello',
    'SecureYeoman',
    'The quick brown fox jumps over the lazy dog',
    '\x00\x01\x02\x03', // binary
    'a'.repeat(10_000), // large input
  ];

  describe('sha256', () => {
    for (const input of testVectors) {
      it(`matches for "${input.slice(0, 30)}${input.length > 30 ? '...' : ''}"`, () => {
        expect(sha256(input)).toBe(tsSha256(input));
      });
    }

    it('matches for random buffers', () => {
      for (let i = 0; i < 10; i++) {
        const buf = nodeRandomBytes(Math.floor(Math.random() * 1024));
        expect(sha256(buf)).toBe(tsSha256(buf));
      }
    });
  });

  describe('md5', () => {
    for (const input of testVectors) {
      it(`matches for "${input.slice(0, 30)}${input.length > 30 ? '...' : ''}"`, () => {
        expect(md5(input)).toBe(tsMd5(input));
      });
    }
  });

  describe('hmacSha256', () => {
    const keys = ['secret', 'key', nodeRandomBytes(32).toString('hex')];
    for (const key of keys) {
      for (const input of testVectors.slice(0, 3)) {
        it(`matches for input="${input}" key="${key.slice(0, 10)}..."`, () => {
          expect(hmacSha256(input, key)).toBe(tsHmacSha256(input, key));
        });
      }
    }
  });

  describe('secureCompare', () => {
    it('matches for equal strings', () => {
      expect(secureCompare('hello', 'hello')).toBe(tsSecureCompare('hello', 'hello'));
    });

    it('matches for unequal strings', () => {
      expect(secureCompare('hello', 'world')).toBe(tsSecureCompare('hello', 'world'));
    });

    it('matches for different lengths', () => {
      expect(secureCompare('hello', 'hell')).toBe(tsSecureCompare('hello', 'hell'));
    });
  });
});
