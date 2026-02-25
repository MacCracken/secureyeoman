/**
 * OrgIntent Schema — Phase 48: Machine Readable Organizational Intent
 *
 * Defines the full OrgIntentDoc structure with 8 top-level sections:
 *   goals, signals, dataSources, authorizedActions, tradeoffProfiles,
 *   hardBoundaries, delegationFramework, context
 */

import { z } from 'zod';

// ─── Data Source ──────────────────────────────────────────────────────────────

export const DataSourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['http', 'mcp_tool', 'postgres', 'prometheus', 'custom']),
  /** Connection string, URL, or tool name depending on type */
  connection: z.string().min(1),
  /** Optional secret key reference (env var name) for auth */
  authSecret: z.string().optional(),
  /** Optional schema hint for query result parsing */
  schema: z.string().optional(),
});

export type DataSource = z.infer<typeof DataSourceSchema>;

// ─── Signal ───────────────────────────────────────────────────────────────────

export const SignalSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  dataSources: z.array(z.string()).default([]), // references DataSource.id
  /** Which direction indicates a problem: 'above' means high is bad, 'below' means low is bad */
  direction: z.enum(['above', 'below']).default('above'),
  threshold: z.number(),
  warningThreshold: z.number().optional(),
});

export type Signal = z.infer<typeof SignalSchema>;

// ─── Goal ─────────────────────────────────────────────────────────────────────

export const GoalSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  priority: z.number().int().min(1).max(100).default(50),
  /** Optional CEL/boolean expression — goal is only active when this evaluates truthy against ctx */
  activeWhen: z.string().optional(),
  successCriteria: z.string().default(''),
  /**
   * Optional condition that marks this goal as completed when met.
   * Uses the same deny:/tool: prefix matching as hard boundaries, or a free-text
   * description evaluated against context. When a goal transitions from active →
   * inactive and this field is present, an `intent_goal_completed` event is emitted.
   */
  completionCondition: z.string().optional(),
  ownerRole: z.string().default('admin'),
  skills: z.array(z.string()).default([]),
  signals: z.array(z.string()).default([]), // references Signal.id
  authorizedActions: z.array(z.string()).default([]), // references AuthorizedAction.id
});

export type Goal = z.infer<typeof GoalSchema>;

// ─── Authorized Action ────────────────────────────────────────────────────────

export const AuthorizedActionSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  appliesToGoals: z.array(z.string()).default([]), // references Goal.id
  appliesToSignals: z.array(z.string()).default([]), // references Signal.id
  requiredRole: z.string().optional(),
  conditions: z.string().optional(), // CEL expression
  mcpTools: z.array(z.string()).default([]),
});

export type AuthorizedAction = z.infer<typeof AuthorizedActionSchema>;

// ─── Tradeoff Profile ─────────────────────────────────────────────────────────

export const TradeoffProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** 0 = maximise speed, 1 = maximise thoroughness */
  speedVsThoroughness: z.number().min(0).max(1).default(0.5),
  /** 0 = minimise cost, 1 = maximise quality */
  costVsQuality: z.number().min(0).max(1).default(0.5),
  /** 0 = maximise autonomy, 1 = always confirm */
  autonomyVsConfirmation: z.number().min(0).max(1).default(0.5),
  notes: z.string().optional(),
  isDefault: z.boolean().default(false),
});

export type TradeoffProfile = z.infer<typeof TradeoffProfileSchema>;

// ─── Hard Boundary ────────────────────────────────────────────────────────────

export const HardBoundarySchema = z.object({
  id: z.string().min(1),
  rule: z.string().min(1),
  /** Optional Rego policy snippet for OPA evaluation */
  rego: z.string().optional(),
  rationale: z.string().default(''),
});

export type HardBoundary = z.infer<typeof HardBoundarySchema>;

// ─── Delegation Framework ─────────────────────────────────────────────────────

export const DelegationTenantSchema = z.object({
  id: z.string().min(1),
  principle: z.string().min(1),
  decisionBoundaries: z.array(z.string()).default([]),
});

export const DelegationFrameworkSchema = z.object({
  tenants: z.array(DelegationTenantSchema).default([]),
});

export type DelegationFramework = z.infer<typeof DelegationFrameworkSchema>;

// ─── Org Context (flat KV) ────────────────────────────────────────────────────

export const OrgContextSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
});

export type OrgContext = z.infer<typeof OrgContextSchema>;

// ─── Policy ───────────────────────────────────────────────────────────────────

export const PolicySchema = z.object({
  id: z.string().min(1),
  rule: z.string().min(1),
  /** Optional OPA Rego expression — evaluated when OPA_ADDR env is set */
  rego: z.string().optional(),
  enforcement: z.enum(['warn', 'block']).default('block'),
  rationale: z.string().default(''),
});

export type Policy = z.infer<typeof PolicySchema>;

// ─── Top-level OrgIntentDoc ───────────────────────────────────────────────────

export const OrgIntentDocSchema = z.object({
  apiVersion: z.string().default('v1'),
  name: z.string().min(1),
  goals: z.array(GoalSchema).default([]),
  signals: z.array(SignalSchema).default([]),
  dataSources: z.array(DataSourceSchema).default([]),
  authorizedActions: z.array(AuthorizedActionSchema).default([]),
  tradeoffProfiles: z.array(TradeoffProfileSchema).default([]),
  hardBoundaries: z.array(HardBoundarySchema).default([]),
  policies: z.array(PolicySchema).default([]),
  delegationFramework: DelegationFrameworkSchema.default({}),
  context: z.array(OrgContextSchema).default([]),
});

export type OrgIntentDoc = z.infer<typeof OrgIntentDocSchema>;

// ─── Stored record (includes DB metadata) ────────────────────────────────────

export const OrgIntentRecordSchema = OrgIntentDocSchema.extend({
  id: z.string(),
  isActive: z.boolean().default(false),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type OrgIntentRecord = z.infer<typeof OrgIntentRecordSchema>;

// ─── Enforcement log entry ────────────────────────────────────────────────────

export const EnforcementEventTypeSchema = z.enum([
  'boundary_violated',
  'action_blocked',
  'action_allowed',
  'goal_activated',
  'goal_completed',
  'intent_signal_degraded',
  'policy_warn',
  'policy_block',
]);

export type EnforcementEventType = z.infer<typeof EnforcementEventTypeSchema>;

export interface EnforcementLogEntry {
  id?: string;
  eventType: EnforcementEventType;
  itemId?: string;
  rule: string;
  rationale?: string;
  actionAttempted?: string;
  agentId?: string;
  sessionId?: string;
  personalityId?: string;
  metadata?: Record<string, unknown>;
  createdAt?: number;
}

// ─── Signal read result ───────────────────────────────────────────────────────

export type SignalStatus = 'healthy' | 'warning' | 'critical';

export interface SignalReadResult {
  signalId: string;
  value: number | null;
  threshold: number;
  direction: Signal['direction'];
  status: SignalStatus;
  message: string;
}
