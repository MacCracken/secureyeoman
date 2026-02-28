/**
 * MCP (Model Context Protocol) Types
 *
 * Schemas for MCP server configuration, tool definitions, and resource definitions.
 */

import { z } from 'zod';

// ─── MCP Transport ─────────────────────────────────────────

export const McpTransportSchema = z.enum(['stdio', 'streamable-http']);
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
  /** Externally-reachable URL this MCP server advertises to core during auto-registration.
   *  Defaults to http://{host}:{port}. In Docker set MCP_ADVERTISE_URL to the service URL. */
  advertiseUrl: z.string().url().optional(),
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
  exposeDesktopControl: z.boolean().default(false),
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
  exposeQuickBooksTools: z.boolean().default(false),
  quickBooksEnvironment: z.enum(['sandbox', 'production']).default('sandbox'),
  quickBooksClientId: z.string().optional(),
  quickBooksClientSecret: z.string().optional(),
  quickBooksRealmId: z.string().optional(),
  quickBooksRefreshToken: z.string().optional(),
  /** Enable network evaluation and protection tools (46.1–46.8). Off by default. */
  exposeNetworkTools: z.boolean().default(false),
  /** CIDR/hostname allowlist for active network probing (SSH, ping, traceroute). Empty = deny all active tools. Wildcard '*' disables scope enforcement. */
  allowedNetworkTargets: z.array(z.string()).default([]),
  /** NetBox API base URL, e.g. https://netbox.example.com */
  netboxUrl: z.string().url().optional(),
  /** NetBox API token (read-only or read-write depending on allowNetBoxWrite). */
  netboxToken: z.string().optional(),
  /** NVD API key — optional; raises rate limit from 5 req/30s to 50 req/30s. */
  nvdApiKey: z.string().optional(),
  /** Enable Twingate resource management + MCP proxy tools. Off by default. */
  exposeTwingateTools: z.boolean().default(false),
  /** Twingate tenant name (e.g. "acme" → acme.twingate.com). From env TWINGATE_NETWORK. */
  twingateNetwork: z.string().optional(),
  /** Twingate tenant API key. From env TWINGATE_API_KEY. */
  twingateApiKey: z.string().optional(),
  /** Enable organizational intent tools (signal read). Off by default — requires allowOrgIntent in Security Settings. */
  exposeOrgIntentTools: z.boolean().default(false),
  /** When true (default), honour Content-Signal: ai-input=no and refuse to feed blocked content to the agent. Set MCP_RESPECT_CONTENT_SIGNAL=false to override. */
  respectContentSignal: z.boolean().default(true),
  allowBruteForce: z.boolean().default(false),
  /** Enable Docker management tools (ps, logs, exec, images, compose). Off by default. Set MCP_EXPOSE_DOCKER=true. */
  exposeDockerTools: z.boolean().default(false),
  /** How the MCP container reaches Docker: 'socket' = host /var/run/docker.sock, 'dind' = Docker-in-Docker sidecar. */
  dockerMode: z.enum(['socket', 'dind']).default('socket'),
  /** DOCKER_HOST override for DinD mode (e.g. tcp://docker:2376). Ignored in socket mode. */
  dockerHost: z.string().optional(),
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
