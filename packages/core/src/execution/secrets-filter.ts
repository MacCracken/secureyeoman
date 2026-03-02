/**
 * Secrets Filter — Redacts sensitive values from execution output.
 *
 * Collects environment variable values that match common secret patterns
 * and replaces any occurrences in output lines with [REDACTED].
 */

/**
 * Create a function that filters secret values from a line of text.
 *
 * Default patterns match env vars named:
 *   SECUREYEOMAN_*, *_API_KEY, *_SECRET, *_PASSWORD, *_TOKEN
 *
 * @param additionalPatterns - Extra regex strings to match env var names
 * @returns A function that replaces secret values with [REDACTED]
 */
export function createSecretsFilter(additionalPatterns: string[] = []): (line: string) => string {
  const defaultNamePatterns = [/^SECUREYEOMAN_/, /_API_KEY$/, /_SECRET$/, /_PASSWORD$/, /_TOKEN$/];

  const extraNamePatterns = additionalPatterns.map((p) => new RegExp(p));
  const allNamePatterns = [...defaultNamePatterns, ...extraNamePatterns];

  // Collect actual secret values from the current environment
  const secretValues: string[] = [];
  for (const [name, value] of Object.entries(process.env)) {
    if (!value || value.length < 2) continue;
    const matches = allNamePatterns.some((pattern) => pattern.test(name));
    if (matches) {
      secretValues.push(value);
    }
  }

  // Sort longest first so longer values are replaced before substrings
  secretValues.sort((a, b) => b.length - a.length);

  // Cap secrets to prevent ReDoS with very large alternation regexes
  const MAX_SECRETS = 200;
  const MAX_SECRET_LENGTH = 500;
  const capped = secretValues
    .slice(0, MAX_SECRETS)
    .filter((v) => v.length <= MAX_SECRET_LENGTH);

  // Build a single regex from all secret values if any exist
  let secretsRegex: RegExp | null = null;
  if (capped.length > 0) {
    const escaped = capped.map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    secretsRegex = new RegExp(escaped.join('|'), 'g');
  }

  return (line: string): string => {
    if (!secretsRegex) return line;
    return line.replace(secretsRegex, '[REDACTED]');
  };
}
