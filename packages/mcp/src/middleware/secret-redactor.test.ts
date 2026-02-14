import { describe, it, expect } from 'vitest';
import { createSecretRedactor } from './secret-redactor.js';

describe('secret-redactor', () => {
  const redactor = createSecretRedactor();

  describe('sensitive keys', () => {
    it('should redact password fields', () => {
      const result = redactor.redact({ password: 'secret123' });
      expect(result).toEqual({ password: '[REDACTED]' });
    });

    it('should redact token fields', () => {
      const result = redactor.redact({ token: 'abc123', accessToken: 'xyz789' });
      expect(result).toEqual({ token: '[REDACTED]', accessToken: '[REDACTED]' });
    });

    it('should redact api_key fields', () => {
      const result = redactor.redact({ api_key: 'my-key', apiKey: 'another-key' });
      expect(result).toEqual({ api_key: '[REDACTED]', apiKey: '[REDACTED]' });
    });

    it('should redact secret fields', () => {
      const result = redactor.redact({ secret: 'shh', secretKey: 'super-secret' });
      expect(result).toEqual({ secret: '[REDACTED]', secretKey: '[REDACTED]' });
    });

    it('should redact tokenSecret', () => {
      const result = redactor.redact({ tokenSecret: 'secret-value-here' });
      expect(result).toEqual({ tokenSecret: '[REDACTED]' });
    });

    it('should not redact non-sensitive keys', () => {
      const result = redactor.redact({ name: 'test', id: '123' });
      expect(result).toEqual({ name: 'test', id: '123' });
    });
  });

  describe('string patterns', () => {
    it('should redact JWT tokens in strings', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123def';
      const result = redactor.redact(`Token: ${jwt}`);
      expect(result).not.toContain(jwt);
      expect(result).toContain('[REDACTED]');
    });

    it('should redact Bearer tokens', () => {
      const result = redactor.redact('Authorization: Bearer my_secret_token_here');
      expect(result).toContain('[REDACTED]');
    });

    it('should redact Basic auth', () => {
      const result = redactor.redact('Authorization: Basic dXNlcjpwYXNz');
      expect(result).toContain('[REDACTED]');
    });

    it('should redact AWS access keys', () => {
      const result = redactor.redact('key: AKIAIOSFODNN7EXAMPLE');
      expect(result).toContain('[REDACTED]');
    });

    it('should redact private keys', () => {
      const result = redactor.redact('-----BEGIN PRIVATE KEY-----\nMIIEvgIBAD...\n-----END PRIVATE KEY-----');
      expect(result).toContain('[REDACTED]');
    });

    it('should not redact normal strings', () => {
      const result = redactor.redact('Hello, this is a normal message');
      expect(result).toBe('Hello, this is a normal message');
    });
  });

  describe('nested structures', () => {
    it('should redact deeply nested sensitive keys', () => {
      const result = redactor.redact({
        config: {
          auth: { password: 'secret', token: 'jwt' },
          name: 'test',
        },
      });
      expect(result).toEqual({
        config: {
          auth: { password: '[REDACTED]', token: '[REDACTED]' },
          name: 'test',
        },
      });
    });

    it('should redact strings in arrays', () => {
      const result = redactor.redact(['normal', 'Bearer secret_token_here']);
      expect((result as string[])[0]).toBe('normal');
      expect((result as string[])[1]).toContain('[REDACTED]');
    });
  });

  describe('non-string/object values', () => {
    it('should pass through numbers', () => {
      expect(redactor.redact(42)).toBe(42);
    });

    it('should pass through booleans', () => {
      expect(redactor.redact(true)).toBe(true);
    });

    it('should pass through null', () => {
      expect(redactor.redact(null)).toBeNull();
    });

    it('should pass through undefined', () => {
      expect(redactor.redact(undefined)).toBeUndefined();
    });
  });
});
