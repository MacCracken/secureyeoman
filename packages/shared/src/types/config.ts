/**
 * Configuration Types for SecureYeoman
 *
 * Security considerations:
 * - Secret values are never stored in config, only references (env vars)
 * - All paths are validated to prevent path traversal
 * - Timeouts and limits have maximum bounds
 */

import { z } from 'zod';
import {
  SoulConfigSchema,
  BrainConfigSchema,
  SpiritConfigSchema,
  BodyConfigSchema,
  CommsConfigSchema,
  HeartbeatConfigSchema,
  ExternalBrainConfigSchema,
} from './soul.js';
import { ContentGuardrailConfigSchema } from './content-guardrail.js';
import { ExternalizationPolicySchema } from './sandbox-scanning.js';
import { z as zz } from 'zod';

// ─── History Compression Config ─────────────────────────────────
export const HistoryCompressionConfigSchema = zz
  .object({
    enabled: zz.boolean().default(false),
    tiers: zz
      .object({
        messagePct: zz.number().min(0).max(100).default(50),
        topicPct: zz.number().min(0).max(100).default(30),
        bulkPct: zz.number().min(0).max(100).default(20),
      })
      .default({}),
    maxMessageChars: zz.number().int().positive().default(100000),
    topicSummaryTokens: zz.number().int().positive().default(200),
    bulkSummaryTokens: zz.number().int().positive().default(300),
    bulkMergeSize: zz.number().int().positive().default(5),
    topicBoundary: zz
      .object({
        keywords: zz
          .array(zz.string())
          .default(['new topic', "let's move on", 'moving on', 'anyway', 'switching to']),
        silenceMinutes: zz.number().positive().default(15),
        tokenThreshold: zz.number().int().positive().default(2000),
      })
      .default({}),
    model: zz.string().nullable().default(null),
  })
  .default({});

export type HistoryCompressionConfig = zz.infer<typeof HistoryCompressionConfigSchema>;

export const ConversationConfigSchema = zz
  .object({
    compression: HistoryCompressionConfigSchema,
  })
  .default({});

export type ConversationConfig = zz.infer<typeof ConversationConfigSchema>;
import { McpConfigSchema } from './mcp.js';
import { DelegationConfigSchema } from './delegation.js';
import { ProactiveConfigSchema } from './proactive.js';
import { MultimodalConfigSchema } from './multimodal.js';

// ─── Extension Hooks Config (Phase 6.4a) ──────────────────────────
export const ExtensionConfigSchema = zz
  .object({
    enabled: zz.boolean().default(false),
    directory: zz.string().default('./extensions'),
    allowWebhooks: zz.boolean().default(false),
    webhookTimeout: zz.number().int().positive().max(30000).default(5000),
    maxHooksPerPoint: zz.number().int().positive().max(50).default(10),
  })
  .default({});

export type ExtensionConfig = zz.infer<typeof ExtensionConfigSchema>;

// ─── Code Execution Config (Phase 6.4b) ───────────────────────────
export const ExecutionConfigSchema = zz
  .object({
    enabled: zz.boolean().default(false),
    allowedRuntimes: zz.array(zz.enum(['node', 'python', 'shell'])).default(['node']),
    sessionTimeout: zz.number().int().positive().default(1800000),
    maxConcurrent: zz.number().int().positive().max(20).default(5),
    approvalPolicy: zz.enum(['none', 'first-time', 'always']).default('first-time'),
    secretPatterns: zz.array(zz.string()).default([]),
  })
  .default({});

export type ExecutionConfig = zz.infer<typeof ExecutionConfigSchema>;

// ─── A2A Protocol Config (Phase 6.5) ──────────────────────────────
export const A2AConfigSchema = zz
  .object({
    enabled: zz.boolean().default(false),
    discoveryMethod: zz.enum(['mdns', 'manual', 'hybrid']).default('manual'),
    trustedPeers: zz.array(zz.string()).default([]),
    port: zz.number().int().min(1024).max(65535).default(18790),
    maxPeers: zz.number().int().positive().max(100).default(20),
  })
  .default({});

