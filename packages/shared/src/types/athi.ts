/**
 * ATHI Threat Governance Types — Phase 107-F
 *
 * AI Threat Modeling taxonomy: Actors, Techniques, Harms, Impacts.
 * Schemas and types for threat scenario management and executive reporting.
 */

import { z } from 'zod';

// ─── Enums ───────────────────────────────────────────────────────

export const AthiActorSchema = z.enum([
  'nation_state',
  'cybercriminal',
  'insider',
  'hacktivist',
  'competitor',
  'automated_agent',
]);
export type AthiActor = z.infer<typeof AthiActorSchema>;

export const AthiTechniqueSchema = z.enum([
  'prompt_injection',
  'data_poisoning',
  'model_theft',
  'supply_chain',
  'social_engineering',
  'adversarial_input',
  'privilege_escalation',
]);
export type AthiTechnique = z.infer<typeof AthiTechniqueSchema>;

export const AthiHarmSchema = z.enum([
  'data_breach',
  'misinformation',
  'service_disruption',
  'privacy_violation',
  'financial_loss',
  'reputational_damage',
  'safety_risk',
]);
export type AthiHarm = z.infer<typeof AthiHarmSchema>;

export const AthiImpactSchema = z.enum([
  'regulatory_penalty',
  'operational_downtime',
  'customer_trust_loss',
  'ip_theft',
  'legal_liability',
]);
export type AthiImpact = z.infer<typeof AthiImpactSchema>;

export const AthiScenarioStatusSchema = z.enum([
  'identified',
  'assessed',
  'mitigated',
  'accepted',
  'monitoring',
]);
export type AthiScenarioStatus = z.infer<typeof AthiScenarioStatusSchema>;

// ─── Sub-schemas ─────────────────────────────────────────────────

export const AthiMitigationSchema = z.object({
  description: z.string(),
  status: z.enum(['planned', 'in_progress', 'implemented', 'verified']).default('planned'),
  owner: z.string().optional(),
  effectiveness: z.number().min(0).max(100).optional(),
});
export type AthiMitigation = z.infer<typeof AthiMitigationSchema>;

// ─── Full entity ─────────────────────────────────────────────────

export const AthiScenarioSchema = z.object({
  id: z.string(),
  orgId: z.string().optional(),
  title: z.string().max(300),
  description: z.string().optional(),
  actor: AthiActorSchema,
  techniques: z.array(AthiTechniqueSchema),
  harms: z.array(AthiHarmSchema),
  impacts: z.array(AthiImpactSchema),
  likelihood: z.number().int().min(1).max(5),
  severity: z.number().int().min(1).max(5),
  riskScore: z.number().int().min(1).max(25),
  mitigations: z.array(AthiMitigationSchema),
  status: AthiScenarioStatusSchema,
  createdBy: z.string().optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type AthiScenario = z.infer<typeof AthiScenarioSchema>;

// ─── Create / Update ─────────────────────────────────────────────

export const AthiScenarioCreateSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().optional(),
  actor: AthiActorSchema,
  techniques: z.array(AthiTechniqueSchema).min(1),
  harms: z.array(AthiHarmSchema).min(1),
  impacts: z.array(AthiImpactSchema).min(1),
  likelihood: z.number().int().min(1).max(5),
  severity: z.number().int().min(1).max(5),
  mitigations: z.array(AthiMitigationSchema).default([]),
  status: AthiScenarioStatusSchema.default('identified'),
});
export type AthiScenarioCreate = z.infer<typeof AthiScenarioCreateSchema>;

export const AthiScenarioUpdateSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().optional(),
  actor: AthiActorSchema.optional(),
  techniques: z.array(AthiTechniqueSchema).min(1).optional(),
  harms: z.array(AthiHarmSchema).min(1).optional(),
  impacts: z.array(AthiImpactSchema).min(1).optional(),
  likelihood: z.number().int().min(1).max(5).optional(),
  severity: z.number().int().min(1).max(5).optional(),
  mitigations: z.array(AthiMitigationSchema).optional(),
  status: AthiScenarioStatusSchema.optional(),
});
export type AthiScenarioUpdate = z.infer<typeof AthiScenarioUpdateSchema>;

// ─── Analytics schemas ───────────────────────────────────────────

export const AthiRiskMatrixCellSchema = z.object({
  actor: AthiActorSchema,
  technique: AthiTechniqueSchema,
  count: z.number().int(),
  avgRiskScore: z.number(),
  maxRiskScore: z.number().int(),
  scenarioIds: z.array(z.string()),
});
export type AthiRiskMatrixCell = z.infer<typeof AthiRiskMatrixCellSchema>;

export const AthiExecutiveSummarySchema = z.object({
  totalScenarios: z.number().int(),
  byStatus: z.record(z.number().int()),
  byActor: z.record(z.number().int()),
  topRisks: z.array(AthiScenarioSchema),
  averageRiskScore: z.number(),
  mitigationCoverage: z.number().min(0).max(100),
});
export type AthiExecutiveSummary = z.infer<typeof AthiExecutiveSummarySchema>;
