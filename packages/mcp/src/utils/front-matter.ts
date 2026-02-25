/**
 * YAML front-matter helpers for MCP markdown resources.
 *
 * Shared by web-tools, personality-resources, and skill-resources so that
 * any fix or enhancement applies to all three sites consistently.
 */

/**
 * Serialise a flat key-value map as a YAML front-matter block.
 * Values that are empty string, null, or undefined are omitted.
 * Strings containing `:` are double-quoted and escaped.
 */
export function buildFrontMatter(
  fields: Record<string, string | number | boolean | undefined>
): string {
  const lines = ['---'];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === '') continue;
    const str = String(value);
    const escaped = str.includes(':')
      ? `"${str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
      : str;
    lines.push(`${key}: ${escaped}`);
  }
  lines.push('---');
  return lines.join('\n') + '\n\n';
}