export type A2AConfig = zz.infer<typeof A2AConfigSchema>;

// Safe path validation (no path traversal)
const SafePathSchema = z
  .string()
  .min(1)
  .max(4096)
  .refine((path) => !path.includes('..') && !path.includes('\0'), {
    message: 'Path contains forbidden characters',
  });

// Environment variable reference (for secrets)
const EnvVarRefSchema = z
  .string()
  .regex(/^[A-Z][A-Z0-9_]*$/, 'Must be a valid environment variable name');

// Database configuration
export const DatabaseConfigSchema = z
  .object({
    host: z.string().default('localhost'),
    port: z.number().default(5432),
    database: z.string().default('secureyeoman'),
    user: z.string().default('secureyeoman'),
    passwordEnv: z.string().default('POSTGRES_PASSWORD'),
    ssl: z.boolean().default(false),
    /** Max PostgreSQL connections in the pool. Increase for multi-user/SaaS deployments. */
    poolSize: z.number().default(10),
  })
  .default({});

export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;

// Core configuration
export const CoreConfigSchema = z.object({
  name: z.string().default('SecureYeoman'),
  environment: z.enum(['development', 'staging', 'production']).default('development'),
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  workspace: SafePathSchema.default('~/.secureyeoman/workspace'),
  dataDir: SafePathSchema.default('~/.secureyeoman/data'),
  database: DatabaseConfigSchema,
});

export type CoreConfig = z.infer<typeof CoreConfigSchema>;

// Security sub-schemas with defaults
const RbacConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    defaultRole: z.enum(['admin', 'operator', 'auditor', 'viewer']).default('viewer'),
  })
  .default({});

const EncryptionConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    algorithm: z.enum(['aes-256-gcm']).default('aes-256-gcm'),
    keyEnv: EnvVarRefSchema.default('SECUREYEOMAN_ENCRYPTION_KEY'),
  })
  .default({});

export const SandboxProxyCredentialSchema = z.object({
  host: z.string().min(1),
  headerName: z.string().min(1),
  headerValue: z.string().min(1),
});

const SandboxConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    technology: z.enum(['auto', 'seccomp', 'landlock', 'none']).default('auto'),
    allowedReadPaths: z.array(z.string()).default([]),
    allowedWritePaths: z.array(z.string()).default([]),
    maxMemoryMb: z.number().int().positive().max(4096).default(1024),
    maxCpuPercent: z.number().int().positive().max(100).default(50),
    maxFileSizeMb: z.number().int().positive().max(10240).default(100),
    networkAllowed: z.boolean().default(true),
    credentialProxy: z
      .object({
        enabled: z.boolean().default(false),
        credentials: z.array(SandboxProxyCredentialSchema).default([]),
        allowedHosts: z.array(z.string()).default([]),
        requestTimeoutMs: z.number().int().positive().max(60000).default(10000),
      })
      .default({}),
  })
  .default({});

const RateLimitingConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    defaultWindowMs: z.number().int().positive().max(3600000).default(60000),
    defaultMaxRequests: z.number().int().positive().max(10000).default(100),
    /** Max login attempts per IP within the login window (default: 5). Set higher in dev. */
    authLoginMaxAttempts: z.number().int().positive().max(1000).default(5),
    /** Login rate-limit window in ms (default: 900000 = 15 min). */
    authLoginWindowMs: z.number().int().positive().max(86400000).default(900000),
    redisUrl: z.string().url().optional(),
    redisPrefix: z.string().max(64).default('secureyeoman:rl').optional(),
  })
  .default({});

const InputValidationConfigSchema = z
  .object({
    maxInputLength: z.number().int().positive().max(10000000).default(100000), // 100KB
    maxFileSize: z.number().int().positive().max(104857600).default(10485760), // 10MB
    enableInjectionDetection: z.boolean().default(true),
    /**
     * Minimum weighted injection score (0–1) to trigger jailbreakAction.
     * Score is computed from matched pattern severities:
     * high=0.6, medium=0.35, low=0.15 — capped at 1.0.
     */
    jailbreakThreshold: z.number().min(0).max(1).default(0.5),
    /**
     * Action when injectionScore ≥ jailbreakThreshold:
     * block      — reject request (400 / SSE error event)
     * warn       — log to audit trail and allow request to proceed
     * audit_only — record score on message, no warning emitted
     */
    jailbreakAction: z.enum(['block', 'warn', 'audit_only']).default('warn'),
  })
  .default({});

