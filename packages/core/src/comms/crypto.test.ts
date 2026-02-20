import { describe, it, expect } from 'vitest';
import { AgentCrypto, sanitizePayload } from './crypto.js';
import type { MessagePayload } from './types.js';

function makePayload(content: string, metadata: Record<string, string> = {}): MessagePayload {
  return { type: 'task', content, metadata, timestamp: Date.now() };
}

describe('AgentCrypto', () => {
  it('creates new keypair on construction', () => {
    const crypto = new AgentCrypto();
    expect(crypto.publicKey).toBeTruthy();
    expect(crypto.signingPublicKey).toBeTruthy();
    expect(typeof crypto.publicKey).toBe('string');
    expect(typeof crypto.signingPublicKey).toBe('string');
  });

  it('generates unique keypairs for each instance', () => {
    const a = new AgentCrypto();
    const b = new AgentCrypto();
    expect(a.publicKey).not.toBe(b.publicKey);
    expect(a.signingPublicKey).not.toBe(b.signingPublicKey);
  });

  describe('encrypt/decrypt round-trip', () => {
    it('encrypts and decrypts simple payload', () => {
      const sender = new AgentCrypto();
      const recipient = new AgentCrypto();

      const payload = makePayload('Hello, agent!', { correlationId: 'abc-123' });
      const encrypted = sender.encrypt(payload, recipient.publicKey);

      expect(encrypted.ephemeralPublicKey).toBeTruthy();
      expect(encrypted.nonce).toBeTruthy();
      expect(encrypted.ciphertext).toBeTruthy();

      const decrypted = recipient.decrypt(encrypted);
      expect(decrypted.content).toBe('Hello, agent!');
      expect(decrypted.type).toBe('task');
      expect(decrypted.metadata.correlationId).toBe('abc-123');
    });

    it('decrypts correctly with multiple different payloads', () => {
      const sender = new AgentCrypto();
      const recipient = new AgentCrypto();

      const payloads = [
        makePayload('first message'),
        makePayload('second message'),
        makePayload('third message with unicode: 日本語'),
      ];

      for (const payload of payloads) {
        const encrypted = sender.encrypt(payload, recipient.publicKey);
        const decrypted = recipient.decrypt(encrypted);
        expect(decrypted.content).toBe(payload.content);
      }
    });

    it('produces different ciphertexts for same plaintext (ephemeral key)', () => {
      const sender = new AgentCrypto();
      const recipient = new AgentCrypto();
      const payload = makePayload('same message');

      const enc1 = sender.encrypt(payload, recipient.publicKey);
      const enc2 = sender.encrypt(payload, recipient.publicKey);

      // Ephemeral keys ensure different ciphertexts each time
      expect(enc1.ciphertext).not.toBe(enc2.ciphertext);
      expect(enc1.nonce).not.toBe(enc2.nonce);
    });

    it('throws when decrypting with wrong private key', () => {
      const sender = new AgentCrypto();
      const recipient = new AgentCrypto();
      const wrong = new AgentCrypto();

      const payload = makePayload('secret data');
      const encrypted = sender.encrypt(payload, recipient.publicKey);

      expect(() => wrong.decrypt(encrypted)).toThrow();
    });
  });

  describe('sign/verify', () => {
    it('signs data and verifies signature', () => {
      const crypto = new AgentCrypto();
      const data = Buffer.from('important message');
      const sig = crypto.signData(data);

      expect(sig).toBeTruthy();
      const valid = crypto.verifySignature(data, sig, crypto.signingPublicKey);
      expect(valid).toBe(true);
    });

    it('returns false for tampered data', () => {
      const crypto = new AgentCrypto();
      const data = Buffer.from('original message');
      const sig = crypto.signData(data);

      const tampered = Buffer.from('tampered message');
      const valid = crypto.verifySignature(tampered, sig, crypto.signingPublicKey);
      expect(valid).toBe(false);
    });

    it('returns false for signature from different key', () => {
      const a = new AgentCrypto();
      const b = new AgentCrypto();
      const data = Buffer.from('message');
      const sig = a.signData(data);

      const valid = b.verifySignature(data, sig, b.signingPublicKey);
      expect(valid).toBe(false);
    });

    it('returns false for invalid signature string', () => {
      const crypto = new AgentCrypto();
      const data = Buffer.from('message');
      // Create a valid signature from correct key but wrong data to get a valid format
      const wrongSig = crypto.signData(Buffer.from('other'));
      const valid = crypto.verifySignature(data, wrongSig, crypto.signingPublicKey);
      expect(valid).toBe(false);
    });
  });
});

describe('sanitizePayload', () => {
  it('redacts API key patterns', () => {
    const payload = makePayload('Use key sk-abc123defghijklmnopqrstu for the API call');
    const sanitized = sanitizePayload(payload);
    expect(sanitized.content).not.toContain('sk-abc123');
    expect(sanitized.content).toContain('[REDACTED]');
  });

  it('redacts Bearer tokens', () => {
    const payload = makePayload('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig');
    const sanitized = sanitizePayload(payload);
    expect(sanitized.content).toContain('[REDACTED]');
    expect(sanitized.content).not.toContain('eyJhbGciOiJIUzI1NiJ9');
  });

  it('redacts sensitive metadata keys', () => {
    const payload = makePayload('hello', {
      apiKey: 'my-secret-key',
      token: 'bearer-token',
      password: 'secret123',
      normalField: 'keep-me',
    });
    const sanitized = sanitizePayload(payload);
    expect(sanitized.metadata.apiKey).toBe('[REDACTED]');
    expect(sanitized.metadata.token).toBe('[REDACTED]');
    expect(sanitized.metadata.password).toBe('[REDACTED]');
    expect(sanitized.metadata.normalField).toBe('keep-me');
  });

  it('preserves original payload structure', () => {
    const payload = makePayload('clean message', { userId: 'u-1' });
    const sanitized = sanitizePayload(payload);
    expect(sanitized.type).toBe('task');
    expect(sanitized.content).toBe('clean message');
    expect(sanitized.metadata.userId).toBe('u-1');
  });

  it('does not mutate the original payload', () => {
    const payload = makePayload('message', { token: 'secret' });
    sanitizePayload(payload);
    expect(payload.metadata.token).toBe('secret');
  });

  it('redacts password patterns in content', () => {
    const payload = makePayload('password: mysecret123 for the database');
    const sanitized = sanitizePayload(payload);
    expect(sanitized.content).toContain('[REDACTED]');
    expect(sanitized.content).not.toContain('mysecret123');
  });
});
