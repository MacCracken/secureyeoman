import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSecretsFilter } from './secrets-filter.js';

describe('createSecretsFilter', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore environment after each test
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  it('returns a function', () => {
    const filter = createSecretsFilter();
    expect(typeof filter).toBe('function');
  });

  it('passes through lines with no secrets when no env vars match', () => {
    // Ensure no matching env vars
    delete process.env.MY_API_KEY;
    const filter = createSecretsFilter();
    const line = 'This is a normal log line';
    expect(filter(line)).toBe('This is a normal log line');
  });

  it('redacts _API_KEY values from output', () => {
    process.env.MY_API_KEY = 'sk-abcdef1234567890';
    const filter = createSecretsFilter();
    const line = 'Using API key sk-abcdef1234567890 for request';
    expect(filter(line)).toBe('Using API key [REDACTED] for request');
  });

  it('redacts _SECRET values from output', () => {
    process.env.APP_SECRET = 'mysupersecret99';
    const filter = createSecretsFilter();
    const line = 'Signing with mysupersecret99';
    expect(filter(line)).toBe('Signing with [REDACTED]');
  });

  it('redacts _PASSWORD values from output', () => {
    process.env.DB_PASSWORD = 'p@ssw0rd!';
    const filter = createSecretsFilter();
    const line = 'Connected with password p@ssw0rd!';
    expect(filter(line)).toBe('Connected with password [REDACTED]');
  });

  it('redacts _TOKEN values from output', () => {
    process.env.ACCESS_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.token';
    const filter = createSecretsFilter();
    const line = 'Bearer eyJhbGciOiJIUzI1NiJ9.token';
    expect(filter(line)).toBe('Bearer [REDACTED]');
  });

  it('redacts SECUREYEOMAN_ prefixed values from output', () => {
    process.env.SECUREYEOMAN_INTERNAL = 'internalvalue42';
    const filter = createSecretsFilter();
    const line = 'Config: internalvalue42';
    expect(filter(line)).toBe('Config: [REDACTED]');
  });

  it('redacts multiple occurrences in a single line', () => {
    process.env.MY_API_KEY = 'key123';
    const filter = createSecretsFilter();
    const line = 'First: key123, Second: key123';
    expect(filter(line)).toBe('First: [REDACTED], Second: [REDACTED]');
  });

  it('skips env vars with value length < 2', () => {
    process.env.SHORT_API_KEY = 'x';
    const filter = createSecretsFilter();
    const line = 'value is x here';
    // Should NOT be redacted since value is too short
    expect(filter(line)).toBe('value is x here');
  });

  it('accepts additional patterns', () => {
    process.env.CUSTOM_CRED = 'customvalue99';
    const filter = createSecretsFilter(['^CUSTOM_']);
    const line = 'Using customvalue99';
    expect(filter(line)).toBe('Using [REDACTED]');
  });

  it('redacts longest values first to prevent substring issues', () => {
    process.env.LONG_API_KEY = 'longersecret';
    process.env.SHORT_API_KEY = 'long'; // substring of LONG_API_KEY
    const filter = createSecretsFilter();
    const line = 'value: longersecret';
    // 'longersecret' should be replaced as a whole
    const result = filter(line);
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('longersecret');
  });
});
