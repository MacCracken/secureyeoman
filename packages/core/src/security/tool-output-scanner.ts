/**
 * ToolOutputScanner — Credential leak detection for tool outputs and LLM responses.
 *
 * Runs after every tool execution and on the final LLM response before delivery.
 * Scans for 15+ secret patterns and replaces matches with [REDACTED:<type>].
 * Emits a warn-level log entry for every redaction.
 *
 * Integration path:
 *   Tool result → scan() → safe output appended to context
 *   LLM response → scan() → safe content returned to caller
 *
 * SecretStore integration: known secret keys are matched as literal values
 * alongside the regex patterns, so managed secrets are always caught even
 * when they don't match a known format pattern.
 */

import type { SecureLogger } from '../logging/logger.js';

// ── Pattern registry ────────────────────────────────────────────────────────

export interface SecretPattern {
  /** Human-readable name used in the [REDACTED:<type>] replacement. */
  type: string;
  /** Regex that captures the secret value (may use a capture group). */
  pattern: RegExp;
}

/**
 * Built-in credential patterns.
 *
 * Patterns are tried in order. The *full match* (or first capture group when
 * one is present) is replaced with [REDACTED:<type>].
 */
export const BUILTIN_PATTERNS: SecretPattern[] = [
  // OpenAI / generic sk- API keys
  { type: 'openai-key', pattern: /sk-[A-Za-z0-9_-]{32,}/g },
  // GitHub personal access tokens (classic + fine-grained)
  { type: 'github-pat', pattern: /ghp_[A-Za-z0-9]{36,}/g },
  { type: 'github-fine-grained', pattern: /github_pat_[A-Za-z0-9_]{82,}/g },
  { type: 'github-oauth', pattern: /gho_[A-Za-z0-9]{36,}/g },
  { type: 'github-action', pattern: /ghs_[A-Za-z0-9]{36,}/g },
  { type: 'github-refresh', pattern: /ghr_[A-Za-z0-9]{36,}/g },
  // AWS access keys
  { type: 'aws-access-key', pattern: /AKIA[A-Z0-9]{16}/g },
  // AWS secret access keys (follow =)
  { type: 'aws-secret-key', pattern: /(?:AWS_SECRET_ACCESS_KEY|aws_secret_access_key)\s*=\s*\S+/gi },
  // PEM private key headers (catch any PEM block header)
  { type: 'pem-private-key', pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g },
  // PostgreSQL / generic DSN connection strings with credentials
  { type: 'db-connection-string', pattern: /(?:postgresql|postgres|mysql|mongodb(?:\+srv)?|redis|amqp(?:s)?):\/\/[^:]+:[^@\s]+@[^\s"']+/gi },
  // Bearer tokens in Authorization headers
  { type: 'bearer-token', pattern: /(?:Authorization|authorization)\s*:\s*Bearer\s+[A-Za-z0-9_\-\.+/=]{20,}/g },
  // JSON Web Tokens (three base64url segments)
  { type: 'jwt', pattern: /ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  // Anthropic API keys
  { type: 'anthropic-key', pattern: /sk-ant-[A-Za-z0-9_-]{40,}/g },
  // Google / GCP service account private keys (JSON inline)
  { type: 'gcp-private-key', pattern: /"private_key"\s*:\s*"-----BEGIN[^"]+-----END[^"]+-----\\n"/g },
  // Slack tokens
  { type: 'slack-token', pattern: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
  // Stripe API keys
  { type: 'stripe-key', pattern: /(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{24,}/g },
  // Twilio tokens
  { type: 'twilio-token', pattern: /SK[a-f0-9]{32}/g },
  // Discord bot tokens
  { type: 'discord-token', pattern: /[MN][A-Za-z0-9_-]{23,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{27,}/g },
  // Generic high-entropy API key assignment (KEY=<32+ alphanum>)
  {
    type: 'generic-api-key',
    pattern: /(?:api[_-]?key|apikey|secret[_-]?key|access[_-]?token|auth[_-]?token)\s*[=:]\s*["']?([A-Za-z0-9_\-+/=.]{32,})["']?/gi,
  },
  // SSH private key content lines (base64 PEM body heuristic)
  { type: 'ssh-private-key', pattern: /(?:^|[\r\n])([A-Za-z0-9+/]{60,}={0,2})(?=[\r\n]|$)/g },
];

// ── Result types ─────────────────────────────────────────────────────────────

export interface Redaction {
  /** Pattern type that triggered the redaction. */
  type: string;
  /** Number of occurrences replaced. */
  count: number;
}

export interface ScanResult {
  /** Sanitised text, safe to append to model context. */
  text: string;
  /** True when at least one secret was found and replaced. */
  redacted: boolean;
  /** List of all redaction events (type + count). */
  redactions: Redaction[];
}

// ── Scanner ──────────────────────────────────────────────────────────────────

export class ToolOutputScanner {
  private readonly patterns: SecretPattern[];
  private readonly logger: SecureLogger | null;

  constructor(opts: {
    /** Extra patterns beyond the builtins (e.g. from SecretStore values). */
    extraPatterns?: SecretPattern[];
    logger?: SecureLogger | null;
  } = {}) {
    this.patterns = [...BUILTIN_PATTERNS, ...(opts.extraPatterns ?? [])];
    this.logger = opts.logger ?? null;
  }

  /**
   * Scan `text` for credential patterns and replace all matches in-place.
   *
   * @param text     Raw text from a tool output or LLM response.
   * @param source   Caller label used in log entries (e.g. 'tool:shell', 'llm_response').
   * @returns        ScanResult with sanitised text and redaction metadata.
   */
  scan(text: string, source = 'unknown'): ScanResult {
    if (!text) return { text, redacted: false, redactions: [] };

    const redactionMap = new Map<string, number>();
    let current = text;

    for (const { type, pattern } of this.patterns) {
      // Reset lastIndex — patterns are shared so we must reset before each use.
      pattern.lastIndex = 0;

      const replacement = `[REDACTED:${type}]`;
      const before = current;
      current = current.replace(pattern, replacement);

      if (current !== before) {
        // Count the number of replacements by comparing lengths
        const removed = before.length - current.length + replacement.length;
        // Simple occurrence count: count how many times the replacement appears
        // after substitution minus how many existed before.
        const occurrences = (current.match(new RegExp(escapeRegex(replacement), 'g')) ?? []).length;
        redactionMap.set(type, (redactionMap.get(type) ?? 0) + occurrences);
        // Suppress unused variable lint warning
        void removed;
      }
    }

    const redactions: Redaction[] = Array.from(redactionMap.entries()).map(([type, count]) => ({
      type,
      count,
    }));

    const redacted = redactions.length > 0;

    if (redacted && this.logger) {
      this.logger.warn('Credential pattern detected and redacted in output', {
        source,
        redactions,
      });
    }

    return { text: current, redacted, redactions };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build extra patterns from known secret store keys.
 *
 * For each non-empty secret value in `knownSecrets`, create a literal-value
 * pattern so that managed secrets are always caught regardless of format.
 * Values shorter than 8 characters are skipped to avoid over-matching.
 */
export function buildSecretStorePatterns(
  knownSecrets: Map<string, string>
): SecretPattern[] {
  const patterns: SecretPattern[] = [];
  for (const [key, value] of knownSecrets) {
    if (!value || value.length < 8) continue;
    patterns.push({
      type: `managed-secret:${key}`,
      pattern: new RegExp(escapeRegex(value), 'g'),
    });
  }
  return patterns;
}

/**
 * Convenience factory: create a scanner pre-seeded with SecretStore values.
 *
 * @param secretEntries   Iterator of [key, value] pairs from a SecretStore.
 * @param logger          Optional logger.
 */
export function createScannerWithSecrets(
  secretEntries: Iterable<[string, string]>,
  logger?: SecureLogger | null
): ToolOutputScanner {
  const secretMap = new Map(secretEntries);
  const extraPatterns = buildSecretStorePatterns(secretMap);
  return new ToolOutputScanner({ extraPatterns, logger });
}