// Prompt-assembly injection guard — scans the fully assembled messages array before the LLM call.
// Catches indirect injection that survived the HTTP boundary (via memory, skills, spirit context, etc.).
const PromptGuardConfigSchema = z
  .object({
    /**
     * block — high-severity findings abort the request (HTTP 400 / SSE error).
     * warn  — findings are audit-logged but the request proceeds.
     * disabled — scanning is skipped entirely.
     * Default: warn. Raise to block once you have confidence in the pattern set.
     */
    mode: z.enum(['block', 'warn', 'disabled']).default('warn'),
  })
  .default({});

export type PromptGuardConfig = z.infer<typeof PromptGuardConfigSchema>;

// ResponseGuard configuration (Phase 54)
const ResponseGuardConfigSchema = z
  .object({
    mode: z.enum(['block', 'warn', 'disabled']).default('warn'),
    /**
     * Trigram overlap ratio threshold [0, 1] that triggers a system prompt leak finding.
     * 0.3 = flag when ≥30% of the system prompt's trigrams appear in the response.
     * Only active when security.strictSystemPromptConfidentiality or per-personality override is true.
     */
    systemPromptLeakThreshold: z.number().min(0).max(1).default(0.3),
  })
  .default({});
export type ResponseGuardConfig = z.infer<typeof ResponseGuardConfigSchema>;

// LLMJudge configuration (Phase 54)
const LLMJudgeConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    model: z.string().optional(),
    triggers: z
      .object({
        automationLevels: z.array(z.string()).default(['supervised_auto']),
      })
      .default({}),
  })
  .default({});
export type LLMJudgeConfig = z.infer<typeof LLMJudgeConfigSchema>;

