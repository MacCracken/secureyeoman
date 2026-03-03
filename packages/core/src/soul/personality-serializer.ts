/**
 * PersonalityMarkdownSerializer — portable markdown format for personality export/import.
 *
 * Format:
 *   ---
 *   name: "Name"
 *   version: "2026-03-02"
 *   description: "..."
 *   traits: [key1, key2, key3]
 *   defaultModel: { provider: "...", model: "..." }
 *   sex: "unspecified"
 *   voice: ""
 *   preferredLanguage: ""
 *   ---
 *   # Identity & Purpose
 *   <systemPrompt content>
 *
 *   # Traits
 *   - **formality**: balanced
 *   - **humor**: subtle
 *
 *   # Configuration
 *   ```yaml
 *   <non-default body config>
 *   ```
 *
 *   # Model Fallbacks
 *   - provider/model
 */

import type { PersonalityCreate } from './types.js';
import type { BodyConfig } from '@secureyeoman/shared';
import { BodyConfigSchema } from '@secureyeoman/shared';

export interface PersonalityMarkdownData {
  data: PersonalityCreate;
  warnings: string[];
}

interface PersonalityLike {
  name: string;
  description?: string;
  systemPrompt?: string;
  traits?: Record<string, string>;
  defaultModel?: { provider: string; model: string } | null;
  modelFallbacks?: { provider: string; model: string }[];
  sex?: string;
  voice?: string;
  preferredLanguage?: string;
  includeArchetypes?: boolean;
  injectDateTime?: boolean;
  empathyResonance?: boolean;
  avatarUrl?: string | null;
  body?: BodyConfig;
}

/**
 * Serialize a personality to portable markdown and back.
 */
export class PersonalityMarkdownSerializer {
  /**
   * Convert a personality object to a markdown string.
   */
  toMarkdown(personality: PersonalityLike): string {
    const lines: string[] = [];

    // ── YAML frontmatter ────────────────────────────────────
    lines.push('---');
    lines.push(`name: ${yamlQuote(personality.name)}`);
    lines.push(`version: "${new Date().toISOString().slice(0, 10)}"`);
    if (personality.description) {
      lines.push(`description: ${yamlQuote(personality.description)}`);
    }
    const traitKeys = Object.keys(personality.traits ?? {});
    if (traitKeys.length > 0) {
      lines.push(`traits: [${traitKeys.join(', ')}]`);
    }
    if (personality.defaultModel) {
      lines.push(
        `defaultModel: { provider: "${personality.defaultModel.provider}", model: "${personality.defaultModel.model}" }`
      );
    }
    if (personality.sex && personality.sex !== 'unspecified') {
      lines.push(`sex: "${personality.sex}"`);
    }
    if (personality.voice) {
      lines.push(`voice: ${yamlQuote(personality.voice)}`);
    }
    if (personality.preferredLanguage) {
      lines.push(`preferredLanguage: ${yamlQuote(personality.preferredLanguage)}`);
    }
    lines.push('---');
    lines.push('');

    // ── # Identity & Purpose ─────────────────────────────────
    lines.push('# Identity & Purpose');
    lines.push('');
    lines.push(personality.systemPrompt ?? '');
    lines.push('');

    // ── # Traits ─────────────────────────────────────────────
    const traits = personality.traits ?? {};
    if (Object.keys(traits).length > 0) {
      lines.push('# Traits');
      lines.push('');
      for (const [key, value] of Object.entries(traits)) {
        lines.push(`- **${key}**: ${value}`);
      }
      lines.push('');
    }

    // ── # Configuration ──────────────────────────────────────
    const bodyDiff = computeBodyDiff(personality.body);
    const extraFlags = computeExtraFlags(personality);
    if (bodyDiff || extraFlags) {
      lines.push('# Configuration');
      lines.push('');
      lines.push('```yaml');
      if (extraFlags) lines.push(extraFlags);
      if (bodyDiff) lines.push(bodyDiff);
      lines.push('```');
      lines.push('');
    }

    // ── # Model Fallbacks ─────────────────────────────────────
    const fallbacks = personality.modelFallbacks ?? [];
    if (fallbacks.length > 0) {
      lines.push('# Model Fallbacks');
      lines.push('');
      for (const fb of fallbacks) {
        lines.push(`- ${fb.provider}/${fb.model}`);
      }
      lines.push('');
    }

    return lines.join('\n').trimEnd() + '\n';
  }

