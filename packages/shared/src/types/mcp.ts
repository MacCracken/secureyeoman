/**
 * MCP (Model Context Protocol) Types
 *
 * Schemas for MCP server configuration, tool definitions, and resource definitions.
 */

import { z } from 'zod';

// ─── MCP Server Config ──────────────────────────────────────

export const McpTransportSchema = z.enum(['stdio', 'sse', 'streamable-http']);
export type McpTransport = z.infer<typeof McpTransportSchema>;

export const McpServerConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).default(''),
  transport: McpTransportSchema.default('stdio'),
  command: z.string().max(4096).optional(),
  args: z.array(z.string()).default([]),
  url: z.string().url().optional(),
  env: z.record(z.string(), z.string()).default({}),
  enabled: z.boolean().default(true),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;

export const McpServerCreateSchema = McpServerConfigSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type McpServerCreate = z.infer<typeof McpServerCreateSchema>;

// ─── MCP Tool Definition ────────────────────────────────────

export const McpToolDefSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  inputSchema: z.record(z.string(), z.unknown()).default({}),
  serverId: z.string().min(1),
  serverName: z.string().min(1),
});

export type McpToolDef = z.infer<typeof McpToolDefSchema>;

// ─── MCP Resource Definition ────────────────────────────────

export const McpResourceDefSchema = z.object({
  uri: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  mimeType: z.string().max(200).default('text/plain'),
  serverId: z.string().min(1),
  serverName: z.string().min(1),
});

export type McpResourceDef = z.infer<typeof McpResourceDefSchema>;

// ─── MCP Config Section ─────────────────────────────────────

export const McpConfigSchema = z.object({
  enabled: z.boolean().default(false),
  serverPort: z.number().int().min(1024).max(65535).default(3001),
  exposeSkillsAsTools: z.boolean().default(true),
  exposeKnowledgeAsResources: z.boolean().default(true),
}).default({});

export type McpConfig = z.infer<typeof McpConfigSchema>;
