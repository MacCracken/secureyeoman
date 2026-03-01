/**
 * Marketplace Shareables Types (Phase 89)
 *
 * Types for exporting, sharing, and importing workflow definitions and swarm
 * templates as portable JSON with a requires compatibility manifest.
 */

import type { WorkflowDefinition } from './workflow.js';
import type { SwarmTemplate } from './swarm.js';

// ─── Compatibility manifests ─────────────────────────────────────────────────

export type WorkflowShareableRequires = {
  /** Integration names required, e.g. ['gmail', 'github'] */
  integrations?: string[];
  /** MCP tool names required, e.g. ['github_list_issues'] */
  tools?: string[];
};

export type SwarmTemplateRequires = {
  /** Agent profile/personality names that must exist, e.g. ['coder', 'reviewer'] */
  profileRoles?: string[];
};

export type CompatibilityCheckResult = {
  compatible: boolean;
  gaps: {
    integrations?: string[];
    tools?: string[];
    profileRoles?: string[];
  };
};

// ─── Export envelopes ────────────────────────────────────────────────────────

export type WorkflowExport = {
  exportedAt: number;
  requires: WorkflowShareableRequires;
  workflow: WorkflowDefinition;
};

export type SwarmTemplateExport = {
  exportedAt: number;
  requires: SwarmTemplateRequires;
  template: SwarmTemplate;
};
