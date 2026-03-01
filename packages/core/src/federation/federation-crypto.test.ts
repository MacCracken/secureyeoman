import { describe, it, expect } from 'vitest';
import {
  encryptSecret,
  decryptSecret,
  hashSecret,
  encryptBundle,
  decryptBundle,
} from './federation-crypto.js';

const MASTER = 'test-master-secret-32-chars-long!!';

describe('encryptSecret / decryptSecret', () => {
  it('round-trips plaintext correctly', () => {
    const plaintext = 'my-peer-shared-secret';
    const ciphertext = encryptSecret(plaintext, MASTER);
    expect(decryptSecret(ciphertext, MASTER)).toBe(plaintext);
  });

  it('produces different ciphertexts each call (random IV)', () => {
    const c1 = encryptSecret('same', MASTER);
    const c2 = encryptSecret('same', MASTER);
    expect(c1).not.toBe(c2);
  });

  it('produces valid base64', () => {
    const ct = encryptSecret('hello', MASTER);
    expect(() => Buffer.from(ct, 'base64')).not.toThrow();
  });

  it('throws on ciphertext too short', () => {
    const tooShort = Buffer.alloc(10).toString('base64');
    expect(() => decryptSecret(tooShort, MASTER)).toThrow('ciphertext too short');
  });

  it('throws on tampered ciphertext (wrong auth tag)', () => {
    const ct = encryptSecret('data', MASTER);
    const buf = Buffer.from(ct, 'base64');
    buf[20] ^= 0xff; // flip byte in auth tag region
    expect(() => decryptSecret(buf.toString('base64'), MASTER)).toThrow();
  });

  it('throws when master secret is wrong', () => {
    const ct = encryptSecret('secret', MASTER);
    expect(() => decryptSecret(ct, 'wrong-master-secret-different!!')).toThrow();
  });

  it('round-trips empty string', () => {
    const ct = encryptSecret('', MASTER);
    expect(decryptSecret(ct, MASTER)).toBe('');
  });

  it('round-trips unicode content', () => {
    const plaintext = '🔐 peer-secret-emoji';
    expect(decryptSecret(encryptSecret(plaintext, MASTER), MASTER)).toBe(plaintext);
  });
});

describe('hashSecret', () => {
  it('returns a 64-char hex string (SHA-256)', () => {
    const h = hashSecret('raw-secret');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic', () => {
    expect(hashSecret('same')).toBe(hashSecret('same'));
  });

  it('is different for different inputs', () => {
    expect(hashSecret('a')).not.toBe(hashSecret('b'));
  });
});

describe('encryptBundle / decryptBundle', () => {
  it('round-trips a JSON object', () => {
    const data = { name: 'FRIDAY', version: 2, active: true };
    const ct = encryptBundle(data, 'passphrase');
    expect(decryptBundle(ct, 'passphrase')).toEqual(data);
  });

  it('round-trips a nested array', () => {
    const data = [1, 'two', { three: 3 }];
    const ct = encryptBundle(data, 'pass');
    expect(decryptBundle(ct, 'pass')).toEqual(data);
  });

  it('produces different ciphertexts each call', () => {
    const c1 = encryptBundle({ x: 1 }, 'pass');
    const c2 = encryptBundle({ x: 1 }, 'pass');
    expect(c1).not.toBe(c2);
  });

  it('throws on wrong passphrase', () => {
    const ct = encryptBundle({ x: 1 }, 'correct');
    expect(() => decryptBundle(ct, 'wrong')).toThrow();
  });

  it('throws on too-short ciphertext', () => {
    const tooShort = Buffer.alloc(10).toString('base64');
    expect(() => decryptBundle(tooShort, 'pass')).toThrow('ciphertext too short');
  });

  it('throws on tampered bundle', () => {
    const ct = encryptBundle({ x: 1 }, 'pass');
    const buf = Buffer.from(ct, 'base64');
    buf[20] ^= 0xff;
    expect(() => decryptBundle(buf.toString('base64'), 'pass')).toThrow();
  });
});
