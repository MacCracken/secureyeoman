/**
 * SRA Tools — MCP tools for Security Reference Architecture.
 *
 * Phase 123 — Security Reference Architecture
 *
 * sra_list_blueprints    — List available SRA blueprints
 * sra_get_blueprint      — Get a specific blueprint with controls
 * sra_create_blueprint   — Create a custom blueprint
 * sra_assess             — Create a new assessment against a blueprint
 * sra_get_assessment     — Get assessment details with results
 * sra_compliance_map     — List compliance mappings
 * sra_summary            — Executive summary of SRA posture
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';
import { wrapToolHandler, jsonResponse, errorResponse } from './tool-utils.js';

const SRA_DISABLED_MSG =
  'SRA tools are disabled. Enable Security Reference Architecture in MCP config to use sra_* tools.';

function disabled() {
  return errorResponse(SRA_DISABLED_MSG);
}

export function registerSraTools(
  server: McpServer,
  client: CoreApiClient,
  config: McpServiceConfig,
  middleware: ToolMiddleware
): void {
  // ── sra_list_blueprints ──────────────────────────────────────────────────
  server.tool(
    'sra_list_blueprints',
    'List available Security Reference Architecture blueprints. Filter by cloud provider, framework, or status.',
    {
      provider: z
        .string()
        .optional()
        .describe('Filter by provider (aws, azure, gcp, generic, etc.)'),
      framework: z
        .string()
        .optional()
        .describe('Filter by framework (aws_sra, cisa_tra, mcra, etc.)'),
      status: z.string().optional().describe('Filter by status (draft, active, archived)'),
    },
    wrapToolHandler('sra_list_blueprints', middleware, async ({ provider, framework, status }) => {
      if (!(config as any).exposeSra) return disabled();
      const params: Record<string, string> = {};
      if (provider) params.provider = provider;
      if (framework) params.framework = framework;
      if (status) params.status = status;

      const result = await client.get('/api/v1/security/sra/blueprints', params);
      return jsonResponse(result);
    })
  );

  // ── sra_get_blueprint ────────────────────────────────────────────────────
  server.tool(
    'sra_get_blueprint',
    'Get a specific SRA blueprint by ID, including all controls with implementation guidance and compliance mappings.',
    {
      id: z.string().min(1).describe('Blueprint ID'),
    },
    wrapToolHandler('sra_get_blueprint', middleware, async ({ id }) => {
      if (!(config as any).exposeSra) return disabled();
      const result = await client.get(`/api/v1/security/sra/blueprints/${id}`);
      return jsonResponse(result);
    })
  );

  // ── sra_create_blueprint ─────────────────────────────────────────────────
  server.tool(
    'sra_create_blueprint',
    'Create a custom Security Reference Architecture blueprint with controls.',
    {
      name: z.string().min(1).describe('Blueprint name'),
      description: z.string().optional().describe('Blueprint description'),
      provider: z
        .string()
        .describe('Cloud provider (aws, azure, gcp, multi_cloud, on_premises, hybrid, generic)'),
      framework: z
        .string()
        .describe('Framework (aws_sra, cisa_tra, mcra, nist_csf, cis_benchmarks, custom)'),
      controls: z
        .array(
          z.object({
            id: z.string(),
            domain: z.string(),
            title: z.string(),
            description: z.string(),
            priority: z.string().optional(),
          })
        )
        .default([])
        .describe('Array of controls'),
    },
    wrapToolHandler(
      'sra_create_blueprint',
      middleware,
      async ({ name, description, provider, framework, controls }) => {
        if (!(config as any).exposeSra) return disabled();
        const result = await client.post('/api/v1/security/sra/blueprints', {
          name,
          description,
          provider,
          framework,
          controls,
        });
        return jsonResponse(result);
      }
    )
  );

  // ── sra_assess ───────────────────────────────────────────────────────────
  server.tool(
    'sra_assess',
    'Create a new SRA assessment against a blueprint. Provide the blueprint ID, a name, and an infrastructure description for gap analysis.',
    {
      blueprintId: z.string().min(1).describe('Blueprint ID to assess against'),
      name: z.string().min(1).describe('Assessment name (e.g. "Q1 2026 Production Assessment")'),
      infrastructureDescription: z
        .string()
        .optional()
        .describe('Description of the infrastructure being assessed'),
    },
    wrapToolHandler(
      'sra_assess',
      middleware,
      async ({ blueprintId, name, infrastructureDescription }) => {
        if (!(config as any).exposeSra) return disabled();
        const result = await client.post('/api/v1/security/sra/assessments', {
          blueprintId,
          name,
          infrastructureDescription,
        });
        return jsonResponse(result);
      }
    )
  );

  // ── sra_get_assessment ───────────────────────────────────────────────────
  server.tool(
    'sra_get_assessment',
    'Get a specific SRA assessment by ID, including control results and summary.',
    {
      id: z.string().min(1).describe('Assessment ID'),
    },
    wrapToolHandler('sra_get_assessment', middleware, async ({ id }) => {
      if (!(config as any).exposeSra) return disabled();
      const result = await client.get(`/api/v1/security/sra/assessments/${id}`);
      return jsonResponse(result);
    })
  );

  // ── sra_compliance_map ───────────────────────────────────────────────────
  server.tool(
    'sra_compliance_map',
    'List compliance framework mappings across security domains. Maps controls to NIST CSF, CIS v8, SOC 2, and FedRAMP.',
    {
      domain: z
        .string()
        .optional()
        .describe('Filter by domain (identity_access, network_security, etc.)'),
      framework: z
        .string()
        .optional()
        .describe('Filter by framework (NIST CSF, CIS v8, SOC 2, FedRAMP)'),
    },
    wrapToolHandler('sra_compliance_map', middleware, async ({ domain, framework }) => {
      if (!(config as any).exposeSra) return disabled();
      const params: Record<string, string> = {};
      if (domain) params.domain = domain;
      if (framework) params.framework = framework;

      const result = await client.get('/api/v1/security/sra/compliance-mappings', params);
      return jsonResponse(result);
    })
  );

  // ── sra_summary ──────────────────────────────────────────────────────────
  server.tool(
    'sra_summary',
    'Get an executive summary of the Security Reference Architecture posture, including blueprint counts, assessment stats, compliance scores, and top gaps.',
    {},
    wrapToolHandler('sra_summary', middleware, async () => {
      if (!(config as any).exposeSra) return disabled();
      const result = await client.get('/api/v1/security/sra/summary');
      return jsonResponse(result);
    })
  );
}