// Security configuration
export const SecurityConfigSchema = z.object({
  rbac: RbacConfigSchema,
  encryption: EncryptionConfigSchema,
  sandbox: SandboxConfigSchema,
  rateLimiting: RateLimitingConfigSchema,
  inputValidation: InputValidationConfigSchema,
  promptGuard: PromptGuardConfigSchema,
  responseGuard: ResponseGuardConfigSchema,
  llmJudge: LLMJudgeConfigSchema,
  /** Top-level kill switch for sub-agent delegation. When false, no personality can enable sub-agents. */
  allowSubAgents: z.boolean().default(false),
  /** Allow sub-agents with type='binary' to spawn child processes. Off by default. */
  allowBinaryAgents: z.boolean().default(false),
  /** Allow A2A (Agent-to-Agent) networking. Sub-item of delegation — requires allowSubAgents to be effective for external peers. */
  allowA2A: z.boolean().default(false),
  /** Allow Agent Swarms — multi-agent orchestration. Sub-item of delegation — requires allowSubAgents to be effective. */
  allowSwarms: z.boolean().default(false),
  /** Allow lifecycle extension hooks. */
  allowExtensions: z.boolean().default(false),
  /** Allow sandboxed code execution. Enabled by default since execution is sandboxed. */
  allowExecution: z.boolean().default(true),
  /** Allow proactive assistance triggers and suggestions. */
  allowProactive: z.boolean().default(false),
  /** Allow workflow orchestration (DAG builder, run history, workflow page). Disabled by default. */
  allowWorkflows: z.boolean().default(false),
  /** Allow A/B experiments. Must be explicitly enabled after initialization. */
  allowExperiments: z.boolean().default(false),
  /** Allow Storybook component development environment in dashboard. */
  allowStorybook: z.boolean().default(false),
  /** Allow multimodal I/O (vision, STT, TTS, image generation). */
  allowMultimodal: z.boolean().default(false),
  /** Allow desktop control capabilities (screen capture, keyboard/mouse). Off by default — prominent warning in UI. */
  allowDesktopControl: z.boolean().default(false),
  /** Allow camera capture. Sub-item of desktop control — only effective when allowDesktopControl is true. */
  allowCamera: z.boolean().default(false),
  /** Allow network evaluation and protection tools (SSH automation, topology, CVE lookup, PCAP). Off by default. */
  allowNetworkTools: z.boolean().default(false),
  /** Allow NetBox write operations (create/update/delete). Sub-item of network tools — only effective when allowNetworkTools is true. */
  allowNetBoxWrite: z.boolean().default(false),
  /** Allow Twingate zero-trust remote access and private MCP proxy. Off by default. */
  allowTwingate: z.boolean().default(false),
  /** Allow organizational intent documents (goals, signals, hard boundaries, trade-off profiles). */
  allowOrgIntent: z.boolean().default(false),
  /** Allow full field-level intent document editor in dashboard (developer/testing mode). */
  allowIntentEditor: z.boolean().default(false),
  /** Allow the code editor in the dashboard sidebar. Disabled by default. */
  allowCodeEditor: z.boolean().default(false),
  /** Replace the standard editor with the advanced three-panel workspace. */
  allowAdvancedEditor: z.boolean().default(false),
  /** Allow training dataset export (conversations → JSONL/text for LLM fine-tuning). Off by default. */
  allowTrainingExport: z.boolean().default(false),
  /** Allow agents to generate and register tools at runtime. Off by default. */
  allowDynamicTools: z.boolean().default(false),
  /** Require dynamically-created tools to run inside a sandbox. Defaults true; only applies when allowDynamicTools is true. */
  sandboxDynamicTools: z.boolean().default(true),
  /** Enable ML-based anomaly detection for agent behavior, API calls, and security events. Off by default. */
  allowAnomalyDetection: z.boolean().default(false),
  /** Enable gVisor (runsc) kernel-level isolation for sandboxed execution. Off by default; requires gVisor on host. */
  sandboxGvisor: z.boolean().default(false),
  /** Enable WebAssembly-based isolation for code execution. Off by default. */
  sandboxWasm: z.boolean().default(false),
  /** Enable outbound credential injection at sandbox proxy boundary. Off by default. */
  sandboxCredentialProxy: z.boolean().default(false),
  /** Allow git clone/pull from a URL during community skill sync. Off by default. */
  allowCommunityGitFetch: z.boolean().default(false),
  /** Default git URL for community skills repo when git fetch is enabled. */
  communityGitUrl: z.string().optional(),
  /** Local filesystem path where community skills repo is cloned/checked out. */
  communityRepoPath: z.string().default('./community-repo'),
  /** Directory from which to load external integration plugins at startup. */
  integrationPluginDir: z.string().optional(),
  /**
   * When true, the response guard checks for n-gram overlap between AI responses
   * and system prompt contents. Leaks are redacted and audit-logged regardless of
   * responseGuard.mode. Per-personality override available via body.strictSystemPromptConfidentiality.
   */
  strictSystemPromptConfidentiality: z.boolean().default(false),
  /** Rate-aware abuse detection — tracks adversarial retry, topic pivoting, and tool anomaly patterns. */
  abuseDetection: z
    .object({
      enabled: z.boolean().default(true),
      /**
       * Minimum topic-overlap ratio between consecutive user messages to flag as topic-pivot.
       * High values (close to 1) mean almost identical topics are required. Low values flag more pivots.
       * Default 0.15 (≤15% overlap → topic changed).
       */
      topicPivotThreshold: z.number().min(0).max(1).default(0.15),
      /**
       * Number of consecutive blocked-message retries within a session before triggering cool-down.
       */
      blockedRetryLimit: z.number().int().positive().default(3),
      /**
       * Cool-down duration in milliseconds after abuse pattern detected. Default 5 minutes.
       */
      coolDownMs: z.number().int().positive().default(300_000),
      /**
       * Session TTL for abuse tracking records in milliseconds. Records older than this are evicted.
       * Default 30 minutes.
       */
      sessionTtlMs: z.number().int().positive().default(1_800_000),
    })
    .default({}),
  /** Output-side content policy enforcement: PII redaction, topic restrictions, toxicity, block lists, grounding. */
  contentGuardrails: ContentGuardrailConfigSchema.default({}),
  /** Sandbox artifact scanning & externalization gate policy (Phase 116). */
  sandboxArtifactScanning: ExternalizationPolicySchema.default({}),
  secretBackend: z.enum(['auto', 'keyring', 'env', 'file', 'vault']).default('auto'),
  vault: z
    .object({
      /** Base URL of the OpenBao / Vault server */
      address: z.string().default('http://127.0.0.1:8200'),
      /** KV v2 mount path */
      mount: z.string().default('secret'),
      /** Optional namespace (Vault Enterprise / OpenBao) */
      namespace: z.string().optional(),
      /** Env-var name holding the AppRole role_id */
      roleIdEnv: EnvVarRefSchema.default('VAULT_ROLE_ID'),
      /** Env-var name holding the AppRole secret_id */
      secretIdEnv: EnvVarRefSchema.default('VAULT_SECRET_ID'),
      /** Env-var name holding a static token (overrides AppRole when set) */
      tokenEnv: EnvVarRefSchema.optional(),
      /** Fall back to env/file backend when Vault is unreachable */
      fallback: z.boolean().default(true),
    })
    .default({}),
  rotation: z
    .object({
      enabled: z.boolean().default(false),
      checkIntervalMs: z.number().int().positive().max(86400000).default(3600000),
      warningDaysBeforeExpiry: z.number().int().positive().max(90).default(7),
      tokenRotationIntervalDays: z.number().int().positive().max(365).default(30),
      signingKeyRotationIntervalDays: z.number().int().positive().max(365).default(90),
    })
    .default({}),
});

