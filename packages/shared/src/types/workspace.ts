/**
 * Team Workspace Types
 */

import { z } from 'zod';

export const WorkspaceRoleSchema = z.enum(['owner', 'admin', 'member', 'viewer']);
export type WorkspaceRole = z.infer<typeof WorkspaceRoleSchema>;

export const WorkspaceMemberSchema = z.object({
  userId: z.string().min(1),
  role: WorkspaceRoleSchema.default('member'),
  joinedAt: z.number().int().nonnegative(),
});
export type WorkspaceMember = z.infer<typeof WorkspaceMemberSchema>;

export const WorkspaceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).default(''),
  members: z.array(WorkspaceMemberSchema).default([]),
  settings: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;

export const WorkspaceCreateSchema = WorkspaceSchema.omit({
  id: true,
  members: true,
  createdAt: true,
  updatedAt: true,
});
export type WorkspaceCreate = z.infer<typeof WorkspaceCreateSchema>;
