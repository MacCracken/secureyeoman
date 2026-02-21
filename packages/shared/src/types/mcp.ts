/**
 * MCP (Model Context Protocol) Types
 *
 * Schemas for MCP server configuration, tool definitions, and resource definitions.
 */

import { z } from 'zod';

// ─── MCP Transport ─────────────────────────────────────────

export const McpTransportSchema = z.enum(['stdio', 'sse', 'streamable-http']);
export type McpTransport = z.infer<typeof McpTransportSchema>;

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

// ─── MCP Tool Manifest (without server info — provided during registration) ──

export const McpToolManifestSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  inputSchema: z.record(z.string(), z.unknown()).default({}),
});

export type McpToolManifest = z.infer<typeof McpToolManifestSchema>;

// ─── MCP Server Config ──────────────────────────────────────

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
}).extend({
  tools: z.array(McpToolManifestSchema).optional(),
});
export type McpServerCreate = z.infer<typeof McpServerCreateSchema>;

// ─── MCP Service Config (for @secureyeoman/mcp package) ──────────

export const McpServiceConfigSchema = z.object({
  enabled: z.boolean().default(true),
  port: z.number().int().min(1024).max(65535).default(3001),
  host: z.string().default('127.0.0.1'),
  transport: McpTransportSchema.default('streamable-http'),
  autoRegister: z.boolean().default(true),
  coreUrl: z.string().url().default('http://127.0.0.1:18789'),
  tokenSecret: z.string().min(32).optional(),
  exposeFilesystem: z.boolean().default(false),
  allowedPaths: z.array(z.string()).default([]),
  exposeWeb: z.boolean().default(false),
  allowedUrls: z.array(z.string()).default([]),
  webRateLimitPerMinute: z.number().int().min(1).max(100).default(10),
  exposeWebScraping: z.boolean().default(true),
  exposeWebSearch: z.boolean().default(true),
  webSearchProvider: z.enum(['duckduckgo', 'serpapi', 'tavily']).default('duckduckgo'),
  webSearchApiKey: z.string().optional(),
  exposeBrowser: z.boolean().default(false),
  browserEngine: z.enum(['playwright', 'puppeteer']).default('playwright'),
  browserHeadless: z.boolean().default(true),
  browserMaxPages: z.number().int().min(1).max(10).default(3),
  browserTimeoutMs: z.number().int().min(5000).max(120000).default(30000),
  rateLimitPerTool: z.number().int().min(1).max(1000).default(30),
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  proxyEnabled: z.boolean().default(false),
  proxyProviders: z.array(z.enum(['brightdata', 'scrapingbee', 'scraperapi'])).default([]),
  proxyStrategy: z.enum(['round-robin', 'random']).default('round-robin'),
  proxyDefaultCountry: z.string().length(2).optional(),
  proxyBrightdataUrl: z.string().optional(),
  proxyScrapingbeeKey: z.string().optional(),
  proxyScraperapiKey: z.string().optional(),
  proxyMaxRetries: z.number().int().min(0).max(10).default(3),
  proxyRetryBaseDelayMs: z.number().int().min(100).max(10000).default(1000),
  exposeSecurityTools: z.boolean().default(false),
  securityToolsMode: z.enum(['native', 'docker-exec']).default('native'),
  securityToolsContainer: z.string().default('kali-sy-toolkit'),
  allowedTargets: z.array(z.string()).default([]),
  shodanApiKey: z.string().optional(),
  exposeAgnosticTools: z.boolean().default(false),
  agnosticUrl: z.string().url().default('http://127.0.0.1:8000'),
  agnosticEmail: z.string().optional(),
  agnosticPassword: z.string().optional(),
  agnosticApiKey: z.string().optional(),
});

export type McpServiceConfig = z.infer<typeof McpServiceConfigSchema>;

// ─── MCP Config Section ─────────────────────────────────────

export const McpConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    serverPort: z.number().int().min(1024).max(65535).default(3001),
    exposeSkillsAsTools: z.boolean().default(true),
    exposeKnowledgeAsResources: z.boolean().default(true),
  })
  .default({});

export type McpConfig = z.infer<typeof McpConfigSchema>;

// ─── MCP Server Health ─────────────────────────────────────

export const McpServerHealthSchema = z.object({
  serverId: z.string().min(1),
  status: z.enum(['healthy', 'degraded', 'unhealthy', 'unknown']).default('unknown'),
  latencyMs: z.number().nonnegative().nullable().default(null),
  consecutiveFailures: z.number().int().nonnegative().default(0),
  lastCheckedAt: z.number().int().nonnegative().nullable().default(null),
  lastSuccessAt: z.number().int().nonnegative().nullable().default(null),
  lastError: z.string().nullable().default(null),
});

export type McpServerHealth = z.infer<typeof McpServerHealthSchema>;
