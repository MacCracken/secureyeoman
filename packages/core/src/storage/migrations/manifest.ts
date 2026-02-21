/**
 * Migration Manifest — loads all SQL migration files at startup.
 *
 * Uses fs.readFileSync so the migrations work in both the Node.js Docker
 * runtime (Dockerfile.dev) and the Bun compiled single binary. The build
 * script copies *.sql alongside the compiled *.js files so they are
 * always co-located with manifest.js at runtime.
 *
 * IMPORTANT: Keep this list in numeric order. Add each new migration
 * at the bottom. The runner depends on sort order.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// In a Bun compiled standalone binary, import.meta.url is set to the virtual
// filesystem path of the binary itself (e.g. "file:///$bunfs/root/<binary-name>"),
// not the source file's path. fileURLToPath would either throw or return the
// wrong directory, so readFileSync would look in the virtual FS root instead
// of the migrations source directory.
//
// When compiled, SQL files are shipped in a "migrations/" subdirectory
// co-located with the binary (e.g. /usr/local/bin/migrations/ in Docker).
// We detect the compiled context via the "/$bunfs/" substring (present in both
// the raw virtual-FS form and the file:// URL form) and resolve from
// the binary's real directory instead.
const isBunBinary = import.meta.url.includes('/$bunfs/');
const __dirname = isBunBinary
  ? join(dirname(process.execPath), 'migrations')
  : dirname(fileURLToPath(import.meta.url));

function readSql(filename: string): string {
  return readFileSync(join(__dirname, filename), 'utf-8');
}

export const MIGRATION_MANIFEST: { id: string; sql: string }[] = [
  { id: '001_initial_schema', sql: readSql('001_initial_schema.sql') },
  { id: '002_personality_scoping', sql: readSql('002_personality_scoping.sql') },
  { id: '003_vector_memory', sql: readSql('003_vector_memory.sql') },
  { id: '004_history_compression', sql: readSql('004_history_compression.sql') },
  { id: '005_delegations', sql: readSql('005_delegations.sql') },
  { id: '006_extensions', sql: readSql('006_extensions.sql') },
  { id: '006_mcp_health', sql: readSql('006_mcp_health.sql') },
  { id: '007_code_execution', sql: readSql('007_code_execution.sql') },
  { id: '007_mcp_credentials', sql: readSql('007_mcp_credentials.sql') },
  { id: '008_a2a_protocol', sql: readSql('008_a2a_protocol.sql') },
  { id: '009_security_policy', sql: readSql('009_security_policy.sql') },
  { id: '010_multimodal', sql: readSql('010_multimodal.sql') },
  { id: '011_browser_sessions', sql: readSql('011_browser_sessions.sql') },
  { id: '012_oauth_tokens', sql: readSql('012_oauth_tokens.sql') },
  { id: '013_webhook_transforms', sql: readSql('013_webhook_transforms.sql') },
  { id: '014_outbound_webhooks', sql: readSql('014_outbound_webhooks.sql') },
  { id: '015_usage_personality', sql: readSql('015_usage_personality.sql') },
  { id: '016_system_preferences', sql: readSql('016_system_preferences.sql') },
  { id: '017_swarms', sql: readSql('017_swarms.sql') },
  { id: '018_personality_model_fallbacks', sql: readSql('018_personality_model_fallbacks.sql') },
  { id: '019_marketplace_source', sql: readSql('019_marketplace_source.sql') },
  { id: '020_soul_skills_personality', sql: readSql('020_soul_skills_personality.sql') },
  { id: '021_cleanup_moved_skills', sql: readSql('021_cleanup_moved_skills.sql') },
  { id: '022_users', sql: readSql('022_users.sql') },
  { id: '023_workspace_improvements', sql: readSql('023_workspace_improvements.sql') },
  { id: '024_sso_identity_providers', sql: readSql('024_sso_identity_providers.sql') },
  { id: '025_sso_state', sql: readSql('025_sso_state.sql') },
  { id: '026_agent_profile_types', sql: readSql('026_agent_profile_types.sql') },
  { id: '027_marketplace_author_info', sql: readSql('027_marketplace_author_info.sql') },
  { id: '028_heartbeat_log', sql: readSql('028_heartbeat_log.sql') },
  { id: '029_collab_docs', sql: readSql('029_collab_docs.sql') },
  { id: '030_group_chat', sql: readSql('030_group_chat.sql') },
  { id: '031_routing_rules', sql: readSql('031_routing_rules.sql') },
  { id: '032_marketplace_trigger_patterns', sql: readSql('032_marketplace_trigger_patterns.sql') },
];
