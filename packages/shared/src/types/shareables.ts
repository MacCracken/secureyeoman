/**
 * Marketplace Shareables Types (Phase 89)
 *
 * Types for exporting, sharing, and importing workflow definitions and swarm
 * templates as portable JSON with a requires compatibility manifest.
 */

import type { WorkflowDefinition } from './workflow.js';
import type { SwarmTemplate } from './swarm.js';

// ─── Compatibility manifests ─────────────────────────────────────────────────

export interface WorkflowShareableRequires {
  /** Integration names required, e.g. ['gmail', 'github'] */
  integrations?: string[];
  /** MCP tool names required, e.g. ['github_list_issues'] */
  tools?: string[];
}

export interface SwarmTemplateRequires {
  /** Agent profile/personality names that must exist, e.g. ['coder', 'reviewer'] */
  profileRoles?: string[];
}

export interface CompatibilityCheckResult {
  compatible: boolean;
  gaps: {
    integrations?: string[];
    tools?: string[];
    profileRoles?: string[];
  };
}

// ─── Export envelopes ────────────────────────────────────────────────────────

export interface WorkflowExport {
  exportedAt: number;
  requires: WorkflowShareableRequires;
  workflow: WorkflowDefinition;
}

export interface SwarmTemplateExport {
  exportedAt: number;
  requires: SwarmTemplateRequires;
  template: SwarmTemplate;
}

// ─── Directory-based metadata (Phase 113) ──────────────────────────────────

/**
 * metadata.json shape for a directory-based workflow.
 * Step prompts can be overridden by per-step markdown files in `steps/`.
 */
export interface WorkflowDirectoryMetadata {
  name: string;
  description?: string;
  version?: string;
  author?: string;
  category?: string;
  tags?: string[];
  steps: Array<{
    id: string;
    type: string;
    config: Record<string, unknown>;
  }>;
  edges?: Array<{ from: string; to: string; condition?: string }>;
  triggers?: Array<Record<string, unknown>>;
  autonomyLevel?: string;
  requires?: WorkflowShareableRequires;
}

/**
 * metadata.json shape for a directory-based swarm template.
 * Role system prompts can be overridden by per-role markdown files in `roles/`.
 */
export interface SwarmTemplateDirectoryMetadata {
  name: string;
  description?: string;
  version?: string;
  author?: string;
  strategy?: string;
  roles: Array<{
    role: string;
    profileName: string;
    description?: string;
    systemPromptOverride?: string;
  }>;
  coordinatorProfile?: string | null;
  requires?: SwarmTemplateRequires;
}
