/**
 * Skill Marketplace Types
 */

import { z } from 'zod';
import { ToolSchema } from './ai.js';

export const AuthorInfoSchema = z.object({
  name: z.string().max(200).default(''),
  github: z.string().max(200).optional(),
  website: z.string().url().optional(),
  license: z.string().max(100).optional(),
});
export type AuthorInfo = z.infer<typeof AuthorInfoSchema>;

export const MarketplaceSkillSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  version: z.string().max(50).default('1.0.0'),
  author: z.string().max(200).default(''),
  authorInfo: AuthorInfoSchema.optional(),
  category: z.string().max(100).default('general'),
  tags: z.array(z.string().max(50)).default([]),
  downloadCount: z.number().int().nonnegative().default(0),
  rating: z.number().min(0).max(5).default(0),
  instructions: z.string().max(8000).default(''),
  tools: z.array(ToolSchema).default([]),
  installed: z.boolean().default(false),
  source: z.enum(['builtin', 'community', 'published']).default('published'),
  publishedAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
export type MarketplaceSkill = z.infer<typeof MarketplaceSkillSchema>;

export const MarketplaceSearchSchema = z.object({
  query: z.string().max(200).default(''),
  category: z.string().max(100).optional(),
  tags: z.array(z.string()).optional(),
  sortBy: z.enum(['name', 'downloads', 'rating', 'recent']).default('downloads'),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().nonnegative().default(0),
});
export type MarketplaceSearch = z.infer<typeof MarketplaceSearchSchema>;
