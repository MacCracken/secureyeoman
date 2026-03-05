/**
 * Secrets Scanner — Detects secrets, API keys, credentials, PII (Phase 116-A)
 *
 * Extends patterns from createSecretsFilter(). Supports redaction mode.
 */

import { randomUUID } from 'node:crypto';
import type { ScanFinding } from '@secureyeoman/shared';
import type { ArtifactScanner, SandboxArtifact } from './types.js';

const MAX_FINDINGS = 200;
const MAX_LINE_LENGTH = 10_000;

interface SecretPattern {
  id: string;
  category: string;
  severity: ScanFinding['severity'];
  message: string;
  pattern: RegExp;
  redactLabel: string;
}

const SECRET_PATTERNS: SecretPattern[] = [
  // ── AWS ──
  {
    id: 'secret-aws-key',
    category: 'credentials',
    severity: 'critical',
    message: 'AWS Access Key ID detected',
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
    redactLabel: 'AWS_KEY',
  },
  {
    id: 'secret-aws-secret',
    category: 'credentials',
    severity: 'critical',
    message: 'AWS Secret Access Key detected',
    pattern: /(?:aws_secret_access_key|AWS_SECRET_ACCESS_KEY)\s*[=:]\s*['"]?[A-Za-z0-9/+=]{40}\b/,
    redactLabel: 'AWS_SECRET',
  },

  // ── GCP ──
  {
    id: 'secret-gcp-key',
    category: 'credentials',
    severity: 'critical',
    message: 'GCP API Key detected',
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/,
    redactLabel: 'GCP_KEY',
  },

  // ── GitHub ──
  {
    id: 'secret-github-pat',
    category: 'credentials',
    severity: 'critical',
    message: 'GitHub Personal Access Token detected',
    pattern: /\bgh[ps]_[A-Za-z0-9]{36,}\b/,
    redactLabel: 'GITHUB_TOKEN',
  },
  {
    id: 'secret-github-classic',
    category: 'credentials',
    severity: 'critical',
    message: 'GitHub classic token detected',
    pattern: /\bghp_[A-Za-z0-9]{36}\b/,
    redactLabel: 'GITHUB_TOKEN',
  },

  // ── Stripe ──
  {
    id: 'secret-stripe-live',
    category: 'credentials',
    severity: 'critical',
    message: 'Stripe live secret key detected',
    pattern: /\bsk_live_[A-Za-z0-9]{24,}\b/,
    redactLabel: 'STRIPE_KEY',
  },
  {
    id: 'secret-stripe-test',
    category: 'credentials',
    severity: 'medium',
    message: 'Stripe test key detected',
    pattern: /\bsk_test_[A-Za-z0-9]{24,}\b/,
    redactLabel: 'STRIPE_TEST_KEY',
  },

  // ── Slack ──
  {
    id: 'secret-slack-token',
    category: 'credentials',
    severity: 'critical',
    message: 'Slack token detected',
    pattern: /\bxox[bpas]-[0-9]{10,}-[A-Za-z0-9-]+\b/,
    redactLabel: 'SLACK_TOKEN',
  },
  {
    id: 'secret-slack-webhook',
    category: 'credentials',
    severity: 'high',
    message: 'Slack webhook URL detected',
    pattern: /hooks\.slack\.com\/services\/T[A-Z0-9]{8,}\/B[A-Z0-9]{8,}\/[A-Za-z0-9]{24}/,
    redactLabel: 'SLACK_WEBHOOK',
  },

  // ── Generic Credentials ──
  {
    id: 'secret-password-assign',
    category: 'credentials',
    severity: 'high',
    message: 'Hardcoded password assignment',
    pattern: /(?:password|passwd|pwd)\s*[=:]\s*['"][^'"]{4,}/i,
    redactLabel: 'PASSWORD',
  },
  {
    id: 'secret-api-key-assign',
    category: 'credentials',
    severity: 'high',
    message: 'Hardcoded API key assignment',
    pattern: /(?:api_key|apikey|api_secret|secret_key)\s*[=:]\s*['"][^'"]{8,}/i,
    redactLabel: 'API_KEY',
  },
  {
    id: 'secret-bearer-token',
    category: 'credentials',
    severity: 'high',
    message: 'Bearer token in Authorization header',
    pattern: /Authorization['":\s]+Bearer\s+[A-Za-z0-9._-]{20,}/i,
    redactLabel: 'BEARER_TOKEN',
  },
  {
    id: 'secret-jwt',
    category: 'credentials',
    severity: 'high',
    message: 'JSON Web Token detected',
    pattern: /\beyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/,
    redactLabel: 'JWT',
  },

  // ── Private Keys ──
  {
    id: 'secret-private-key',
    category: 'private_key',
    severity: 'critical',
    message: 'Private key detected',
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
    redactLabel: 'PRIVATE_KEY',
  },

  // ── PII ──
  {
    id: 'pii-email',
    category: 'pii',
    severity: 'medium',
    message: 'Email address detected in artifact',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
    redactLabel: 'EMAIL',
  },
  {
    id: 'pii-ssn',
    category: 'pii',
    severity: 'critical',
    message: 'Social Security Number pattern detected',
    pattern: /\b\d{3}-\d{2}-\d{4}\b/,
    redactLabel: 'SSN',
  },
  {
    id: 'pii-credit-card',
    category: 'pii',
    severity: 'critical',
    message: 'Credit card number pattern detected',
    pattern:
      /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/,
    redactLabel: 'CREDIT_CARD',
  },

  // ── Connection Strings ──
  {
    id: 'secret-conn-string',
    category: 'credentials',
    severity: 'high',
    message: 'Database connection string with credentials',
    pattern: /(?:postgres|mysql|mongodb|redis):\/\/[^:]+:[^@]+@/i,
    redactLabel: 'CONNECTION_STRING',
  },
];

export class SecretsScanner implements ArtifactScanner {
  readonly name = 'secrets-scanner';
  readonly version = '1.0.0';

  async scan(artifact: SandboxArtifact, signal?: AbortSignal): Promise<ScanFinding[]> {
    const content =
      typeof artifact.content === 'string' ? artifact.content : artifact.content.toString('utf-8');

    const findings: ScanFinding[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      if (signal?.aborted) break;
      if (findings.length >= MAX_FINDINGS) break;

      // Anti-ReDoS guard
      const rawLine = lines[i] ?? '';
      const line =
        rawLine.length > MAX_LINE_LENGTH ? rawLine.substring(0, MAX_LINE_LENGTH) : rawLine;

      for (const pattern of SECRET_PATTERNS) {
        if (findings.length >= MAX_FINDINGS) break;
        if (pattern.pattern.test(line)) {
          findings.push({
            id: randomUUID(),
            scanner: this.name,
            severity: pattern.severity,
            category: pattern.category,
            message: pattern.message,
            line: i + 1,
            evidence: `[REDACTED:${pattern.redactLabel}]`,
            recommendation: `Remove or rotate the exposed ${pattern.redactLabel}`,
          });
        }
      }
    }

    return findings;
  }

  /**
   * Redact detected secrets in content, replacing matches with [REDACTED:type].
   */
  redact(content: string): string {
    let result = content;
    for (const pattern of SECRET_PATTERNS) {
      result = result.replace(pattern.pattern, `[REDACTED:${pattern.redactLabel}]`);
    }
    return result;
  }
}
