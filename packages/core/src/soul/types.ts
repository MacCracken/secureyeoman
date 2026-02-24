/**
 * Soul Module — Internal Types
 *
 * Re-exports shared types and defines internal interfaces.
 */

export type {
  Personality,
  PersonalityCreate,
  PersonalityUpdate,
  Skill,
  SkillCreate,
  SkillUpdate,
  SkillSource,
  SkillStatus,
  LearningMode,
  SoulConfig,
  UserProfile,
  UserProfileCreate,
  UserProfileUpdate,
  UserRelationship,
  HeartbeatConfig,
  HeartbeatCheck,
  HeartbeatCheckType,
  ExternalBrainConfig,
  ExternalBrainProvider,
} from '@secureyeoman/shared';

export type { Tool } from '@secureyeoman/shared';

import type { AuditChain } from '../logging/audit-chain.js';
import type { SecureLogger } from '../logging/logger.js';
import type { BrainManager } from '../brain/manager.js';
import type { SecurityConfig } from '@secureyeoman/shared';

export interface SoulManagerDeps {
  auditChain: AuditChain;
  logger: SecureLogger;
  /** Top-level security config; used by composeBodyPrompt() to gate creation tools against policy */
  securityConfig?: SecurityConfig;
}

export interface SoulManagerWithBrainDeps extends SoulManagerDeps {
  brain?: BrainManager;
}

export interface SkillFilter {
  status?: string;
  source?: string;
  enabled?: boolean;
  /** Exact personality filter (use with personalityId in brain/types SkillFilter) */
  personalityId?: string | null;
  /** Return skills for this personality AND global skills (personality_id IS NULL) */
  forPersonalityId?: string;
}
