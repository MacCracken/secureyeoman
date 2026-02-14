/**
 * Secret Redactor Middleware — strips tokens/keys/passwords from tool outputs.
 */

export interface SecretRedactorMiddleware {
  redact(value: unknown): unknown;
}

const SECRET_PATTERNS: RegExp[] = [
  // JWT tokens
  /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  // API keys (common formats)
  /(?:sk|pk|api|key|token|secret|password|auth)[-_]?[A-Za-z0-9]{20,}/gi,
  // Bearer tokens in headers
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  // Basic auth
  /Basic\s+[A-Za-z0-9+/=]+/gi,
  // AWS keys
  /AKIA[0-9A-Z]{16}/g,
  // Private keys
  /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g,
];

const SENSITIVE_KEYS = new Set([
  'password', 'secret', 'token', 'apiKey', 'api_key', 'apikey',
  'accessToken', 'access_token', 'refreshToken', 'refresh_token',
  'privateKey', 'private_key', 'secretKey', 'secret_key',
  'authorization', 'credential', 'credentials',
  'tokenSecret', 'token_secret',
]);

export function createSecretRedactor(): SecretRedactorMiddleware {
  return {
    redact(value: unknown): unknown {
      return redactValue(value);
    },
  };
}

function redactValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return redactString(value);
  }
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEYS.has(k)) {
        result[k] = '[REDACTED]';
      } else {
        result[k] = redactValue(v);
      }
    }
    return result;
  }
  return value;
}

function redactString(str: string): string {
  let result = str;
  for (const pattern of SECRET_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    result = result.replace(pattern, '[REDACTED]');
  }
  return result;
}
