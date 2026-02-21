/**
 * Skill Trust Tiers — per-source tool permission filtering.
 *
 * Maps a skill's `source` field to the set of tools that source is
 * permitted to expose to the model at dispatch time.
 *
 * Trust hierarchy:
 *   user / ai_proposed / ai_learned / marketplace  → full access (all tools)
 *   community                                       → read-only access only
 *
 * "Read-only" is defined by the tool name prefix allow-list below.
 * Community skills that legitimately need broader access can be overridden
 * per-skill in the dashboard editor (future: skill.allowedPermissions field).
 *
 * This is a config-time gate — the skill instructions inject normally into
 * the system prompt, but the tool list passed to the model is filtered here.
 */

import type { Tool } from '@secureyeoman/shared';
import type { SkillSource } from '@secureyeoman/shared';

// ── Read-only tool prefix allow-list ────────────────────────────────────────
//
// A tool is considered "read-only" when its name begins with any of these
// prefixes (case-insensitive). Extend this list as new read-safe tools are
// added to the platform.

const READ_ONLY_PREFIXES: readonly string[] = [
  'get_',
  'list_',
  'read_',
  'search_',
  'query_',
  'fetch_',
  'retrieve_',
  'find_',
  'lookup_',
  'check_',
  'inspect_',
  'describe_',
  'show_',
  'view_',
  'summarise_',
  'summarize_',
  'analyze_',
  'analyse_',
  'extract_',
  'count_',
  'stat_',
  'stats_',
  'info_',
  'status_',
  'ping_',
  'health_',
];

// ── Sources that receive full tool access ────────────────────────────────────

const FULL_ACCESS_SOURCES = new Set<SkillSource>([
  'user',
  'ai_proposed',
  'ai_learned',
  'marketplace',
]);

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Filter `tools` according to the trust tier of `source`.
 *
 * - Full-access sources: all tools returned unchanged.
 * - Community source: only tools whose names match the read-only prefix
 *   allow-list are returned.
 *
 * @param tools   The raw tool list from a BrainSkill record.
 * @param source  The skill's `source` field.
 * @returns       A (possibly filtered) subset of `tools`.
 */
export function applySkillTrustFilter(tools: Tool[], source: SkillSource): Tool[] {
  if (FULL_ACCESS_SOURCES.has(source)) {
    return tools;
  }

  // Community tier: read-only tools only.
  return tools.filter((tool) => isReadOnlyTool(tool.name));
}

/**
 * Returns true when `toolName` is considered read-only based on the
 * prefix allow-list.
 */
export function isReadOnlyTool(toolName: string): boolean {
  const lower = toolName.toLowerCase();
  return READ_ONLY_PREFIXES.some((prefix) => lower.startsWith(prefix));
}