export type SecurityConfig = z.infer<typeof SecurityConfigSchema>;

// Audit config sub-schema
const AuditConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    chainVerification: z.enum(['hourly', 'daily', 'never']).default('hourly'),
    signingKeyEnv: EnvVarRefSchema.default('SECUREYEOMAN_SIGNING_KEY'),
    retentionDays: z.number().int().min(1).default(90),
    maxEntries: z.number().int().min(1000).default(1_000_000),
  })
  .default({});

// Logging configuration
export const LoggingConfigSchema = z.object({
  level: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  format: z.enum(['json', 'pretty']).default('json'),

  output: z
    .array(
      z.discriminatedUnion('type', [
        z.object({
          type: z.literal('file'),
          path: SafePathSchema,
          rotation: z.enum(['hourly', 'daily', 'weekly']).default('daily'),
          retention: z
            .string()
            .regex(/^\d+[dhw]$/)
            .default('30d'),
          maxSize: z
            .string()
            .regex(/^\d+[KMG]B$/)
            .optional(),
        }),
        z.object({
          type: z.literal('stdout'),
          format: z.enum(['json', 'pretty']).default('pretty'),
        }),
      ])
    )
    .default([{ type: 'stdout', format: 'pretty' }]),

  audit: AuditConfigSchema,
});

export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;

// Metrics sub-schemas
const PrometheusConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    port: z.number().int().min(1024).max(65535).default(9090),
    path: z.string().default('/metrics'),
  })
  .default({});

const MetricsWebsocketConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    port: z.number().int().min(1024).max(65535).default(18790),
    updateIntervalMs: z.number().int().positive().max(60000).default(1000),
  })
  .default({});

const MetricsExportConfigSchema = z
  .object({
    prometheus: PrometheusConfigSchema,
    websocket: MetricsWebsocketConfigSchema,
  })
  .default({});

const MetricsRetentionConfigSchema = z
  .object({
    rawDataHours: z.number().int().positive().max(168).default(24), // Max 1 week
    aggregatedDataDays: z.number().int().positive().max(365).default(30),
  })
  .default({});

// Metrics configuration
export const MetricsConfigSchema = z.object({
  enabled: z.boolean().default(true),
  export: MetricsExportConfigSchema,
  retention: MetricsRetentionConfigSchema,
});

export type MetricsConfig = z.infer<typeof MetricsConfigSchema>;

