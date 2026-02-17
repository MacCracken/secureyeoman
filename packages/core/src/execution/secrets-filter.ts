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

  // Build a single regex from all secret values if any exist
  let secretsRegex: RegExp | null = null;
  if (secretValues.length > 0) {
    const escaped = secretValues.map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    secretsRegex = new RegExp(escaped.join('|'), 'g');
  }

  return (line: string): string => {
    if (!secretsRegex) return line;
    return line.replace(secretsRegex, '[REDACTED]');
  };
}