  /**
   * Parse a markdown string into a PersonalityCreate object.
   */
  fromMarkdown(md: string): PersonalityMarkdownData {
    const warnings: string[] = [];

    // ── Split frontmatter from body ─────────────────────────
    const fmMatch = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(md);
    if (!fmMatch) {
      throw new Error('Invalid personality markdown: missing YAML frontmatter (--- delimiters)');
    }

    const frontmatterRaw = fmMatch[1]!;
    const bodyRaw = fmMatch[2]!;

    // ── Parse frontmatter ────────────────────────────────────
    const fm = parseSimpleYaml(frontmatterRaw);

    const name = String(fm.name ?? '').trim();
    if (!name) {
      throw new Error('Invalid personality markdown: frontmatter missing required "name" field');
    }

    const description = fm.description != null ? String(fm.description).trim() : '';
    const sex = parseSex(fm.sex);
    const voice = fm.voice != null ? String(fm.voice).trim() : '';
    const preferredLanguage =
      fm.preferredLanguage != null ? String(fm.preferredLanguage).trim() : '';

    // Parse traits from frontmatter (array of keys)
    const traitKeys: string[] = Array.isArray(fm.traits)
      ? fm.traits.map((t: unknown) => String(t).trim())
      : typeof fm.traits === 'string'
        ? fm.traits
            .replace(/^\[|\]$/g, '')
            .split(',')
            .map((s: string) => s.trim())
            .filter(Boolean)
        : [];

    // Parse defaultModel
    let defaultModel: { provider: string; model: string } | null = null;
    if (fm.defaultModel && typeof fm.defaultModel === 'object') {
      const dm = fm.defaultModel as Record<string, unknown>;
      if (dm.provider && dm.model) {
        defaultModel = { provider: String(dm.provider), model: String(dm.model) };
      }
    } else if (typeof fm.defaultModel === 'string') {
      const dmParsed = parseInlineObject(fm.defaultModel);
      if (dmParsed?.provider && dmParsed?.model) {
        defaultModel = { provider: dmParsed.provider, model: dmParsed.model };
      }
    }

    // ── Parse sections ───────────────────────────────────────
    const sections = parseSections(bodyRaw);

    // Identity & Purpose → systemPrompt
    const systemPrompt = (sections['identity & purpose'] ?? '').trim();

    // Traits → Record<string, string>
    const traits: Record<string, string> = {};
    const traitsSection = sections.traits ?? '';
    const traitLineRegex = /^-\s+\*\*([^*]+)\*\*:\s*(.+)$/gm;
    let traitMatch: RegExpExecArray | null;
    while ((traitMatch = traitLineRegex.exec(traitsSection)) !== null) {
      traits[traitMatch[1]!.trim()] = traitMatch[2]!.trim();
    }
    // Fill any frontmatter trait keys that didn't appear in the traits section
    for (const key of traitKeys) {
      if (!(key in traits)) {
        traits[key] = key;
      }
    }

    // Configuration → body config
    let body = BodyConfigSchema.parse({});
    let includeArchetypes = true;
    let injectDateTime = false;
    let empathyResonance = false;

    const configSection = sections.configuration ?? '';
    const yamlBlockMatch = /```(?:yaml)?\s*\n([\s\S]*?)```/.exec(configSection);
    if (yamlBlockMatch) {
      const configYaml = parseSimpleYaml(yamlBlockMatch[1]!);
      if (configYaml.includeArchetypes !== undefined) {
        includeArchetypes =
          configYaml.includeArchetypes === true || configYaml.includeArchetypes === 'true';
      }
      if (configYaml.injectDateTime !== undefined) {
        injectDateTime = configYaml.injectDateTime === true || configYaml.injectDateTime === 'true';
      }
      if (configYaml.empathyResonance !== undefined) {
        empathyResonance =
          configYaml.empathyResonance === true || configYaml.empathyResonance === 'true';
      }
      // Apply remaining config as body overrides
      const bodyOverrides: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(configYaml)) {
        if (['includeArchetypes', 'injectDateTime', 'empathyResonance'].includes(k)) continue;
        bodyOverrides[k] = v;
      }
      if (Object.keys(bodyOverrides).length > 0) {
        try {
          body = BodyConfigSchema.parse(bodyOverrides);
        } catch {
          warnings.push('Configuration section had invalid body config fields; using defaults');
        }
      }
    }

    // Model Fallbacks
    const modelFallbacks: { provider: string; model: string }[] = [];
    const fallbackSection = sections['model fallbacks'] ?? '';
    const fbLineRegex = /^-\s+(.+?)\/(.+)$/gm;
    let fbMatch: RegExpExecArray | null;
    while ((fbMatch = fbLineRegex.exec(fallbackSection)) !== null) {
      modelFallbacks.push({ provider: fbMatch[1]!.trim(), model: fbMatch[2]!.trim() });
    }

    // Warn on unknown sections (distilled docs include Runtime sections — skip gracefully)
    const knownSections = new Set([
      'identity & purpose',
      'traits',
      'configuration',
      'model fallbacks',
      'runtime prompt',
      'runtime context',
    ]);
    for (const sectionName of Object.keys(sections)) {
      if (!knownSections.has(sectionName)) {
        warnings.push(`Unknown section ignored: # ${sectionName}`);
      }
    }

    const data: PersonalityCreate = {
      name,
      description,
      systemPrompt,
      traits,
      sex,
      voice,
      preferredLanguage,
      defaultModel,
      modelFallbacks,
      includeArchetypes,
      injectDateTime,
      empathyResonance,
      avatarUrl: null,
      body,
    };

    return { data, warnings };
  }
}

