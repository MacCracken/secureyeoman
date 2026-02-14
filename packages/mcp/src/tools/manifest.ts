/**
 * Tool Manifest — static list of all MCP tools for auto-registration with core.
 */

import type { McpServiceConfig } from '@friday/shared';

export interface ToolManifestEntry {
  name: string;
  description: string;
}

export function getToolManifest(config: McpServiceConfig): ToolManifestEntry[] {
  const tools: ToolManifestEntry[] = [
    // Brain tools
    { name: 'knowledge_search', description: 'Search the FRIDAY knowledge base' },
    { name: 'knowledge_get', description: 'Get a specific knowledge entry by ID' },
    { name: 'knowledge_store', description: 'Store a new knowledge entry' },
    { name: 'memory_recall', description: 'Recall memories matching a query' },

    // Task tools
    { name: 'task_create', description: 'Create a new agent task' },
    { name: 'task_list', description: 'List tasks with optional filters' },
    { name: 'task_get', description: 'Get a specific task by ID' },
    { name: 'task_cancel', description: 'Cancel a running task' },

    // System tools
    { name: 'system_health', description: 'Check system health status' },
    { name: 'system_metrics', description: 'Get system performance metrics' },
    { name: 'system_config', description: 'Get current system configuration (secrets redacted)' },

    // Integration tools
    { name: 'integration_list', description: 'List all configured integrations' },
    { name: 'integration_send', description: 'Send a message via an integration' },
    { name: 'integration_status', description: 'Get integration connection status' },

    // Soul tools
    { name: 'personality_get', description: 'Get the active personality profile' },
    { name: 'personality_switch', description: 'Switch to a different personality' },
    { name: 'skill_list', description: 'List available skills' },
    { name: 'skill_execute', description: 'Execute a skill by name' },

    // Audit tools
    { name: 'audit_query', description: 'Query the audit log with filters' },
    { name: 'audit_verify', description: 'Verify audit chain integrity' },
    { name: 'audit_stats', description: 'Get audit statistics' },
  ];

  // Filesystem tools (opt-in)
  if (config.exposeFilesystem) {
    tools.push(
      { name: 'fs_read', description: 'Read a file (path-restricted, admin-only)' },
      { name: 'fs_write', description: 'Write a file (path-restricted, admin-only)' },
      { name: 'fs_list', description: 'List directory contents (path-restricted, admin-only)' },
      { name: 'fs_search', description: 'Search files by pattern (path-restricted, admin-only)' },
    );
  }

  return tools;
}