// Gateway sub-schemas
const TlsConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    certPath: SafePathSchema.optional(),
    keyPath: SafePathSchema.optional(),
    caPath: SafePathSchema.optional(),
    /** Auto-generate a self-signed dev cert when no certPath/keyPath are provided */
    autoGenerate: z.boolean().default(false),
  })
  .default({});

const CorsConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    origins: z.array(z.string()).default(['http://localhost:3000']),
  })
  .default({});

const AuthConfigSchema = z
  .object({
    tokenSecret: EnvVarRefSchema.default('SECUREYEOMAN_TOKEN_SECRET'),
    tokenExpirySeconds: z.number().int().positive().max(86400).default(3600),
    refreshTokenExpirySeconds: z.number().int().positive().max(604800).default(86400),
    adminPasswordEnv: EnvVarRefSchema.default('SECUREYEOMAN_ADMIN_PASSWORD'),
  })
  .default({});

// Gateway/API configuration
export const GatewayConfigSchema = z.object({
  host: z.string().default('127.0.0.1'),
  port: z.number().int().min(1024).max(65535).default(18789),
  tls: TlsConfigSchema,
  cors: CorsConfigSchema,
  auth: AuthConfigSchema,
  /** Maximum simultaneous WebSocket connections. Oldest idle client is evicted when exceeded. */
  maxWsClients: z.number().int().min(1).default(100),
  /**
   * Allow access from non-local (public/routable) IP addresses.
   * Disabled by default — the gateway only accepts connections from RFC 1918
   * private ranges and loopback. Enable when TLS is active and the gateway is
   * reachable via a proper hostname/cert (e.g. enterprise wildcard cert).
   */
  allowRemoteAccess: z.boolean().default(false),
  /** Public-facing URL for OAuth redirects and external links (e.g. https://my.domain.com). */
  externalUrl: z.string().optional(),
  /** OAuth redirect base URL when it differs from externalUrl (e.g. Vite dev proxy at port 3000). */
  oauthRedirectBaseUrl: z.string().optional(),
  /** Path to pre-built dashboard dist directory. Auto-discovered if not set. */
  dashboardDist: z.string().optional(),
});

export type GatewayConfig = z.infer<typeof GatewayConfigSchema>;