// ── Helpers ──────────────────────────────────────────────────────

/** Quote a YAML string value safely. */
function yamlQuote(s: string): string {
  if (/[:\n"{}[\],&*#?|<>=!%@`]/.test(s) || s.startsWith(' ') || s.endsWith(' ')) {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return `"${s}"`;
}

/** Parse sex field, validating against allowed values. */
function parseSex(raw: unknown): 'male' | 'female' | 'non-binary' | 'unspecified' {
  const s = String(raw ?? 'unspecified').trim();
  if (['male', 'female', 'non-binary', 'unspecified'].includes(s)) {
    return s as 'male' | 'female' | 'non-binary' | 'unspecified';
  }
  return 'unspecified';
}

/**
 * Parse sections from markdown body. Returns a map of lowercase heading → content.
 * Only handles `# Heading` (h1) markers.
 */
function parseSections(body: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const lines = body.split('\n');
  let currentHeading: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    const headingMatch = /^#\s+(.+)$/.exec(line);
    if (headingMatch) {
      if (currentHeading !== null) {
        sections[currentHeading] = currentLines.join('\n');
      }
      currentHeading = headingMatch[1]!.trim().toLowerCase();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  if (currentHeading !== null) {
    sections[currentHeading] = currentLines.join('\n');
  }

  return sections;
}

/**
 * Compute a YAML string of body config fields that differ from defaults.
 */
function computeBodyDiff(body?: BodyConfig): string | null {
  if (!body) return null;
  const defaults = BodyConfigSchema.parse({});
  const diffLines: string[] = [];

  // Simple top-level booleans/strings
  const simpleKeys: (keyof BodyConfig)[] = [
    'enabled',
    'heartEnabled',
    'omnipresentMind',
    'knowledgeMode',
  ];

  for (const key of simpleKeys) {
    if (body[key] !== defaults[key]) {
      diffLines.push(`${key}: ${JSON.stringify(body[key])}`);
    }
  }

  // Capabilities
  const caps = body.capabilities ?? [];
  if (JSON.stringify(caps) !== JSON.stringify(defaults.capabilities)) {
    diffLines.push(`capabilities: [${caps.join(', ')}]`);
  }

  // MCP features (only non-default ones)
  const mcpDiff: string[] = [];
  for (const [k, v] of Object.entries(body.mcpFeatures ?? {})) {
    const defaultVal = (defaults.mcpFeatures as Record<string, boolean>)[k];
    if (v !== defaultVal) {
      mcpDiff.push(`  ${k}: ${v}`);
    }
  }
  if (mcpDiff.length > 0) {
    diffLines.push('mcpFeatures:');
    diffLines.push(...mcpDiff);
  }

  // Creation config (only non-default ones)
  const ccDiff: string[] = [];
  for (const [k, v] of Object.entries(body.creationConfig ?? {})) {
    const defaultVal = (defaults.creationConfig as Record<string, boolean>)[k];
    if (v !== defaultVal) {
      ccDiff.push(`  ${k}: ${v}`);
    }
  }
  if (ccDiff.length > 0) {
    diffLines.push('creationConfig:');
    diffLines.push(...ccDiff);
  }

  return diffLines.length > 0 ? diffLines.join('\n') : null;
}

/**
 * Compute YAML lines for top-level personality flags that differ from defaults.
 */
function computeExtraFlags(personality: PersonalityLike): string | null {
  const lines: string[] = [];
  if (personality.includeArchetypes === false) lines.push('includeArchetypes: false');
  if (personality.injectDateTime === true) lines.push('injectDateTime: true');
  if (personality.empathyResonance === true) lines.push('empathyResonance: true');
  return lines.length > 0 ? lines.join('\n') : null;
}

/**
 * Simple YAML parser for flat key-value frontmatter.
 * Handles: strings (quoted/unquoted), booleans, numbers, inline arrays, inline objects.
 */
function parseSimpleYaml(raw: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = raw.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    const value: string = trimmed.slice(colonIdx + 1).trim();

    // Remove surrounding quotes and unescape
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

    // Inline object: { key: "val", key2: "val2" }
    if (value.startsWith('{') && value.endsWith('}')) {
      result[key] = parseInlineObject(value);
      continue;
    }

    // Booleans
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

    // Numbers
    if (/^-?\d+(\.\d+)?$/.test(value)) {
      result[key] = Number(value);
      continue;
    }

    result[key] = value;
  }

  return result;
}

/**
 * Parse a YAML-like inline object: { key: "val", key2: "val2" }
 */
function parseInlineObject(raw: string): Record<string, string> | null {
  const inner = raw.slice(1, -1).trim();
  if (!inner) return null;

  const result: Record<string, string> = {};
  // Split by comma, but handle quoted values
  const pairs = inner.split(',');
  for (const pair of pairs) {
    const ci = pair.indexOf(':');
    if (ci === -1) continue;
    const k = pair.slice(0, ci).trim();
    let v = pair.slice(ci + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    result[k] = v;
  }
  return Object.keys(result).length > 0 ? result : null;
}
