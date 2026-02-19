/**
 * Migration Manifest — static import of all SQL migration files.
 *
 * This replaces readdirSync(__dirname) so migrations work correctly
 * inside a Bun compiled single binary where the filesystem layout
 * is embedded, not a real directory.
 *
 * IMPORTANT: Keep this list in numeric order. Add each new migration
 * at the bottom. The runner depends on sort order.
 */

import sql001 from './001_initial_schema.sql' with { type: 'text' };
import sql002 from './002_personality_scoping.sql' with { type: 'text' };
import sql003 from './003_vector_memory.sql' with { type: 'text' };
import sql004 from './004_history_compression.sql' with { type: 'text' };
import sql005 from './005_delegations.sql' with { type: 'text' };
import sql006a from './006_extensions.sql' with { type: 'text' };
import sql006b from './006_mcp_health.sql' with { type: 'text' };
import sql007a from './007_code_execution.sql' with { type: 'text' };
import sql007b from './007_mcp_credentials.sql' with { type: 'text' };
import sql008 from './008_a2a_protocol.sql' with { type: 'text' };
import sql009 from './009_security_policy.sql' with { type: 'text' };
import sql010 from './010_multimodal.sql' with { type: 'text' };
import sql011 from './011_browser_sessions.sql' with { type: 'text' };
import sql012 from './012_oauth_tokens.sql' with { type: 'text' };
import sql013 from './013_webhook_transforms.sql' with { type: 'text' };
import sql014 from './014_outbound_webhooks.sql' with { type: 'text' };
import sql015 from './015_usage_personality.sql' with { type: 'text' };
import sql016 from './016_system_preferences.sql' with { type: 'text' };
import sql017 from './017_swarms.sql' with { type: 'text' };
import sql018 from './018_personality_model_fallbacks.sql' with { type: 'text' };
import sql019 from './019_marketplace_source.sql' with { type: 'text' };
import sql020 from './020_soul_skills_personality.sql' with { type: 'text' };
import sql021 from './021_cleanup_moved_skills.sql' with { type: 'text' };
import sql022 from './022_users.sql' with { type: 'text' };
import sql023 from './023_workspace_improvements.sql' with { type: 'text' };
import sql024 from './024_sso_identity_providers.sql' with { type: 'text' };
import sql025 from './025_sso_state.sql' with { type: 'text' };
import sql026 from './026_agent_profile_types.sql' with { type: 'text' };

export const MIGRATION_MANIFEST: { id: string; sql: string }[] = [
  { id: '001_initial_schema', sql: sql001 },
  { id: '002_personality_scoping', sql: sql002 },
  { id: '003_vector_memory', sql: sql003 },
  { id: '004_history_compression', sql: sql004 },
  { id: '005_delegations', sql: sql005 },
  { id: '006_extensions', sql: sql006a },
  { id: '006_mcp_health', sql: sql006b },
  { id: '007_code_execution', sql: sql007a },
  { id: '007_mcp_credentials', sql: sql007b },
  { id: '008_a2a_protocol', sql: sql008 },
  { id: '009_security_policy', sql: sql009 },
  { id: '010_multimodal', sql: sql010 },
  { id: '011_browser_sessions', sql: sql011 },
  { id: '012_oauth_tokens', sql: sql012 },
  { id: '013_webhook_transforms', sql: sql013 },
  { id: '014_outbound_webhooks', sql: sql014 },
  { id: '015_usage_personality', sql: sql015 },
  { id: '016_system_preferences', sql: sql016 },
  { id: '017_swarms', sql: sql017 },
  { id: '018_personality_model_fallbacks', sql: sql018 },
  { id: '019_marketplace_source', sql: sql019 },
  { id: '020_soul_skills_personality', sql: sql020 },
  { id: '021_cleanup_moved_skills', sql: sql021 },
  { id: '022_users', sql: sql022 },
  { id: '023_workspace_improvements', sql: sql023 },
  { id: '024_sso_identity_providers', sql: sql024 },
  { id: '025_sso_state', sql: sql025 },
  { id: '026_agent_profile_types', sql: sql026 },
];
