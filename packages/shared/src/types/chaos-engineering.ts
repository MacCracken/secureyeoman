/**
 * Chaos Engineering Types — Fault injection for workflow resilience testing.
 *
 * Defines the type system for chaos experiments that inject controlled
 * failures into workflows, services, and dependencies to validate
 * resilience and recovery behaviour.
 */

import { z } from 'zod';

// ── Fault Types ──────────────────────────────────────────────────────

export const FaultTypeSchema = z.enum([
  'latency',
  'error',
  'timeout',
  'resource_exhaustion',
  'dependency_failure',
  'data_corruption',
  'circuit_breaker_trip',
  'rate_limit',
]);
export type FaultType = z.infer<typeof FaultTypeSchema>;

// ── Target Types ─────────────────────────────────────────────────────

export const ChaosTargetTypeSchema = z.enum([
  'workflow_step',
  'ai_provider',
  'integration',
  'brain_storage',
  'external_api',
  'circuit_breaker',
  'message_router',
]);
export type ChaosTargetType = z.infer<typeof ChaosTargetTypeSchema>;

// ── Experiment Status ────────────────────────────────────────────────

export const ChaosExperimentStatusSchema = z.enum([
  'draft',
  'scheduled',
  'running',
  'paused',
  'completed',
  'failed',
  'aborted',
]);
export type ChaosExperimentStatus = z.infer<typeof ChaosExperimentStatusSchema>;

// ── Fault Configuration ──────────────────────────────────────────────

export const LatencyFaultConfigSchema = z.object({
  type: z.literal('latency'),
  minMs: z.number().int().min(0).default(100),
  maxMs: z.number().int().min(1).default(5000),
  distribution: z.enum(['uniform', 'normal', 'exponential']).default('uniform'),
});
export type LatencyFaultConfig = z.infer<typeof LatencyFaultConfigSchema>;

export const ErrorFaultConfigSchema = z.object({
  type: z.literal('error'),
  errorCode: z.number().int().min(400).max(599).default(500),
  errorMessage: z.string().default('Chaos-injected error'),
});
export type ErrorFaultConfig = z.infer<typeof ErrorFaultConfigSchema>;

export const TimeoutFaultConfigSchema = z.object({
  type: z.literal('timeout'),
  timeoutMs: z.number().int().min(1).default(30000),
});
export type TimeoutFaultConfig = z.infer<typeof TimeoutFaultConfigSchema>;

export const ResourceExhaustionFaultConfigSchema = z.object({
  type: z.literal('resource_exhaustion'),
  resource: z.enum(['memory', 'cpu', 'connections', 'disk']).default('memory'),
  pressure: z.number().min(0).max(1).default(0.8),
  durationMs: z.number().int().min(1).default(10000),
});
export type ResourceExhaustionFaultConfig = z.infer<typeof ResourceExhaustionFaultConfigSchema>;

export const DependencyFailureFaultConfigSchema = z.object({
  type: z.literal('dependency_failure'),
  dependencyName: z.string().min(1),
  failureMode: z.enum(['unavailable', 'partial', 'intermittent']).default('unavailable'),
  recoveryAfterMs: z.number().int().min(0).default(0),
});
export type DependencyFailureFaultConfig = z.infer<typeof DependencyFailureFaultConfigSchema>;

export const DataCorruptionFaultConfigSchema = z.object({
  type: z.literal('data_corruption'),
  corruptionType: z.enum(['truncate', 'scramble', 'empty', 'invalid_encoding']).default('scramble'),
  targetField: z.string().optional(),
});
export type DataCorruptionFaultConfig = z.infer<typeof DataCorruptionFaultConfigSchema>;

export const CircuitBreakerTripFaultConfigSchema = z.object({
  type: z.literal('circuit_breaker_trip'),
  breakerName: z.string().min(1),
  holdOpenMs: z.number().int().min(1).default(30000),
});
export type CircuitBreakerTripFaultConfig = z.infer<typeof CircuitBreakerTripFaultConfigSchema>;

