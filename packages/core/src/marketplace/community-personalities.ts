/**
 * Community Personalities — Read personality .md files from the community repo
 * and return them with category information derived from directory structure.
 */

import { readdir, readFile, access } from 'node:fs/promises';
import { join, relative, dirname, basename } from 'node:path';

export interface CommunityPersonality {
  name: string;
  description: string;
  category: string;
  author: string;
  version: string;
  traits: Record<string, string>;
  sex?: string;
  filename: string;
  /** Relative path to avatar SVG/PNG if one exists alongside the .md file. */
  avatarFile?: string;
  /** Full system prompt (markdown body after frontmatter). */
  systemPrompt: string;
}

/**
 * Scan the community repo's `personalities/` directory and parse each .md file.
 * Returns an array of CommunityPersonality objects.
 * Malformed or unreadable files are silently skipped.
 */
export async function readCommunityPersonalities(
  repoPath: string
): Promise<CommunityPersonality[]> {
  const personalitiesDir = join(repoPath, 'personalities');
  let entries: string[];
  try {
    entries = (await readdir(personalitiesDir, { recursive: true })) as string[];
  } catch {
    // Directory doesn't exist or isn't readable
    return [];
  }

  const mdFiles = entries.filter((e) => e.endsWith('.md'));
  const results: CommunityPersonality[] = [];

  for (const filepath of mdFiles) {
    try {
      const fullPath = join(personalitiesDir, filepath);
      const content = await readFile(fullPath, 'utf-8');
      const parsed = parseFrontmatter(content);
      if (!parsed) continue;

      // Derive category from directory path relative to personalities/
      // Normalize backslashes to forward slashes before dirname (Windows compat)
      const normalized = filepath.replace(/\\/g, '/');
      const dir = dirname(normalized);
      const category = dir === '.' ? 'other' : dir;

      // Extract system prompt (body after frontmatter)
      const bodyMatch = content.match(/^---[\s\S]*?---\r?\n([\s\S]*)$/);
      const systemPrompt = bodyMatch?.[1]?.trim() ?? '';

      // Check for avatar file (same name, .svg or .png)
      const stem = basename(normalized, '.md');
      const avatarDir = dirname(fullPath);
      let avatarFile: string | undefined;
      for (const ext of ['.svg', '.png', '.webp', '.jpg']) {
        try {
          await access(join(avatarDir, `${stem}${ext}`));
          avatarFile = `${dirname(normalized)}/${stem}${ext}`;
          break;
        } catch {
          // No avatar with this extension
        }
      }

      results.push({
        name: String(parsed.name ?? '').trim() || filepath,
        description: String(parsed.description ?? '').trim(),
        category,
        author: String(parsed.author ?? '').trim(),
        version: String(parsed.version ?? '').trim(),
        traits: parseTraits(parsed.traits, content),
        sex: parsed.sex != null ? String(parsed.sex).trim() : undefined,
        filename: normalized,
        avatarFile,
        systemPrompt,
      });
    } catch {
      // Skip unreadable files
    }
  }

  return results;
}

/**
 * Parse YAML frontmatter from a markdown file (between --- markers).
 * Returns a Record of key-value pairs, or null if no valid frontmatter found.
 */
export function parseFrontmatter(content: string): Record<string, unknown> | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  if (!match) return null;

  const raw = match[1]!;
  const result: Record<string, unknown> = {};

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    const value = trimmed.slice(colonIdx + 1).trim();

    // Quoted strings
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      result[key] = value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      continue;
    }

    // Inline array: [a, b, c]
    if (value.startsWith('[') && value.endsWith(']')) {
      const inner = value.slice(1, -1).trim();
      if (!inner) {
        result[key] = [];
      } else {
        result[key] = inner.split(',').map((s) => {
          const t = s.trim();
          return t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t;
        });
      }
      continue;
    }

    // Booleans / null / numbers
    if (value === 'true') {
      result[key] = true;
      continue;
    }
    if (value === 'false') {
      result[key] = false;
      continue;
    }
    if (value === 'null') {
      result[key] = null;
      continue;
    }
    if (/^-?\d+(\.\d+)?$/.test(value)) {
      result[key] = Number(value);
      continue;
    }

    result[key] = value;
  }

  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Extract traits as Record<string, string>.
 * Tries frontmatter traits field first, then parses Traits section from body.
 */
function parseTraits(fmTraits: unknown, content: string): Record<string, string> {
  const traits: Record<string, string> = {};

  // Parse trait keys from frontmatter (may be array or comma string)
  const traitKeys: string[] = Array.isArray(fmTraits)
    ? fmTraits.map((t: unknown) => String(t).trim())
    : typeof fmTraits === 'string'
      ? fmTraits
          .replace(/^\[|\]$/g, '')
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean)
      : [];

  // Parse trait values from body (# Traits section)
  const traitLineRegex = /^-\s+\*\*([^*]+)\*\*:\s*(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = traitLineRegex.exec(content)) !== null) {
    traits[match[1]!.trim()] = match[2]!.trim();
  }

  // Fill frontmatter keys that don't have body values
  for (const key of traitKeys) {
    if (!(key in traits)) {
      traits[key] = key;
    }
  }

  return traits;
}