// Fallback model configuration (used when primary provider hits rate limits or is unavailable)
export const FallbackModelConfigSchema = z.object({
  provider: z.enum([
    'anthropic',
    'openai',
    'gemini',
    'ollama',
    'opencode',
    'lmstudio',
    'localai',
    'deepseek',
    'mistral',
    'grok',
    'letta',
    'groq',
    'openrouter',
  ]),
  model: z.string(),
  apiKeyEnv: EnvVarRefSchema,
  baseUrl: z.string().url().optional(),
  maxTokens: z.number().int().positive().max(200000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  requestTimeoutMs: z.number().int().positive().max(300000).optional(),
});

export type FallbackModelConfig = z.infer<typeof FallbackModelConfigSchema>;

// Response cache configuration (ADR 101)
export const ResponseCacheConfigSchema = z
  .object({
    /** Enable in-memory LLM response caching. Off by default. */
    enabled: z.boolean().default(false),
    /** Time-to-live for cached responses in milliseconds. Default: 5 minutes. */
    ttlMs: z.number().int().positive().max(86_400_000).default(300_000),
    /** Maximum number of cached entries before oldest is evicted. */
    maxEntries: z.number().int().positive().max(10_000).default(500),
  })
  .default({});

export type ResponseCacheConfig = z.infer<typeof ResponseCacheConfigSchema>;

// Model/AI configuration
export const ModelConfigSchema = z.object({
  provider: z
    .enum([
      'anthropic',
      'openai',
      'gemini',
      'ollama',
      'opencode',
      'lmstudio',
      'localai',
      'deepseek',
      'mistral',
      'grok',
      'letta',
      'groq',
      'openrouter',
    ])
    .default('anthropic'),
  model: z.string().default('claude-sonnet-4-20250514'),
  apiKeyEnv: EnvVarRefSchema.default('ANTHROPIC_API_KEY'),
  baseUrl: z.string().url().optional(),

  // Request limits
  maxTokens: z.number().int().positive().max(200000).default(16384),
  temperature: z.number().min(0).max(2).default(0.7),

  // Rate limiting for API calls
  maxRequestsPerMinute: z.number().int().positive().max(1000).default(60),
  maxTokensPerDay: z.number().int().positive().optional(),

  // Timeout
  requestTimeoutMs: z.number().int().positive().max(300000).default(120000),

  // Retry configuration
  maxRetries: z.number().int().min(0).max(10).default(3),
  retryDelayMs: z.number().int().positive().default(1000),

  // Fallback models for rate limit / provider unavailability
  fallbacks: z.array(FallbackModelConfigSchema).max(5).default([]),

  // Response caching (ADR 101)
  responseCache: ResponseCacheConfigSchema,

  // Local-first routing — try local providers before cloud (ADR 148)
  localFirst: z.boolean().default(false),
});

export type ModelConfig = z.infer<typeof ModelConfigSchema>;

// Storage backend configuration (Phase 22 — single binary / SQLite tier 2)
export const StorageBackendConfigSchema = z
  .object({
    backend: z.enum(['pg', 'sqlite', 'auto']).default('auto'),
    sqlite: z.object({ path: z.string().default('~/.secureyeoman/data.db') }).default({}),
  })
  .default({});

export type StorageBackendConfig = z.infer<typeof StorageBackendConfigSchema>;

// Licensing configuration
export const LicensingConfigSchema = z
  .object({
    /** Env-var name holding the license key. */
    licenseKeyEnv: EnvVarRefSchema.default('SECUREYEOMAN_LICENSE_KEY'),
    /** Enable license enforcement. When false (default), all features are available. */
    enforcement: z.boolean().default(false),
  })
  .default({});

export type LicensingConfig = z.infer<typeof LicensingConfigSchema>;

// Intent config
export const IntentFileConfigSchema = z
  .object({
    /** Path to an orgIntent.yaml/json for file-based bootstrap */
    filePath: z.string().optional(),
    /** How often (ms) to refresh signal values from data sources. Default: 5 min. */
    signalRefreshIntervalMs: z.number().int().positive().default(300_000),
    /** OPA server address for governance policy evaluation. */
    opaAddr: z.string().optional(),
  })
  .default({});

export type IntentFileConfig = z.infer<typeof IntentFileConfigSchema>;

// Notifications configuration
export const NotificationsConfigSchema = z
  .object({
    retentionDays: z.number().int().min(1).default(30),
  })
  .default({});

export type NotificationsConfig = z.infer<typeof NotificationsConfigSchema>;

// Complete configuration schema
export const ConfigSchema = z.object({
  version: z.string().default('1.0'),
  core: CoreConfigSchema.default({}),
  security: SecurityConfigSchema.default({}),
  logging: LoggingConfigSchema.default({}),
  metrics: MetricsConfigSchema.default({}),
  gateway: GatewayConfigSchema.default({}),
  model: ModelConfigSchema.default({}),
  soul: SoulConfigSchema,
  spirit: SpiritConfigSchema,
  brain: BrainConfigSchema,
  body: BodyConfigSchema,
  comms: CommsConfigSchema,
  heartbeat: HeartbeatConfigSchema,
  externalBrain: ExternalBrainConfigSchema,
  mcp: McpConfigSchema,
  conversation: ConversationConfigSchema,
  delegation: DelegationConfigSchema,
  extensions: ExtensionConfigSchema,
  execution: ExecutionConfigSchema,
  a2a: A2AConfigSchema,
  proactive: ProactiveConfigSchema,
  multimodal: MultimodalConfigSchema,
  storage: StorageBackendConfigSchema,
  intent: IntentFileConfigSchema,
  notifications: NotificationsConfigSchema,
  licensing: LicensingConfigSchema,
});

export type Config = z.infer<typeof ConfigSchema>;

// Partial config for merging (all fields optional)
export const PartialConfigSchema = ConfigSchema.deepPartial();
export type PartialConfig = z.infer<typeof PartialConfigSchema>;