export const RateLimitFaultConfigSchema = z.object({
  type: z.literal('rate_limit'),
  maxRequestsPerSec: z.number().int().min(0).default(1),
  burstSize: z.number().int().min(0).default(0),
});
export type RateLimitFaultConfig = z.infer<typeof RateLimitFaultConfigSchema>;

export const FaultConfigSchema = z.discriminatedUnion('type', [
  LatencyFaultConfigSchema,
  ErrorFaultConfigSchema,
  TimeoutFaultConfigSchema,
  ResourceExhaustionFaultConfigSchema,
  DependencyFailureFaultConfigSchema,
  DataCorruptionFaultConfigSchema,
  CircuitBreakerTripFaultConfigSchema,
  RateLimitFaultConfigSchema,
]);
export type FaultConfig = z.infer<typeof FaultConfigSchema>;

// ── Fault Rule ───────────────────────────────────────────────────────

export const FaultRuleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  targetType: ChaosTargetTypeSchema,
  targetId: z.string().min(1),
  fault: FaultConfigSchema,
  probability: z.number().min(0).max(1).default(1),
  enabled: z.boolean().default(true),
});
export type FaultRule = z.infer<typeof FaultRuleSchema>;

// ── Experiment ───────────────────────────────────────────────────────

export const ChaosExperimentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().default(''),
  status: ChaosExperimentStatusSchema.default('draft'),
  rules: z.array(FaultRuleSchema).min(1),
  durationMs: z.number().int().min(1000).default(60000),
  steadyStateHypothesis: z.string().default(''),
  rollbackOnFailure: z.boolean().default(true),
  scheduledAt: z.number().default(0),
  startedAt: z.number().default(0),
  completedAt: z.number().default(0),
  tenantId: z.string().default('default'),
  createdBy: z.string().default('system'),
  createdAt: z.number().default(0),
});
export type ChaosExperiment = z.infer<typeof ChaosExperimentSchema>;

export const ChaosExperimentCreateSchema = ChaosExperimentSchema.omit({
  id: true,
  status: true,
  startedAt: true,
  completedAt: true,
  createdAt: true,
});
export type ChaosExperimentCreate = z.infer<typeof ChaosExperimentCreateSchema>;

// ── Experiment Result ────────────────────────────────────────────────

export const FaultInjectionResultSchema = z.object({
  ruleId: z.string(),
  ruleName: z.string(),
  faultType: FaultTypeSchema,
  injectedAt: z.number(),
  durationMs: z.number(),
  targetType: ChaosTargetTypeSchema,
  targetId: z.string(),
  impactObserved: z.string().default(''),
  recovered: z.boolean().default(false),
  recoveryTimeMs: z.number().default(0),
  error: z.string().optional(),
});
export type FaultInjectionResult = z.infer<typeof FaultInjectionResultSchema>;

export const ChaosExperimentResultSchema = z.object({
  experimentId: z.string(),
  status: z.enum(['passed', 'failed', 'aborted']),
  startedAt: z.number(),
  completedAt: z.number(),
  durationMs: z.number(),
  faultResults: z.array(FaultInjectionResultSchema).default([]),
  steadyStateValidated: z.boolean().default(false),
  summary: z.string().default(''),
  metrics: z
    .object({
      totalFaultsInjected: z.number().default(0),
      faultsRecovered: z.number().default(0),
      meanRecoveryTimeMs: z.number().default(0),
      circuitBreakersTripped: z.number().default(0),
    })
    .default({}),
});
export type ChaosExperimentResult = z.infer<typeof ChaosExperimentResultSchema>;

// ── Config ───────────────────────────────────────────────────────────

export const ChaosEngineeringConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    maxConcurrentExperiments: z.number().int().min(1).default(3),
    maxExperimentDurationMs: z.number().int().min(1000).default(600_000),
    retainResults: z.number().int().min(1).default(200),
    safeMode: z.boolean().default(true),
    allowedTargetTypes: z
      .array(ChaosTargetTypeSchema)
      .default(['workflow_step', 'ai_provider', 'integration', 'circuit_breaker']),
  })
  .default({});
export type ChaosEngineeringConfig = z.infer<typeof ChaosEngineeringConfigSchema>;
