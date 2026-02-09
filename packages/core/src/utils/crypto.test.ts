import { describe, it, expect } from 'vitest';
import {
  sha256,
  hmacSha256,
  secureCompare,
  randomHex,
  uuidv7,
  generateSecureToken,
  sanitizeForLogging,
} from './crypto.js';

describe('sha256', () => {
  it('should hash a string correctly', () => {
    const hash = sha256('hello world');
    expect(hash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
  });

  it('should hash a buffer correctly', () => {
    const hash = sha256(Buffer.from('hello world'));
    expect(hash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
  });

  it('should produce different hashes for different inputs', () => {
    const hash1 = sha256('hello');
    const hash2 = sha256('world');
    expect(hash1).not.toBe(hash2);
  });

  it('should produce consistent hashes for the same input', () => {
    const hash1 = sha256('test input');
    const hash2 = sha256('test input');
    expect(hash1).toBe(hash2);
  });

  it('should return a 64-character hex string', () => {
    const hash = sha256('test');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('hmacSha256', () => {
  it('should generate a valid HMAC signature', () => {
    const signature = hmacSha256('data', 'secret-key');
    expect(signature).toHaveLength(64);
    expect(signature).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should produce different signatures for different keys', () => {
    const sig1 = hmacSha256('data', 'key1');
    const sig2 = hmacSha256('data', 'key2');
    expect(sig1).not.toBe(sig2);
  });

  it('should produce different signatures for different data', () => {
    const sig1 = hmacSha256('data1', 'key');
    const sig2 = hmacSha256('data2', 'key');
    expect(sig1).not.toBe(sig2);
  });

  it('should produce consistent signatures for the same inputs', () => {
    const sig1 = hmacSha256('data', 'key');
    const sig2 = hmacSha256('data', 'key');
    expect(sig1).toBe(sig2);
  });

  it('should work with buffer inputs', () => {
    const signature = hmacSha256(Buffer.from('data'), Buffer.from('key'));
    expect(signature).toHaveLength(64);
  });
});

describe('secureCompare', () => {
  it('should return true for identical strings', () => {
    expect(secureCompare('secret', 'secret')).toBe(true);
  });

  it('should return false for different strings', () => {
    expect(secureCompare('secret', 'different')).toBe(false);
  });

  it('should return false for strings with different lengths', () => {
    expect(secureCompare('short', 'longer string')).toBe(false);
  });

  it('should work with buffers', () => {
    const buf1 = Buffer.from('test');
    const buf2 = Buffer.from('test');
    expect(secureCompare(buf1, buf2)).toBe(true);
  });

  it('should return false for different buffers', () => {
    const buf1 = Buffer.from('test1');
    const buf2 = Buffer.from('test2');
    expect(secureCompare(buf1, buf2)).toBe(false);
  });

  it('should handle empty strings', () => {
    expect(secureCompare('', '')).toBe(true);
  });
});

describe('randomHex', () => {
  it('should generate hex string of correct length', () => {
    const hex = randomHex(16);
    expect(hex).toHaveLength(32); // 16 bytes = 32 hex chars
  });

  it('should generate different values each time', () => {
    const hex1 = randomHex(16);
    const hex2 = randomHex(16);
    expect(hex1).not.toBe(hex2);
  });

  it('should only contain hex characters', () => {
    const hex = randomHex(32);
    expect(hex).toMatch(/^[a-f0-9]+$/);
  });

  it('should handle various byte sizes', () => {
    expect(randomHex(1)).toHaveLength(2);
    expect(randomHex(8)).toHaveLength(16);
    expect(randomHex(64)).toHaveLength(128);
  });
});

describe('uuidv7', () => {
  it('should generate a valid UUID format', () => {
    const uuid = uuidv7();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('should have version 7 in the correct position', () => {
    const uuid = uuidv7();
    expect(uuid[14]).toBe('7');
  });

  it('should have variant bits set correctly (8, 9, a, or b)', () => {
    const uuid = uuidv7();
    expect(['8', '9', 'a', 'b']).toContain(uuid[19]);
  });

  it('should generate unique UUIDs', () => {
    const uuids = new Set(Array.from({ length: 1000 }, () => uuidv7()));
    expect(uuids.size).toBe(1000);
  });

  it('should be time-sortable (later UUIDs are greater)', async () => {
    const uuid1 = uuidv7();
    await new Promise((resolve) => setTimeout(resolve, 2));
    const uuid2 = uuidv7();
    expect(uuid1 < uuid2).toBe(true);
  });

  it('should have correct length', () => {
    const uuid = uuidv7();
    expect(uuid).toHaveLength(36);
  });
});

describe('generateSecureToken', () => {
  it('should generate a base64url-encoded token', () => {
    const token = generateSecureToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('should generate tokens of correct length', () => {
    // 32 bytes = approximately 43 base64 chars
    const token = generateSecureToken(32);
    expect(token.length).toBeGreaterThanOrEqual(42);
  });

  it('should generate unique tokens', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateSecureToken()));
    expect(tokens.size).toBe(100);
  });

  it('should respect custom byte length', () => {
    const token16 = generateSecureToken(16);
    const token64 = generateSecureToken(64);
    expect(token64.length).toBeGreaterThan(token16.length);
  });
});

describe('sanitizeForLogging', () => {
  it('should return null and undefined as-is', () => {
    expect(sanitizeForLogging(null)).toBeNull();
    expect(sanitizeForLogging(undefined)).toBeUndefined();
  });

  it('should return numbers and booleans as-is', () => {
    expect(sanitizeForLogging(42)).toBe(42);
    expect(sanitizeForLogging(true)).toBe(true);
  });

  it('should redact API keys in strings', () => {
    const input = 'API key: sk-abc123def456ghi789jkl012mno345pqr678stu';
    const result = sanitizeForLogging(input);
    expect(result).toContain('[REDACTED_API_KEY]');
    expect(result).not.toContain('sk-abc123');
  });

  it('should redact Bearer tokens', () => {
    const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload';
    const result = sanitizeForLogging(input);
    expect(result).toContain('[REDACTED_TOKEN]');
    expect(result).not.toContain('eyJhbG');
  });

  it('should redact passwords', () => {
    const input = 'password: mysecretpassword123';
    const result = sanitizeForLogging(input);
    expect(result).toContain('[REDACTED_PASSWORD]');
    expect(result).not.toContain('mysecret');
  });

  it('should redact private keys', () => {
    const input = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Z3US...
-----END RSA PRIVATE KEY-----`;
    const result = sanitizeForLogging(input);
    expect(result).toContain('[REDACTED_PRIVATE_KEY]');
    expect(result).not.toContain('MIIEowI');
  });

  it('should redact sensitive object keys', () => {
    const input = {
      username: 'john',
      password: 'secret123',
      apiKey: 'key-abc123',
      token: 'token-xyz',
    };
    const result = sanitizeForLogging(input) as Record<string, unknown>;
    expect(result.username).toBe('john');
    expect(result.password).toBe('[REDACTED]');
    expect(result.apiKey).toBe('[REDACTED]');
    expect(result.token).toBe('[REDACTED]');
  });

  it('should handle nested objects', () => {
    const input = {
      user: {
        name: 'john',
        credentials: {
          password: 'secret',
        },
      },
    };
    const result = sanitizeForLogging(input) as Record<string, unknown>;
    const user = result.user as Record<string, unknown>;
    const credentials = user.credentials as Record<string, unknown>;
    expect(user.name).toBe('john');
    expect(credentials.password).toBe('[REDACTED]');
  });

  it('should handle arrays', () => {
    const input = ['normal', 'password: secret', 'another'];
    const result = sanitizeForLogging(input) as string[];
    expect(result[0]).toBe('normal');
    expect(result[1]).toContain('[REDACTED_PASSWORD]');
    expect(result[2]).toBe('another');
  });

  it('should not modify non-sensitive strings', () => {
    const input = 'This is a normal message without secrets';
    expect(sanitizeForLogging(input)).toBe(input);
  });
});
