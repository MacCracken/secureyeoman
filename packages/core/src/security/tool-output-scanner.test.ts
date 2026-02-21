/**
 * ToolOutputScanner tests
 */

import { describe, it, expect, vi } from 'vitest';
import {
  ToolOutputScanner,
  BUILTIN_PATTERNS,
  buildSecretStorePatterns,
  createScannerWithSecrets,
} from './tool-output-scanner.js';

// ── Helper ────────────────────────────────────────────────────────────────────

function scanner(logger?: unknown): ToolOutputScanner {
  return new ToolOutputScanner({ logger: logger as never });
}

function clean(text: string) {
  return scanner().scan(text).text;
}

function redacted(text: string) {
  return scanner().scan(text).redacted;
}

// ── Empty / safe inputs ───────────────────────────────────────────────────────

describe('ToolOutputScanner — safe inputs', () => {
  it('passes through empty string unchanged', () => {
    const s = scanner();
    const r = s.scan('');
    expect(r.text).toBe('');
    expect(r.redacted).toBe(false);
    expect(r.redactions).toHaveLength(0);
  });

  it('passes through clean prose unchanged', () => {
    const text = 'The weather today is sunny with a high of 22°C.';
    const r = scanner().scan(text);
    expect(r.text).toBe(text);
    expect(r.redacted).toBe(false);
  });
});

// ── OpenAI / sk- keys ────────────────────────────────────────────────────────

describe('ToolOutputScanner — OpenAI key', () => {
  it('redacts a bare sk- key', () => {
    const text = 'API key is sk-aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456';
    const result = scanner().scan(text);
    expect(result.redacted).toBe(true);
    expect(result.text).toContain('[REDACTED:openai-key]');
    expect(result.text).not.toContain('sk-aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456');
  });

  it('redacts an Anthropic key', () => {
    const text = 'sk-ant-api03-AAABBBCCCDDDEEEFFFGGGHHHIIIJJJKKKLLLMMMNNN-suffix';
    expect(clean(text)).not.toContain('sk-ant-api03');
    expect(redacted(text)).toBe(true);
  });
});

// ── GitHub PAT ───────────────────────────────────────────────────────────────

describe('ToolOutputScanner — GitHub PAT', () => {
  it('redacts a classic ghp_ token', () => {
    const text = 'token: ghp_AAABBBCCCDDDEEEFFFGGGHHHIIIJJJKKKLLL12';
    expect(clean(text)).toContain('[REDACTED:github-pat]');
    expect(clean(text)).not.toContain('ghp_');
  });

  it('redacts a fine-grained github_pat_ token', () => {
    const text = 'github_pat_' + 'A'.repeat(82);
    expect(redacted(text)).toBe(true);
  });
});

// ── AWS keys ─────────────────────────────────────────────────────────────────

describe('ToolOutputScanner — AWS keys', () => {
  it('redacts an AKIA access key ID', () => {
    const text = 'Access key: AKIAIOSFODNN7EXAMPLE';
    expect(clean(text)).toContain('[REDACTED:aws-access-key]');
  });

  it('redacts AWS_SECRET_ACCESS_KEY assignment', () => {
    const text = 'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY';
    expect(clean(text)).not.toContain('wJalrXUtnFEMI');
  });
});

// ── PEM private key ───────────────────────────────────────────────────────────

