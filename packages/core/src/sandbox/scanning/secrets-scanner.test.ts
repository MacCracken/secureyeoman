import { describe, it, expect } from 'vitest';
import { SecretsScanner } from './secrets-scanner.js';
import type { SandboxArtifact } from './types.js';
import { randomUUID } from 'node:crypto';

function makeArtifact(content: string): SandboxArtifact {
  return {
    id: randomUUID(),
    type: 'text/plain',
    content,
    sourceContext: 'test',
    sizeBytes: Buffer.byteLength(content),
  };
}

describe('SecretsScanner', () => {
  const scanner = new SecretsScanner();

  it('has correct name and version', () => {
    expect(scanner.name).toBe('secrets-scanner');
    expect(scanner.version).toBe('1.0.0');
  });

  // ── AWS ──
  describe('AWS credentials', () => {
    it('detects AWS Access Key ID', async () => {
      const findings = await scanner.scan(makeArtifact('key = "AKIAIOSFODNN7EXAMPLE"'));
      expect(
        findings.some((f) => f.category === 'credentials' && f.evidence?.includes('AWS_KEY'))
      ).toBe(true);
    });

    it('detects AWS Secret Access Key', async () => {
      const findings = await scanner.scan(
        makeArtifact('aws_secret_access_key = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"')
      );
      expect(findings.some((f) => f.evidence?.includes('AWS_SECRET'))).toBe(true);
    });
  });

  // ── GCP ──
  describe('GCP credentials', () => {
    it('detects GCP API key', async () => {
      // GCP API keys are AIza + 35 alphanumeric chars = 39 total
      const findings = await scanner.scan(
        makeArtifact('apiKey: "AIzaSy00000000000000000000000000000test"')
      );
      expect(findings.some((f) => f.evidence?.includes('GCP_KEY'))).toBe(true);
    });
  });

  // ── GitHub ──
  describe('GitHub tokens', () => {
    it('detects GitHub PAT', async () => {
      const findings = await scanner.scan(
        makeArtifact('token = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmn"')
      );
      expect(findings.some((f) => f.evidence?.includes('GITHUB_TOKEN'))).toBe(true);
    });

    it('detects GitHub app token', async () => {
      const findings = await scanner.scan(
        makeArtifact('ghs_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmn')
      );
      expect(findings.some((f) => f.evidence?.includes('GITHUB_TOKEN'))).toBe(true);
    });
  });

  // ── Stripe ──
  describe('Stripe keys', () => {
    it('detects Stripe live key', async () => {
      const findings = await scanner.scan(makeArtifact('sk_live_' + 'ABCDEFGHIJKLMNOPQRSTUVXYa'));
      expect(
        findings.some((f) => f.severity === 'critical' && f.evidence?.includes('STRIPE_KEY'))
      ).toBe(true);
    });

    it('detects Stripe test key with lower severity', async () => {
      const findings = await scanner.scan(makeArtifact('sk_test_ABCDEFGHIJKLMNOPQRSTUVXYa'));
      expect(
        findings.some((f) => f.severity === 'medium' && f.evidence?.includes('STRIPE_TEST_KEY'))
      ).toBe(true);
    });
  });

  // ── Slack ──
  describe('Slack tokens', () => {
    it('detects Slack bot token', async () => {
      const findings = await scanner.scan(makeArtifact('xoxb-1234567890-abcdefghij'));
      expect(findings.some((f) => f.evidence?.includes('SLACK_TOKEN'))).toBe(true);
    });

    it('detects Slack webhook URL', async () => {
      const findings = await scanner.scan(
        makeArtifact(
          'https://hooks.slack.com/services/T01234567/B01234567/ABCDEFGHIJKLMNOPQRSTUVWXy'
        )
      );
      expect(findings.some((f) => f.evidence?.includes('SLACK_WEBHOOK'))).toBe(true);
    });
  });

  // ── Generic Credentials ──
  describe('generic credentials', () => {
    it('detects hardcoded password', async () => {
      const findings = await scanner.scan(makeArtifact('password = "super_secret_123"'));
      expect(findings.some((f) => f.evidence?.includes('PASSWORD'))).toBe(true);
    });

    it('detects API key assignment', async () => {
      const findings = await scanner.scan(makeArtifact('api_key = "sk-abcdefghij123456"'));
      expect(findings.some((f) => f.evidence?.includes('API_KEY'))).toBe(true);
    });

    it('detects Bearer token', async () => {
      const findings = await scanner.scan(
        makeArtifact(
          'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'
        )
      );
      expect(findings.some((f) => f.evidence?.includes('BEARER_TOKEN'))).toBe(true);
    });

    it('detects JWT', async () => {
      const findings = await scanner.scan(
        makeArtifact(
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
        )
      );
      expect(findings.some((f) => f.evidence?.includes('JWT'))).toBe(true);
    });

    it('detects connection strings', async () => {
      const findings = await scanner.scan(
        makeArtifact('postgres://admin:password123@db.example.com:5432/mydb')
      );
      expect(findings.some((f) => f.evidence?.includes('CONNECTION_STRING'))).toBe(true);
    });
  });

  // ── Private Keys ──
  describe('private keys', () => {
    it('detects RSA private key', async () => {
      const findings = await scanner.scan(makeArtifact('-----BEGIN RSA PRIVATE KEY-----'));
      expect(findings.some((f) => f.category === 'private_key')).toBe(true);
      expect(findings[0].severity).toBe('critical');
    });

    it('detects generic private key', async () => {
      const findings = await scanner.scan(makeArtifact('-----BEGIN PRIVATE KEY-----'));
      expect(findings.some((f) => f.category === 'private_key')).toBe(true);
    });
  });

  // ── PII ──
  describe('PII', () => {
    it('detects email addresses', async () => {
      const findings = await scanner.scan(makeArtifact('contact: user@example.com'));
      expect(findings.some((f) => f.category === 'pii' && f.evidence?.includes('EMAIL'))).toBe(
        true
      );
    });

    it('detects SSN pattern', async () => {
      const findings = await scanner.scan(makeArtifact('ssn: 123-45-6789'));
      expect(findings.some((f) => f.category === 'pii' && f.severity === 'critical')).toBe(true);
    });

    it('detects credit card numbers', async () => {
      const findings = await scanner.scan(makeArtifact('card: 4111111111111111'));
      expect(
        findings.some((f) => f.category === 'pii' && f.evidence?.includes('CREDIT_CARD'))
      ).toBe(true);
    });
  });

  // ── Redaction ──
  describe('redaction', () => {
    it('redacts AWS key', () => {
      const result = scanner.redact('key: AKIAIOSFODNN7EXAMPLE');
      expect(result).toContain('[REDACTED:AWS_KEY]');
      expect(result).not.toContain('AKIAIOSFODNN7EXAMPLE');
    });

    it('redacts private key headers', () => {
      const result = scanner.redact('-----BEGIN RSA PRIVATE KEY-----\nMIIE...');
      expect(result).toContain('[REDACTED:PRIVATE_KEY]');
    });

    it('preserves non-secret content', () => {
      const input = 'This is normal text with no secrets.';
      expect(scanner.redact(input)).toBe(input);
    });
  });

  // ── Edge Cases ──
  describe('edge cases', () => {
    it('returns empty for clean content', async () => {
      const findings = await scanner.scan(makeArtifact('const x = 1 + 2;\nconsole.log(x);'));
      expect(findings).toEqual([]);
    });

    it('caps findings at 200', async () => {
      const lines = Array.from({ length: 250 }, () => 'password = "secret123"').join('\n');
      const findings = await scanner.scan(makeArtifact(lines));
      expect(findings.length).toBeLessThanOrEqual(200);
    });

    it('respects abort signal', async () => {
      const ac = new AbortController();
      ac.abort();
      const findings = await scanner.scan(
        makeArtifact('password = "test"\napi_key = "test"'),
        ac.signal
      );
      expect(findings.length).toBeLessThanOrEqual(2);
    });

    it('does not leak secret values in evidence', async () => {
      const findings = await scanner.scan(makeArtifact('password = "my_actual_secret"'));
      for (const f of findings) {
        expect(f.evidence).not.toContain('my_actual_secret');
      }
    });

    it('handles Buffer content', async () => {
      const buf = Buffer.from('api_key = "sk-abcdefghij123456"');
      const findings = await scanner.scan({
        id: randomUUID(),
        type: 'text/plain',
        content: buf,
        sourceContext: 'test',
        sizeBytes: buf.length,
      });
      expect(findings.length).toBeGreaterThan(0);
    });
  });
});
