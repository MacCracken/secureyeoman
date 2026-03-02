/**
 * Skill Marketplace Types
 *
 * CatalogSkillSchema extends BaseSkillSchema (from soul.ts) with catalog-specific
 * fields — version, author, ratings, install state, etc. Both catalog and brain
 * skills share the same base so routing/autonomy/mcpToolsAllowed fields are always
 * present on both sides of the install boundary.
 */

import { z } from 'zod';
import { BaseSkillSchema } from './soul.js';

export const AuthorInfoSchema = z.object({
  name: z.string().max(200).default(''),
  github: z.string().max(200).optional(),
  website: z.string().url().optional(),
  license: z.string().max(100).optional(),
});
export type AuthorInfo = z.infer<typeof AuthorInfoSchema>;

/**
 * CatalogSkillSchema — a skill as it exists in the marketplace/community catalog
 * (pre-install). Extends BaseSkillSchema so it carries the same routing quality
 * and mcpToolsAllowed fields that get passed through to the brain on install.
 *
 * `origin` is a derived field (computed from `source` in rowToSkill, not stored
 * as a separate DB column): 'community' when source='community', else 'marketplace'.
 */
export const CatalogSkillSchema = BaseSkillSchema.extend({
  version: z.string().max(50).default('2026.3.1'),
  author: z.string().max(200).default(''),
  authorInfo: AuthorInfoSchema.optional(),
  category: z.string().max(100).default('general'),
  tags: z.array(z.string().max(50)).default([]),
  downloadCount: z.number().int().nonnegative().default(0),
  rating: z.number().min(0).max(5).default(0),
  installed: z.boolean().default(false),
  installedGlobally: z.boolean().default(false),
  source: z.enum(['builtin', 'community', 'published']).default('published'),
  /** Derived from `source`: 'community' when source='community', else 'marketplace'. */
  origin: z.enum(['marketplace', 'community']).default('marketplace'),
  publishedAt: z.number().int().nonnegative(),
});
export type CatalogSkill = z.infer<typeof CatalogSkillSchema>;

/** @deprecated Use CatalogSkillSchema. Kept for backward compatibility. */
export const MarketplaceSkillSchema = CatalogSkillSchema;
/** @deprecated Use CatalogSkill. Kept for backward compatibility. */
export type MarketplaceSkill = CatalogSkill;

export const MarketplaceSearchSchema = z.object({
  query: z.string().max(200).default(''),
  category: z.string().max(100).optional(),
  tags: z.array(z.string()).optional(),
  sortBy: z.enum(['name', 'downloads', 'rating', 'recent']).default('downloads'),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().nonnegative().default(0),
});
export type MarketplaceSearch = z.infer<typeof MarketplaceSearchSchema>;
