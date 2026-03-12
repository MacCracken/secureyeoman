/**
 * Simulation Engine — Shared types for tick driver and emotion/mood model.
 *
 * Enterprise-tier licensed feature (`simulation`).
 */

import { z } from 'zod';

// ── Tick Driver ────────────────────────────────────────────────────────

export const SimulationTickModeSchema = z.enum(['realtime', 'accelerated', 'turn_based']);
export type SimulationTickMode = z.infer<typeof SimulationTickModeSchema>;

export const TickConfigSchema = z.object({
  id: z.string(),
  personalityId: z.string(),
  mode: SimulationTickModeSchema,
  tickIntervalMs: z.number().int().min(10).default(1000),
  timeScale: z.number().min(0.01).max(1000).default(1.0),
  paused: z.boolean().default(false),
  currentTick: z.number().int().min(0).default(0),
  simTimeEpoch: z.number().int().min(0).default(0),
  lastTickAt: z.number().int().nullable().default(null),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type TickConfig = z.infer<typeof TickConfigSchema>;

export const TickConfigCreateSchema = z.object({
  personalityId: z.string(),
  mode: SimulationTickModeSchema,
  tickIntervalMs: z.number().int().min(10).default(1000),
  timeScale: z.number().min(0.01).max(1000).default(1.0),
});
export type TickConfigCreate = z.infer<typeof TickConfigCreateSchema>;

export const TickConfigUpdateSchema = z.object({
  mode: SimulationTickModeSchema.optional(),
  tickIntervalMs: z.number().int().min(10).optional(),
  timeScale: z.number().min(0.01).max(1000).optional(),
});
export type TickConfigUpdate = z.infer<typeof TickConfigUpdateSchema>;

export interface TickEvent {
  tick: number;
  simTime: number;
  personalityId: string;
  timestamp: number;
}

// ── Emotion & Mood ─────────────────────────────────────────────────────

export const MoodLabelSchema = z.enum([
  'ecstatic',
  'excited',
  'happy',
  'content',
  'calm',
  'neutral',
  'melancholy',
  'sad',
  'angry',
  'anxious',
]);
export type MoodLabel = z.infer<typeof MoodLabelSchema>;

export const MoodStateSchema = z.object({
  id: z.string(),
  personalityId: z.string(),
  valence: z.number().min(-1).max(1).default(0),
  arousal: z.number().min(0).max(1).default(0),
  dominance: z.number().min(0).max(1).default(0.5),
  label: MoodLabelSchema.default('neutral'),
  decayRate: z.number().min(0).max(1).default(0.05),
  baselineValence: z.number().min(-1).max(1).default(0),
  baselineArousal: z.number().min(0).max(1).default(0),
  updatedAt: z.number().int(),
});
export type MoodState = z.infer<typeof MoodStateSchema>;

export const MoodEventCreateSchema = z.object({
  eventType: z.string(),
  valenceDelta: z.number().min(-2).max(2).default(0),
  arousalDelta: z.number().min(-1).max(1).default(0),
  source: z.string().default('system'),
  metadata: z.record(z.unknown()).default({}),
});
export type MoodEventCreate = z.infer<typeof MoodEventCreateSchema>;

// ── Spatial & Proximity ────────────────────────────────────────────────

export const EntityLocationSchema = z.object({
  id: z.string(),
  personalityId: z.string(),
  entityId: z.string(),
  entityType: z.string(),
  zoneId: z.string(),
  x: z.number(),
  y: z.number(),
  z: z.number().default(0),
  heading: z.number().min(0).max(360).default(0),
  speed: z.number().min(0).default(0),
  metadata: z.record(z.unknown()).default({}),
  updatedAt: z.number().int(),
});
export type EntityLocation = z.infer<typeof EntityLocationSchema>;

export const EntityLocationUpsertSchema = z.object({
  entityId: z.string(),
  entityType: z.string(),
  zoneId: z.string(),
  x: z.number(),
  y: z.number(),
  z: z.number().default(0),
  heading: z.number().min(0).max(360).default(0),
  speed: z.number().min(0).default(0),
  metadata: z.record(z.unknown()).default({}),
});
export type EntityLocationUpsert = z.infer<typeof EntityLocationUpsertSchema>;

export const SpatialZoneSchema = z.object({
  id: z.string(),
  personalityId: z.string(),
  zoneId: z.string(),
  name: z.string(),
  minX: z.number(),
  minY: z.number(),
  maxX: z.number(),
  maxY: z.number(),
  properties: z.record(z.unknown()).default({}),
  createdAt: z.number().int(),
});
export type SpatialZone = z.infer<typeof SpatialZoneSchema>;

export const SpatialZoneCreateSchema = z.object({
  zoneId: z.string(),
  name: z.string(),
  minX: z.number(),
  minY: z.number(),
  maxX: z.number(),
  maxY: z.number(),
  properties: z.record(z.unknown()).default({}),
});
export type SpatialZoneCreate = z.infer<typeof SpatialZoneCreateSchema>;

export const ProximityTriggerTypeSchema = z.enum([
  'enter_radius',
  'leave_radius',
  'enter_zone',
  'leave_zone',
  'approach',
  'depart',
]);
export type ProximityTriggerType = z.infer<typeof ProximityTriggerTypeSchema>;

export const ProximityRuleSchema = z.object({
  id: z.string(),
  personalityId: z.string(),
  triggerType: ProximityTriggerTypeSchema,
  sourceEntityId: z.string().nullable().default(null),
  targetEntityId: z.string().nullable().default(null),
  targetZoneId: z.string().nullable().default(null),
  radiusThreshold: z.number().min(0).default(0),
  cooldownMs: z.number().int().min(0).default(0),
  moodEffect: z
    .object({
      valenceDelta: z.number().default(0),
      arousalDelta: z.number().default(0),
    })
    .nullable()
    .default(null),
  enabled: z.boolean().default(true),
  createdAt: z.number().int(),
});
export type ProximityRule = z.infer<typeof ProximityRuleSchema>;

export const ProximityRuleCreateSchema = z.object({
  triggerType: ProximityTriggerTypeSchema,
  sourceEntityId: z.string().nullable().default(null),
  targetEntityId: z.string().nullable().default(null),
  targetZoneId: z.string().nullable().default(null),
  radiusThreshold: z.number().min(0).default(0),
  cooldownMs: z.number().int().min(0).default(0),
  moodEffect: z
    .object({
      valenceDelta: z.number().default(0),
      arousalDelta: z.number().default(0),
    })
    .nullable()
    .default(null),
  enabled: z.boolean().default(true),
});
export type ProximityRuleCreate = z.infer<typeof ProximityRuleCreateSchema>;

export const ProximityEventSchema = z.object({
  id: z.string(),
  personalityId: z.string(),
  ruleId: z.string().nullable(),
  triggerType: ProximityTriggerTypeSchema,
  sourceEntityId: z.string(),
  targetEntityId: z.string().nullable(),
  targetZoneId: z.string().nullable(),
  distance: z.number(),
  tick: z.number().int(),
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.number().int(),
});
export type ProximityEvent = z.infer<typeof ProximityEventSchema>;

export const MoodEventSchema = z.object({
  id: z.string(),
  personalityId: z.string(),
  eventType: z.string(),
  valenceDelta: z.number(),
  arousalDelta: z.number(),
  source: z.string(),
  metadata: z.record(z.unknown()),
  createdAt: z.number().int(),
});
export type MoodEvent = z.infer<typeof MoodEventSchema>;

// ── Entity Relationships ──────────────────────────────────────────────

export const RelationshipTypeSchema = z.enum([
  'ally',
  'rival',
  'neutral',
  'mentor',
  'student',
  'trade_partner',
  'family',
  'custom',
]);
export type RelationshipType = z.infer<typeof RelationshipTypeSchema>;

export const EntityRelationshipSchema = z.object({
  id: z.string(),
  personalityId: z.string(),
  sourceEntityId: z.string(),
  targetEntityId: z.string(),
  type: RelationshipTypeSchema,
  affinity: z.number().min(-1).max(1).default(0),
  trust: z.number().min(0).max(1).default(0.5),
  interactionCount: z.number().int().min(0).default(0),
  decayRate: z.number().min(0).max(1).default(0.01),
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type EntityRelationship = z.infer<typeof EntityRelationshipSchema>;

export const EntityRelationshipCreateSchema = z.object({
  sourceEntityId: z.string(),
  targetEntityId: z.string(),
  type: RelationshipTypeSchema.default('neutral'),
  affinity: z.number().min(-1).max(1).default(0),
  trust: z.number().min(0).max(1).default(0.5),
  decayRate: z.number().min(0).max(1).default(0.01),
  metadata: z.record(z.unknown()).default({}),
});
export type EntityRelationshipCreate = z.infer<typeof EntityRelationshipCreateSchema>;

export const RelationshipEventCreateSchema = z.object({
  sourceEntityId: z.string(),
  targetEntityId: z.string(),
  eventType: z.string(),
  affinityDelta: z.number().min(-2).max(2).default(0),
  trustDelta: z.number().min(-1).max(1).default(0),
  source: z.string().default('system'),
  moodEffect: z
    .object({
      valenceDelta: z.number().default(0),
      arousalDelta: z.number().default(0),
    })
    .nullable()
    .default(null),
  metadata: z.record(z.unknown()).default({}),
});
export type RelationshipEventCreate = z.infer<typeof RelationshipEventCreateSchema>;

export const RelationshipEventSchema = z.object({
  id: z.string(),
  personalityId: z.string(),
  sourceEntityId: z.string(),
  targetEntityId: z.string(),
  eventType: z.string(),
  affinityDelta: z.number(),
  trustDelta: z.number(),
  source: z.string(),
  metadata: z.record(z.unknown()),
  createdAt: z.number().int(),
});
export type RelationshipEvent = z.infer<typeof RelationshipEventSchema>;

export const EntityGroupSchema = z.object({
  id: z.string(),
  personalityId: z.string(),
  groupId: z.string(),
  name: z.string(),
  members: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.number().int(),
});
export type EntityGroup = z.infer<typeof EntityGroupSchema>;

export const EntityGroupCreateSchema = z.object({
  groupId: z.string(),
  name: z.string(),
  members: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).default({}),
});
export type EntityGroupCreate = z.infer<typeof EntityGroupCreateSchema>;
