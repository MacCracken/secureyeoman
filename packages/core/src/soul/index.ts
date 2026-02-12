/**
 * Soul Module — Personality, Skills & Sacred Archetypes for FRIDAY
 *
 * In Our Image: No-Thing-Ness → The One (Soul) → The Plurality (Spirit/Brain/Body)
 */

export { SACRED_ARCHETYPES, composeArchetypesPreamble, type Archetype } from './archetypes.js';
export { SoulStorage } from './storage.js';
export { SoulManager } from './manager.js';

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
  SoulManagerDeps,
  SoulManagerWithBrainDeps,
  SkillFilter,
} from './types.js';