describe('ToolOutputScanner — PEM private key', () => {
  it('redacts an RSA private key block', () => {
    const pem = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Z3VS5JJcds3xHn/ygWep4PAtE...
-----END RSA PRIVATE KEY-----`;
    const result = scanner().scan(pem);
    expect(result.redacted).toBe(true);
    expect(result.text).toContain('[REDACTED:pem-private-key]');
    expect(result.text).not.toContain('MIIEowIBAAKCAQEA');
  });

  it('redacts a generic PRIVATE KEY block', () => {
    const pem = `-----BEGIN PRIVATE KEY-----\naGVsbG8=\n-----END PRIVATE KEY-----`;
    expect(redacted(pem)).toBe(true);
  });
});

// ── DB connection strings ─────────────────────────────────────────────────────

describe('ToolOutputScanner — DB connection strings', () => {
  it('redacts a PostgreSQL DSN', () => {
    const text = 'DATABASE_URL=postgresql://admin:s3cr3t@db.example.com:5432/mydb';
    expect(clean(text)).toContain('[REDACTED:db-connection-string]');
    expect(clean(text)).not.toContain('s3cr3t');
  });

  it('redacts a MySQL DSN', () => {
    const text = 'mysql://root:pass123@localhost/app';
    expect(redacted(text)).toBe(true);
  });

  it('redacts a MongoDB DSN', () => {
    const text = 'mongodb://user:hunter2@mongo.internal/orders';
    expect(redacted(text)).toBe(true);
  });
});

// ── Bearer tokens ─────────────────────────────────────────────────────────────

describe('ToolOutputScanner — Bearer token', () => {
  it('redacts an Authorization: Bearer header', () => {
    const text = 'Authorization: Bearer eyJhbGciOiJSUzI1NiJ9.dGVzdA.c2lnbmF0dXJl';
    // May match jwt or bearer-token pattern — either is acceptable
    expect(redacted(text)).toBe(true);
    expect(clean(text)).not.toContain('eyJhbGciOiJSUzI1NiJ9');
  });
});

// ── JWTs ─────────────────────────────────────────────────────────────────────

describe('ToolOutputScanner — JWT', () => {
  it('redacts a well-formed JWT', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    expect(clean(jwt)).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    expect(redacted(jwt)).toBe(true);
  });
});

// ── Slack tokens ──────────────────────────────────────────────────────────────

describe('ToolOutputScanner — Slack token', () => {
  it('redacts a bot token', () => {
    const text = 'SLACK_TOKEN=' + 'xoxb-' + '123456789012-1234567890123-abcdefghijklmnopqrstuvwx';
    expect(redacted(text)).toBe(true);
    expect(clean(text)).not.toContain('xoxb-');
  });
});

// ── Stripe keys ───────────────────────────────────────────────────────────────

describe('ToolOutputScanner — Stripe key', () => {
  it('redacts a live secret key', () => {
    const text = 'sk_live_' + '4eC39HqLyjWDarjtT1zdp7dc';
    expect(redacted(text)).toBe(true);
  });

  it('redacts a test publishable key', () => {
    const text = 'pk_test_' + 'TYooMqauvdEDq54NiTphI7jx';
    expect(redacted(text)).toBe(true);
  });
});

// ── Generic API key assignment ────────────────────────────────────────────────

describe('ToolOutputScanner — generic API key', () => {
  it('redacts an api_key= assignment with a long value', () => {
    const text = 'api_key=AAABBBCCCDDDEEEFFFGGG000111222333';
    expect(redacted(text)).toBe(true);
    expect(clean(text)).toContain('[REDACTED:generic-api-key]');
  });

  it('does not redact a short value (< 32 chars)', () => {
    const text = 'api_key=short';
    expect(redacted(text)).toBe(false);
  });
});

// ── Multiple patterns in one text ─────────────────────────────────────────────

describe('ToolOutputScanner — multiple patterns', () => {
  it('catches multiple secrets in one output', () => {
    const text = [
      'sk-aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456',
      'ghp_AAABBBCCCDDDEEEFFFGGGHHHIIIJJJKKKLLL12',
      'postgresql://user:secret@host/db',
    ].join('\n');

    const result = scanner().scan(text);
    expect(result.redacted).toBe(true);
    expect(result.redactions.length).toBeGreaterThanOrEqual(3);
    expect(result.text).not.toContain('sk-aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456');
    expect(result.text).not.toContain('ghp_AAABBBCCCDDDEEEFFFGGGHHHIIIJJJKKKLLL12');
    expect(result.text).not.toContain('secret@host');
  });
});

// ── Logger integration ────────────────────────────────────────────────────────

describe('ToolOutputScanner — logger', () => {
  it('emits a warn log when secrets are found', () => {
    const mockLogger = { warn: vi.fn() };
    const s = new ToolOutputScanner({ logger: mockLogger as never });
    s.scan('sk-aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456', 'test-source');
    expect(mockLogger.warn).toHaveBeenCalledOnce();
    const [, meta] = mockLogger.warn.mock.calls[0] as [string, Record<string, unknown>];
    expect(meta.source).toBe('test-source');
  });

  it('does not emit a warn log when no secrets are found', () => {
    const mockLogger = { warn: vi.fn() };
    const s = new ToolOutputScanner({ logger: mockLogger as never });
    s.scan('Hello world, nothing secret here.');
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });
});

// ── SecretStore integration ───────────────────────────────────────────────────

describe('buildSecretStorePatterns', () => {
  it('builds a literal-value pattern for each secret', () => {
    const secrets = new Map([
      ['MY_KEY', 'super-secret-value-12345678'],
      ['SHORT', 'tiny'], // too short, should be skipped
    ]);
    const patterns = buildSecretStorePatterns(secrets);
    expect(patterns).toHaveLength(1);
    expect(patterns[0]!.type).toBe('managed-secret:MY_KEY');
  });

  it('redacts managed secret values embedded in tool output', () => {
    const secrets = new Map([['DB_PASS', 'hunter2-with-long-suffix']]);
    const s = createScannerWithSecrets(secrets);
    const result = s.scan('The password is hunter2-with-long-suffix, please protect it.');
    expect(result.redacted).toBe(true);
    expect(result.text).not.toContain('hunter2-with-long-suffix');
    expect(result.text).toContain('[REDACTED:managed-secret:DB_PASS]');
  });
});

// ── BUILTIN_PATTERNS completeness ─────────────────────────────────────────────

describe('BUILTIN_PATTERNS', () => {
  it('contains at least 15 patterns', () => {
    expect(BUILTIN_PATTERNS.length).toBeGreaterThanOrEqual(15);
  });

  it('all patterns are RegExp with global flag', () => {
    for (const { pattern } of BUILTIN_PATTERNS) {
      expect(pattern).toBeInstanceOf(RegExp);
      expect(pattern.global).toBe(true);
    }
  });
});
