/**
 * Custom Dashboard Types
 */

import { z } from 'zod';

export const WidgetTypeSchema = z.enum([
  'metrics_graph',
  'task_summary',
  'security_events',
  'resource_monitor',
  'cost_tracker',
  'audit_log',
  'custom_text',
  'connection_status',
]);
export type WidgetType = z.infer<typeof WidgetTypeSchema>;

export const DashboardWidgetSchema = z.object({
  id: z.string().min(1),
  type: WidgetTypeSchema,
  title: z.string().min(1).max(200),
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  w: z.number().int().min(1).max(12).default(4),
  h: z.number().int().min(1).max(12).default(3),
  config: z.record(z.string(), z.unknown()).default({}),
});
export type DashboardWidget = z.infer<typeof DashboardWidgetSchema>;

export const CustomDashboardSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).default(''),
  widgets: z.array(DashboardWidgetSchema).default([]),
  isDefault: z.boolean().default(false),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
export type CustomDashboard = z.infer<typeof CustomDashboardSchema>;

export const CustomDashboardCreateSchema = CustomDashboardSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type CustomDashboardCreate = z.infer<typeof CustomDashboardCreateSchema>;
