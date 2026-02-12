/**
 * Audit Report Types
 */

import { z } from 'zod';

export const ReportFormatSchema = z.enum(['json', 'html', 'csv']);
export type ReportFormat = z.infer<typeof ReportFormatSchema>;

export const AuditReportOptionsSchema = z.object({
  title: z.string().min(1).max(200).default('Audit Report'),
  format: ReportFormatSchema.default('json'),
  from: z.number().int().nonnegative().optional(),
  to: z.number().int().nonnegative().optional(),
  eventTypes: z.array(z.string()).optional(),
  severities: z.array(z.string()).optional(),
  includeStats: z.boolean().default(true),
  maxEntries: z.number().int().min(1).max(100000).default(10000),
});
export type AuditReportOptions = z.infer<typeof AuditReportOptionsSchema>;

export const AuditReportSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  format: ReportFormatSchema,
  generatedAt: z.number().int().nonnegative(),
  entryCount: z.number().int().nonnegative(),
  filePath: z.string().optional(),
  sizeBytes: z.number().int().nonnegative().default(0),
});
export type AuditReport = z.infer<typeof AuditReportSchema>;
