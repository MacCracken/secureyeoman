import { describe, it, expect, beforeEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';
import {
  encrypt,
  decrypt,
  serializeEncrypted,
  deserializeEncrypted,
  encryptValue,
  decryptValue,
  SecretStore,
} from './secrets.js';

// ── encrypt / decrypt ────────────────────────────────────────────────

describe('encrypt / decrypt', () => {
  it('round-trips a string value', () => {
    const masterKey = 'my-super-secret-master-key-32chars';
    const plaintext = 'Hello, World!';
    const encrypted = encrypt(plaintext, masterKey);
    const decrypted = decrypt(encrypted, masterKey);
    expect(decrypted.toString('utf-8')).toBe(plaintext);
  });

  it('round-trips a Buffer value', () => {
    const masterKey = 'my-super-secret-master-key-32chars';
    const buf = Buffer.from([1, 2, 3, 4, 5]);
    const encrypted = encrypt(buf, masterKey);
    const decrypted = decrypt(encrypted, masterKey);
    expect(decrypted).toEqual(buf);
  });

  it('produces different ciphertexts each time (random IV)', () => {
    const masterKey = 'my-super-secret-master-key-32chars';
    const e1 = encrypt('same text', masterKey);
    const e2 = encrypt('same text', masterKey);
    expect(e1.ciphertext).not.toEqual(e2.ciphertext);
  });

  it('throws when decrypting with wrong key', () => {
    const encrypted = encrypt('secret', 'correct-master-key-for-testing-!');
    expect(() => decrypt(encrypted, 'wrong-master-key-for-testing-!!!!')).toThrow();
  });
});

// ── serializeEncrypted / deserializeEncrypted ─────────────────────────

describe('serializeEncrypted / deserializeEncrypted', () => {
  it('round-trips encrypted data', () => {
    const masterKey = 'my-super-secret-master-key-32chars';
    const encrypted = encrypt('test data', masterKey);
    const serialized = serializeEncrypted(encrypted);
    const deserialized = deserializeEncrypted(serialized);
    const decrypted = decrypt(deserialized, masterKey);
    expect(decrypted.toString('utf-8')).toBe('test data');
  });

  it('throws on invalid magic bytes', () => {
    const buf = Buffer.from('INVALID_MAGIC_BYTES');
    expect(() => deserializeEncrypted(buf)).toThrow('Invalid encrypted file format');
  });

  it('throws on unsupported version', () => {
    const masterKey = 'my-super-secret-master-key-32chars';
    const encrypted = encrypt('test', masterKey);
    const serialized = serializeEncrypted(encrypted);
    // Overwrite version byte (byte 4) with version 2
    serialized[4] = 2;
    expect(() => deserializeEncrypted(serialized)).toThrow('Unsupported encryption version');
  });
});

// ── encryptValue / decryptValue ───────────────────────────────────────

describe('encryptValue / decryptValue', () => {
  it('round-trips a string through base64', () => {
    const key = 'my-super-secret-key-for-value-enc';
    const value = 'my-secret-api-key';
    const encrypted = encryptValue(value, key);
    expect(typeof encrypted).toBe('string');
    const decrypted = decryptValue(encrypted, key);
    expect(decrypted).toBe(value);
  });

  it('produces different base64 strings each time', () => {
    const key = 'my-super-secret-key-for-value-enc';
    const e1 = encryptValue('same', key);
    const e2 = encryptValue('same', key);
    expect(e1).not.toBe(e2);
  });
});

// ── SecretStore ──────────────────────────────────────────────────────

describe('SecretStore', () => {
  let tmpDir: string;
  let storePath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'secrets-test-'));
    storePath = join(tmpDir, 'secrets.enc');
  });

  function cleanup() {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }

  it('throws when master key is too short', () => {
    expect(() => new SecretStore({ storePath, masterKey: 'short' })).toThrow(
      'Master key must be at least 16 characters'
    );
    cleanup();
  });

  it('load() starts empty when file does not exist', async () => {
    const store = new SecretStore({ storePath, masterKey: 'my-16char-key!!!!' });
    await store.load();
    expect(store.keys()).toHaveLength(0);
    cleanup();
  });

  it('set() and get() round-trip a secret', async () => {
    const store = new SecretStore({ storePath, masterKey: 'my-16char-key!!!!' });
    await store.load();
    await store.set('MY_API_KEY', 'sk-secret-value');
    expect(store.get('MY_API_KEY')).toBe('sk-secret-value');
    cleanup();
  });

  it('persists secrets to disk and reloads', async () => {
    const masterKey = 'my-persistent-key-16';
    const store1 = new SecretStore({ storePath, masterKey });
    await store1.load();
    await store1.set('TOKEN', 'abc123');

    const store2 = new SecretStore({ storePath, masterKey });
    await store2.load();
    expect(store2.get('TOKEN')).toBe('abc123');
    cleanup();
  });

  it('has() returns true for existing secrets', async () => {
    const store = new SecretStore({ storePath, masterKey: 'my-16char-key!!!!' });
    await store.load();
    await store.set('KEY', 'value');
    expect(store.has('KEY')).toBe(true);
    expect(store.has('MISSING')).toBe(false);
    cleanup();
  });

  it('delete() removes a secret', async () => {
    const store = new SecretStore({ storePath, masterKey: 'my-16char-key!!!!' });
    await store.load();
    await store.set('KEY', 'value');
    const deleted = await store.delete('KEY');
    expect(deleted).toBe(true);
    expect(store.has('KEY')).toBe(false);
    cleanup();
  });

  it('delete() returns false for non-existent secret', async () => {
    const store = new SecretStore({ storePath, masterKey: 'my-16char-key!!!!' });
    await store.load();
    const deleted = await store.delete('MISSING');
    expect(deleted).toBe(false);
    cleanup();
  });

  it('keys() returns all stored keys', async () => {
    const store = new SecretStore({ storePath, masterKey: 'my-16char-key!!!!' });
    await store.load();
    await store.set('A', '1');
    await store.set('B', '2');
    const keys = store.keys();
    expect(keys).toContain('A');
    expect(keys).toContain('B');
    cleanup();
  });

  it('clear() resets the store', async () => {
    const store = new SecretStore({ storePath, masterKey: 'my-16char-key!!!!' });
    await store.load();
    await store.set('KEY', 'value');
    store.clear();
    expect(() => store.get('KEY')).toThrow('not loaded');
    cleanup();
  });

  it('throws when get() called before load()', () => {
    const store = new SecretStore({ storePath, masterKey: 'my-16char-key!!!!' });
    expect(() => store.get('KEY')).toThrow('not loaded');
    cleanup();
  });

  it('load() fails with wrong master key', async () => {
    const store1 = new SecretStore({ storePath, masterKey: 'my-16char-key!!!!' });
    await store1.load();
    await store1.set('KEY', 'val');

    const store2 = new SecretStore({ storePath, masterKey: 'wrong-master-key!!' });
    await expect(store2.load()).rejects.toThrow('Failed to decrypt');
    cleanup();
  });
});
