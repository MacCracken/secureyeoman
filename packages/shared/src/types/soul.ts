/**
 * Soul Types for SecureYeoman
 *
 * Personality and Skills system that composes into AI system prompts.
 * Personalities define character traits; Skills define learnable capabilities.
 */

import { z } from 'zod';
import { ToolSchema } from './ai.js';
import { ContentGuardrailPersonalityConfigSchema } from './content-guardrail.js';
import { MemoryAuditPolicySchema } from './memory-audit.js';

// ─── Personality ──────────────────────────────────────────────

export const DefaultModelSchema = z
  .object({
    provider: z.string().min(1),
    model: z.string().min(1),
    /** Provider account ID for multi-account key routing (Phase 112). */
    accountId: z.string().min(1).optional(),
  })
  .nullable()
  .default(null);

export type DefaultModel = z.infer<typeof DefaultModelSchema>;

export const ModelFallbackEntrySchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
});
export type ModelFallbackEntry = z.infer<typeof ModelFallbackEntrySchema>;

// ─── Body Config (owns Heart) ───────────────────────────────

export const BodyCapabilitySchema = z.enum([
  'auditory',
  'diagnostics',
  'haptic',
  'limb_movement',
  'vision',
  'vocalization',
]);
export type BodyCapability = z.infer<typeof BodyCapabilitySchema>;

export const CreationConfigSchema = z
  .object({
    skills: z.boolean().default(false),
    tasks: z.boolean().default(false),
    personalities: z.boolean().default(false),
    subAgents: z.boolean().default(false),
    customRoles: z.boolean().default(false),
    roleAssignments: z.boolean().default(false),
    experiments: z.boolean().default(false),
    /** Allow this personality to use A2A networking when sub-agents are enabled. Gated by global allowA2A policy. */
    allowA2A: z.boolean().default(false),
    /** Allow this personality to use agent swarms when sub-agents are enabled. Gated by global allowSwarms policy. */
    allowSwarms: z.boolean().default(false),
    /** Allow this personality to generate and register tools dynamically. Gated by global allowDynamicTools policy. */
    allowDynamicTools: z.boolean().default(false),
    /** Allow this personality to create and manage workflows. Gated by global allowWorkflows policy. */
    workflows: z.boolean().default(false),
  })
  .default({});

export type CreationConfig = z.infer<typeof CreationConfigSchema>;

export const McpFeaturesSchema = z
  .object({
    exposeGit: z.boolean().default(false),
    exposeFilesystem: z.boolean().default(false),
    exposeWeb: z.boolean().default(false),
    exposeWebScraping: z.boolean().default(false),
    exposeWebSearch: z.boolean().default(false),
    exposeBrowser: z.boolean().default(false),
    exposeDesktopControl: z.boolean().default(false),
    /** SSH/Telnet device automation, show commands, config push, ping, traceroute. Requires global allowNetworkTools. */
    exposeNetworkDevices: z.boolean().default(false),
    /** CDP/LLDP discovery, topology build, ARP/MAC tables, routing table, OSPF, BGP, interfaces, VLANs. Requires global allowNetworkTools. */
    exposeNetworkDiscovery: z.boolean().default(false),
    /** ACL audit, AAA config, port security, STP analysis. Requires global allowNetworkTools. */
    exposeNetworkAudit: z.boolean().default(false),
    /** NetBox CRUD queries and live-vs-NetBox drift reconciliation. Requires global allowNetworkTools. */
    exposeNetBox: z.boolean().default(false),
    /** NVD CVE search, CVEs-by-software, device OS version detection. Requires global allowNetworkTools. */
    exposeNvd: z.boolean().default(false),
    /** Subnet/VLSM/wildcard calculators and PCAP analysis (tshark). Requires global allowNetworkTools. */
    exposeNetworkUtils: z.boolean().default(false),
    /** Twingate resource management + private MCP proxy. Requires global allowTwingate. */
    exposeTwingate: z.boolean().default(false),
    /** Gmail tools (gmail_*). Requires global exposeGmail. */
    exposeGmail: z.boolean().default(false),
    /** Twitter/X tools (twitter_*). Requires global exposeTwitter. */
    exposeTwitter: z.boolean().default(false),
    /** GitHub API tools (github_*). Requires global exposeGithub. */
    exposeGithub: z.boolean().default(false),
    /** Docker management tools (docker_*). Requires global exposeDockerTools. */
    exposeDocker: z.boolean().default(false),
    /** CI/CD tools (gha_*, jenkins_*, gitlab_*, northflank_*). Requires global expose* per platform. */
    exposeCicd: z.boolean().default(false),
    /** SRA tools (sra_*). Requires global exposeSra. */
    exposeSra: z.boolean().default(false),
    /** Excalidraw diagramming tools (excalidraw_*). Requires global exposeExcalidraw. */
    exposeDiagramming: z.boolean().default(false),
    /** PDF analysis tools (pdf_*). Requires global exposePdf. */
    exposePdf: z.boolean().default(false),
    /** Advanced PDF analysis tools (pdf_extract_pages, pdf_extract_tables, etc.). Requires global exposePdfAdvanced. */
    exposePdfAdvanced: z.boolean().default(false),
    /** Cognitive memory tools (memory_activation_stats, memory_associations). Requires global exposeCognitiveMemory. */
    exposeCognitiveMemory: z.boolean().default(false),
    /** Financial charting tools (chart_*). Requires global exposeCharting. */
    exposeCharting: z.boolean().default(false),
    /** Constitutional AI tools (constitutional_*). Requires global exposeConstitutional. */
    exposeConstitutional: z.boolean().default(false),
  })
  .default({});

export type McpFeatures = z.infer<typeof McpFeaturesSchema>;

export const ProactivePersonalityConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    builtins: z
      .object({
        dailyStandup: z.boolean().default(false),
        weeklySummary: z.boolean().default(false),
        contextualFollowup: z.boolean().default(false),
        integrationHealthAlert: z.boolean().default(false),
        securityAlertDigest: z.boolean().default(false),
      })
      .default({}),
    builtinModes: z
      .object({
        dailyStandup: z.enum(['auto', 'suggest', 'manual']).default('auto'),
        weeklySummary: z.enum(['auto', 'suggest', 'manual']).default('suggest'),
        contextualFollowup: z.enum(['auto', 'suggest', 'manual']).default('suggest'),
        integrationHealthAlert: z.enum(['auto', 'suggest', 'manual']).default('auto'),
        securityAlertDigest: z.enum(['auto', 'suggest', 'manual']).default('suggest'),
      })
      .default({}),
    learning: z
      .object({
        enabled: z.boolean().default(true),
        minConfidence: z.number().min(0).max(1).default(0.7),
      })
      .default({}),
  })
  .default({});

export type ProactivePersonalityConfig = z.infer<typeof ProactivePersonalityConfigSchema>;

export const PersonalityActiveHoursSchema = z
  .object({
    enabled: z.boolean().default(false),
    start: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .default('09:00'), // "HH:mm" UTC
    end: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .default('17:00'), // "HH:mm" UTC
    daysOfWeek: z
      .array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']))
      .default(['mon', 'tue', 'wed', 'thu', 'fri']),
    timezone: z.string().default('UTC'),
  })
  .default({});

export type PersonalityActiveHours = z.infer<typeof PersonalityActiveHoursSchema>;

export const ThinkingPersonalityConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    budgetTokens: z.number().int().min(1024).max(64000).default(10000),
  })
  .optional();

export type ThinkingPersonalityConfig = z.infer<typeof ThinkingPersonalityConfigSchema>;

export const ReasoningPersonalityConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    effort: z.enum(['low', 'medium', 'high']).default('medium'),
  })
  .optional();

export type ReasoningPersonalityConfig = z.infer<typeof ReasoningPersonalityConfigSchema>;

export const CostBudgetSchema = z
  .object({
    dailyUsd: z.number().positive().optional(),
    monthlyUsd: z.number().positive().optional(),
  })
  .optional();

export type CostBudget = z.infer<typeof CostBudgetSchema>;

export const ResourcePolicySchema = z
  .object({
    deletionMode: z.enum(['auto', 'request', 'manual']).default('auto'),
    /**
     * Controls how much autonomy the AI has when performing mutations:
     * - `supervised_auto`  (default) — AI actions proceed immediately
     * - `semi_auto`        — Destructive AI actions (delete) are queued for approval; creative ones proceed
     * - `full_manual`      — Every AI-initiated creation/deletion is queued for human approval
     */
    automationLevel: z
      .enum(['full_manual', 'semi_auto', 'supervised_auto'])
      .default('supervised_auto'),
    /** Kill-switch: when true, all AI-initiated mutations are blocked regardless of automationLevel. */
    emergencyStop: z.boolean().default(false),
    /**
     * Per-personality rate limiting overrides.
     * Stored in the existing body JSONB column — no DB migration required.
     */
    rateLimitConfig: z
      .object({
        /** Max chat requests per minute for this personality. Overrides global default when set. */
        chatRequestsPerMinute: z.number().int().min(1).max(1000).optional(),
        /** Set to false to disable rate limiting entirely for this personality. Defaults to true. */
        enabled: z.boolean().default(true),
      })
      .optional(),
  })
  .default({});

export type ResourcePolicy = z.infer<typeof ResourcePolicySchema>;

/**
 * Per-integration access entry with a fine-grained permission mode.
 *
 * - auto   — Personality acts autonomously on this integration (send, post, etc.)
 * - draft  — Personality composes content but requires human approval before sending
 * - suggest — Personality only recommends actions; never takes them directly
 */
export const IntegrationAccessSchema = z.object({
  id: z.string().min(1),
  mode: z.enum(['auto', 'draft', 'suggest']).default('suggest'),
});
export type IntegrationAccess = z.infer<typeof IntegrationAccessSchema>;
export type IntegrationAccessMode = IntegrationAccess['mode'];

export const BodyConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    capabilities: z.array(BodyCapabilitySchema).default([]),
    heartEnabled: z.boolean().default(true),
    creationConfig: CreationConfigSchema.default({}),
    selectedServers: z.array(z.string()).default([]),
    /** @deprecated Use integrationAccess instead. Kept for backward compat with persisted JSONB data. */
    selectedIntegrations: z.array(z.string()).default([]),
    /** Replaces selectedIntegrations — includes both selection and permission mode per integration. */
    integrationAccess: z.array(IntegrationAccessSchema).default([]),
    mcpFeatures: McpFeaturesSchema.default({}),
    proactiveConfig: ProactivePersonalityConfigSchema.default({}),
    activeHours: PersonalityActiveHoursSchema.default({}),
    thinkingConfig: ThinkingPersonalityConfigSchema,
    reasoningConfig: ReasoningPersonalityConfigSchema,
    resourcePolicy: ResourcePolicySchema.optional(),
    /**
     * Per-personality prompt token budget override.
     * When set, replaces the global maxPromptTokens for this soul's system prompt composition.
     * Stored in the existing body JSONB column — no DB migration required.
     */
    maxPromptTokens: z.number().int().min(1024).max(100000).optional(),
    /**
     * When true, this personality accesses the shared memory pool across all agents.
     * When false (default), memories and knowledge are scoped to this personality only.
     * Legacy entries (personality_id IS NULL) are always visible to all personalities.
     */
    omnipresentMind: z.boolean().default(false),
    /**
     * Per-personality override for system prompt confidentiality.
     * When true, AI responses are scanned for n-gram overlap with this personality's system prompt.
     * Falls back to the global security.strictSystemPromptConfidentiality setting when undefined.
     */
    strictSystemPromptConfidentiality: z.boolean().optional(),
    /** Per-personality content guardrail overrides (block list additions, topic additions, PII mode). */
    contentGuardrails: ContentGuardrailPersonalityConfigSchema.optional(),
    /**
     * Knowledge retrieval mode for this personality.
     *
     * - 'rag' (default) — top-K hybrid RRF retrieval (fast, works at any corpus size)
     * - 'notebook'       — load the entire document corpus into context at once (NotebookLM style)
     * - 'hybrid'         — try notebook first; fall back to RAG when corpus exceeds budget
     *
     * Notebook and hybrid modes require a model with a large context window (≥128K tokens
     * recommended; Gemini 1M is ideal for large corpora).
     */
    knowledgeMode: z.enum(['rag', 'notebook', 'hybrid']).default('rag'),
    /**
     * Optional token budget cap for notebook mode.
     * When set, overrides the auto-computed 65% of the model's context window.
     * Useful for reserving more window space for conversation history.
     */
    notebookTokenBudget: z.number().int().min(1000).optional(),
    /**
     * Default reasoning strategy for this personality.
     * When set, all conversations using this personality will apply the strategy
     * unless overridden per-request.
     */
    defaultStrategyId: z.string().nullable().optional(),
    /** Enable inline citations [1], [2] in AI responses referencing knowledge base sources. */
    enableCitations: z.boolean().default(false),
    /**
     * Groundedness enforcement mode for AI responses.
     *
     * - 'off' (default) — no grounding check
     * - 'annotate_only' — flag ungrounded claims with [unverified]
     * - 'block_unverified' — block response if grounding score < 0.3
     * - 'strip_unverified' — remove ungrounded sentences from response
     */
    groundednessMode: z
      .enum(['off', 'annotate_only', 'block_unverified', 'strip_unverified'])
      .default('off'),
    contextOverflowStrategy: z.enum(['summarise', 'truncate', 'error']).default('summarise'),
    costBudget: CostBudgetSchema,
    /** Per-personality TEE/confidential compute requirement. Overrides security-level default. */
    confidentialCompute: z.enum(['off', 'optional', 'required']).default('off'),
  })
  .default({});

export type BodyConfig = z.infer<typeof BodyConfigSchema>;

// ─── Personality ─────────────────────────────────────────────

export const PersonalitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  description: z.string().max(1000).default(''),
  systemPrompt: z.string().max(8000).default(''),
  traits: z.record(z.string(), z.string()).default({}),
  sex: z.enum(['male', 'female', 'non-binary', 'unspecified']).default('unspecified'),
  voice: z.string().max(200).default(''),
  preferredLanguage: z.string().max(100).default(''),
  defaultModel: DefaultModelSchema,
  modelFallbacks: z.array(ModelFallbackEntrySchema).max(5).default([]),
  includeArchetypes: z.boolean().default(true),
  injectDateTime: z.boolean().default(false),
  empathyResonance: z.boolean().default(false),
  avatarUrl: z.string().nullable().default(null),
  isActive: z.boolean().default(false),
  isDefault: z.boolean().default(false),
  isArchetype: z.boolean().default(false),
  isWithinActiveHours: z.boolean().optional(),
  body: BodyConfigSchema.default({}),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export type Personality = z.infer<typeof PersonalitySchema>;

export const PersonalityCreateSchema = PersonalitySchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  isActive: true,
  isDefault: true,
  isArchetype: true,
  isWithinActiveHours: true,
});

export type PersonalityCreate = z.infer<typeof PersonalityCreateSchema>;

export const PersonalityUpdateSchema = PersonalityCreateSchema.partial();
export type PersonalityUpdate = z.infer<typeof PersonalityUpdateSchema>;

// ─── Skill Triggers ─────────────────────────────────────────────

export const TriggerTypeSchema = z.enum(['message', 'tool_use', 'event', 'condition']);
export type TriggerType = z.infer<typeof TriggerTypeSchema>;

export const MatchModeSchema = z.enum(['exact', 'contains', 'regex', 'startsWith']);
export type MatchMode = z.infer<typeof MatchModeSchema>;

export const MessageTriggerSchema = z.object({
  type: z.literal('message'),
  patterns: z.array(z.string().max(500)).min(1),
  matchMode: MatchModeSchema.default('contains'),
  caseSensitive: z.boolean().default(false),
});

export const ToolUseTriggerSchema = z.object({
  type: z.literal('tool_use'),
  toolNames: z.array(z.string()).min(1),
  before: z.boolean().default(false),
  after: z.boolean().default(true),
});

export const EventTypeSchema = z.enum([
  'session_start',
  'session_end',
  'skill_installed',
  'skill_uninstalled',
  'personality_changed',
  'error_occurred',
  'heartbeat_check',
]);
export type EventType = z.infer<typeof EventTypeSchema>;

export const EventTriggerSchema = z.object({
  type: z.literal('event'),
  events: z.array(EventTypeSchema).min(1),
});

export const ConditionOperatorSchema = z.enum(['eq', 'ne', 'gt', 'lt', 'gte', 'lte', 'between']);
export type ConditionOperator = z.infer<typeof ConditionOperatorSchema>;

export const ConditionTriggerSchema = z.object({
  type: z.literal('condition'),
  conditions: z
    .array(
      z.object({
        field: z.string(),
        operator: ConditionOperatorSchema,
        value: z.unknown(),
      })
    )
    .min(1),
  logical: z.enum(['AND', 'OR']).default('AND'),
});

export const SkillTriggerSchema = z.object({
  id: z.string().min(1),
  type: TriggerTypeSchema,
  message: MessageTriggerSchema.optional(),
  toolUse: ToolUseTriggerSchema.optional(),
  event: EventTriggerSchema.optional(),
  condition: ConditionTriggerSchema.optional(),
  timing: z.enum(['before', 'after', 'instead']).default('after'),
  actionId: z.string().optional(),
  enabled: z.boolean().default(true),
  priority: z.number().int().default(0),
  cooldownMs: z.number().int().positive().default(0),
  contextTemplate: z.string().max(2000).optional(),
});

export type SkillTrigger = z.infer<typeof SkillTriggerSchema>;
export type MessageTrigger = z.infer<typeof MessageTriggerSchema>;
export type ToolUseTrigger = z.infer<typeof ToolUseTriggerSchema>;
export type EventTrigger = z.infer<typeof EventTriggerSchema>;
export type ConditionTrigger = z.infer<typeof ConditionTriggerSchema>;

// ─── Skill Actions ──────────────────────────────────────────────

export const SkillActionTypeSchema = z.enum(['code', 'http', 'shell']);
export type SkillActionType = z.infer<typeof SkillActionTypeSchema>;

export const CodeActionSchema = z.object({
  type: z.literal('code'),
  language: z.enum(['javascript', 'python']),
  code: z.string().max(10000),
  timeoutMs: z.number().int().positive().max(300000).default(30000),
  memoryLimitMb: z.number().int().positive().default(256),
});

export const HttpActionSchema = z.object({
  type: z.literal('http'),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
  url: z.string().url().max(2000),
  headers: z.record(z.string()).optional(),
  body: z.string().max(50000).optional(),
  timeoutMs: z.number().int().positive().default(30000),
  retryCount: z.number().int().min(0).max(3).default(0),
});

export const ShellActionSchema = z.object({
  type: z.literal('shell'),
  command: z.string().max(2000),
  timeoutMs: z.number().int().positive().default(30000),
  cwd: z.string().optional(),
  allowedPaths: z.array(z.string()).optional(),
});

export const SkillActionSchema = z.object({
  id: z.string().min(1),
  type: SkillActionTypeSchema,
  code: CodeActionSchema.optional(),
  http: HttpActionSchema.optional(),
  shell: ShellActionSchema.optional(),
  requireApproval: z.boolean().default(false),
  timeoutMs: z.number().int().positive().default(30000),
});

export type SkillAction = z.infer<typeof SkillActionSchema>;
export type CodeAction = z.infer<typeof CodeActionSchema>;
export type HttpAction = z.infer<typeof HttpActionSchema>;
export type ShellAction = z.infer<typeof ShellActionSchema>;

// ─── Autonomy Level ───────────────────────────────────────────

/**
 * L1–L5 autonomy classification (governance/documentation only).
 * Separate from automationLevel (runtime queue behavior).
 *
 * L1 Human does — AI only assists on request
 * L2 Collaborative — AI proposes, human decides
 * L3 Supervised — AI acts, human reviews results
 * L4 Delegated — AI acts autonomously, human audits periodically
 * L5 Fully autonomous — AI acts; humans receive notifications only
 */
export const AutonomyLevelSchema = z.enum(['L1', 'L2', 'L3', 'L4', 'L5']);
export type AutonomyLevel = z.infer<typeof AutonomyLevelSchema>;

// ─── Skill ────────────────────────────────────────────────────

export const SkillSourceSchema = z.enum([
  'user',
  'ai_proposed',
  'ai_learned',
  'marketplace',
  'community',
]);
export type SkillSource = z.infer<typeof SkillSourceSchema>;

export const SkillStatusSchema = z.enum(['active', 'pending_approval', 'disabled']);
export type SkillStatus = z.infer<typeof SkillStatusSchema>;

/**
 * BaseSkillSchema — canonical fields shared by both catalog (CatalogSkillSchema)
 * and runtime brain (SkillSchema) skills. Any new routing/autonomy/capability
 * fields should be added here so both lifecycle stages carry them.
 */
export const BaseSkillSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  instructions: z.string().max(8000).default(''),
  tools: z.array(ToolSchema).default([]),
  triggerPatterns: z.array(z.string().max(500)).default([]),

  // Routing quality (Phase 44)
  useWhen: z.string().max(500).default(''),
  doNotUseWhen: z.string().max(500).default(''),
  successCriteria: z.string().max(300).default(''),
  mcpToolsAllowed: z.array(z.string()).default([]),
  routing: z.enum(['fuzzy', 'explicit']).default('fuzzy'),

  // Autonomy classification (Phase 49)
  autonomyLevel: AutonomyLevelSchema.default('L1'),

  // Structured output schema for validation (Phase 54)
  outputSchema: z.record(z.unknown()).nullable().optional(),

  updatedAt: z.number().int().nonnegative(),
});
export type BaseSkill = z.infer<typeof BaseSkillSchema>;

export const SkillSchema = BaseSkillSchema.extend({
  // Brain-runtime-only fields
  linkedWorkflowId: z.string().nullable().optional(),
  emergencyStopProcedure: z.string().max(1000).optional(),

  // Actions (ADR 021)
  actions: z.array(SkillActionSchema).default([]),

  // Triggers (ADR 022)
  triggers: z.array(SkillTriggerSchema).default([]),

  // Dependencies (ADR 021)
  dependencies: z.array(z.string()).default([]),
  provides: z.array(z.string()).default([]),

  // Security
  requireApproval: z.boolean().default(false),
  allowedPermissions: z.array(z.string()).default([]),

  enabled: z.boolean().default(true),
  source: SkillSourceSchema.default('user'),
  status: SkillStatusSchema.default('active'),
  usageCount: z.number().int().nonnegative().default(0),
  invokedCount: z.number().int().nonnegative().default(0),
  lastUsedAt: z.number().int().nonnegative().nullable().default(null),
  personalityId: z.string().nullable().optional(),
  personalityName: z.string().nullable().optional(),
  createdAt: z.number().int().nonnegative(),
});

export type Skill = z.infer<typeof SkillSchema>;

export const SkillCreateSchema = SkillSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  usageCount: true,
  invokedCount: true,
  lastUsedAt: true,
  personalityName: true,
});

export type SkillCreate = z.infer<typeof SkillCreateSchema>;

export const SkillUpdateSchema = SkillCreateSchema.partial();
export type SkillUpdate = z.infer<typeof SkillUpdateSchema>;

// ─── Soul Config ──────────────────────────────────────────────

export const LearningModeSchema = z.enum(['user_authored', 'ai_proposed', 'autonomous']);
export type LearningMode = z.infer<typeof LearningModeSchema>;

export const SoulConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    learningMode: z.array(LearningModeSchema).default(['user_authored']),
    maxSkills: z.number().int().positive().max(200).default(100),
    maxPromptTokens: z.number().int().positive().max(100000).default(64000),
  })
  .default({});

export type SoulConfig = z.infer<typeof SoulConfigSchema>;

// ─── Brain Config ────────────────────────────────────────────

export const MemoryTypeSchema = z.enum(['episodic', 'semantic', 'procedural', 'preference']);
export type MemoryType = z.infer<typeof MemoryTypeSchema>;

export const VectorConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    provider: z.enum(['local', 'api', 'both']).default('local'),
    backend: z.enum(['faiss', 'qdrant', 'chroma']).default('faiss'),
    similarityThreshold: z.number().min(0).max(1).default(0.7),
    maxResults: z.number().int().positive().max(100).default(10),
    local: z
      .object({
        model: z.string().default('all-MiniLM-L6-v2'),
      })
      .default({}),
    api: z
      .object({
        provider: z.enum(['openai', 'gemini', 'ollama']).default('openai'),
        model: z.string().default('text-embedding-3-small'),
        baseUrl: z.string().url().optional(),
      })
      .default({}),
    faiss: z
      .object({
        persistDir: z.string().default('~/.secureyeoman/vector/faiss'),
      })
      .default({}),
    qdrant: z
      .object({
        url: z.string().default('http://localhost:6333'),
        collection: z.string().default('secureyeoman_memories'),
      })
      .default({}),
    chroma: z
      .object({
        url: z.string().default('http://localhost:8000'),
        collection: z.string().default('secureyeoman_memories'),
      })
      .default({}),
  })
  .default({});

export type VectorConfig = z.infer<typeof VectorConfigSchema>;

export const ConsolidationConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    schedule: z.string().default('0 2 * * *'),
    quickCheck: z
      .object({
        autoDedupThreshold: z.number().min(0).max(1).default(0.95),
        flagThreshold: z.number().min(0).max(1).default(0.85),
      })
      .default({}),
    deepConsolidation: z
      .object({
        replaceThreshold: z.number().min(0).max(1).default(0.9),
        batchSize: z.number().int().positive().default(50),
        timeoutMs: z.number().int().positive().default(300000),
        dryRun: z.boolean().default(false),
      })
      .default({}),
    model: z.string().nullable().default(null),
  })
  .default({});

export type ConsolidationConfig = z.infer<typeof ConsolidationConfigSchema>;

export const CognitiveMemoryConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    /** Blend weight α for activation vs content match [0–1]. */
    activationWeight: z.number().min(0).max(1).default(0.3),
    /** Scaling factor for Hebbian boost contribution. */
    hebbianScale: z.number().min(0).default(1.0),
    /** ACT-R retrieval threshold τ — memories below this are filtered. */
    retrievalThreshold: z.number().default(-2.0),
    /** Max associated items to fetch for spreading activation. */
    hebbianTopN: z.number().int().positive().default(10),
    /** Cap on Hebbian boost contribution to composite score. */
    hebbianBoostCap: z.number().min(0).max(1).default(0.5),
  })
  .default({});

export type CognitiveMemoryConfig = z.infer<typeof CognitiveMemoryConfigSchema>;

// ─── Context-Dependent Retrieval Config (Phase 125-D) ──────

export const ContextRetrievalConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    /** Weight for query embedding vs context (0 = pure context, 1 = pure query). */
    queryWeight: z.number().min(0).max(1).default(0.7),
    /** Max conversation messages in the context window. */
    contextWindowSize: z.number().int().min(1).max(20).default(5),
    /** Minimum messages before context fusion activates. */
    minContextMessages: z.number().int().min(1).max(10).default(2),
  })
  .default({});

export type ContextRetrievalConfig = z.infer<typeof ContextRetrievalConfigSchema>;

// ─── Working Memory / Predictive Pre-Fetch Config (Phase 125-D) ──

export const WorkingMemoryConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    /** Max items in the working memory buffer (Miller's 7+-2). */
    capacity: z.number().int().min(3).max(15).default(7),
    /** Items to pre-fetch per prediction cycle. */
    prefetchLimit: z.number().int().min(1).max(20).default(5),
    /** Minimum similarity for pre-fetched items. */
    prefetchThreshold: z.number().min(0).max(1).default(0.3),
    /** Recency weight decay for trajectory (newer = heavier). */
    recencyDecay: z.number().min(0).max(1).default(0.8),
    /** Min queries before trajectory prediction activates. */
    minQueriesForPrediction: z.number().int().min(1).max(10).default(2),
  })
  .default({});

export type WorkingMemoryConfig = z.infer<typeof WorkingMemoryConfigSchema>;

// ─── Salience Classification Config (Phase 125-D) ──────────

export const SalienceConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    /** Weight for urgency dimension. */
    urgencyWeight: z.number().min(0).max(1).default(0.30),
    /** Weight for error dimension. */
    errorWeight: z.number().min(0).max(1).default(0.25),
    /** Weight for frustration dimension. */
    frustrationWeight: z.number().min(0).max(1).default(0.15),
    /** Weight for success dimension. */
    successWeight: z.number().min(0).max(1).default(0.15),
    /** Weight for curiosity dimension. */
    curiosityWeight: z.number().min(0).max(1).default(0.15),
    /** Blend factor for salience in composite score [0–1]. */
    compositeBlendWeight: z.number().min(0).max(1).default(0.1),
  })
  .default({});

export type SalienceConfig = z.infer<typeof SalienceConfigSchema>;

export const BrainConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    maxMemories: z.number().min(100).max(100000).default(10000),
    maxKnowledge: z.number().min(100).max(50000).default(5000),
    memoryRetentionDays: z.number().min(1).max(365).default(90),
    importanceDecayRate: z.number().min(0).max(1).default(0.01),
    contextWindowMemories: z.number().min(0).max(50).default(10),
    maxContentLength: z.number().min(100).max(65536).default(4096),
    importanceFloor: z.number().min(0).max(1).default(0.05),
    vector: VectorConfigSchema,
    consolidation: ConsolidationConfigSchema,
    audit: MemoryAuditPolicySchema,
    cognitiveMemory: CognitiveMemoryConfigSchema,
    contextRetrieval: ContextRetrievalConfigSchema,
    workingMemory: WorkingMemoryConfigSchema,
    salience: SalienceConfigSchema,
  })
  .default({});

export type BrainConfig = z.infer<typeof BrainConfigSchema>;

// ─── Spirit Config ──────────────────────────────────────────

export const SpiritConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    maxPassions: z.number().int().positive().max(100).default(20),
    maxInspirations: z.number().int().positive().max(100).default(20),
    maxPains: z.number().int().positive().max(100).default(20),
  })
  .default({});

export type SpiritConfig = z.infer<typeof SpiritConfigSchema>;

// ─── Passion ────────────────────────────────────────────────

export const PassionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  intensity: z.number().min(0).max(1).default(0.5),
  isActive: z.boolean().default(true),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export type Passion = z.infer<typeof PassionSchema>;

export const PassionCreateSchema = PassionSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type PassionCreate = z.infer<typeof PassionCreateSchema>;

export const PassionUpdateSchema = PassionCreateSchema.partial();
export type PassionUpdate = z.infer<typeof PassionUpdateSchema>;

// ─── Inspiration ────────────────────────────────────────────

export const InspirationSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  impact: z.number().min(0).max(1).default(0.5),
  isActive: z.boolean().default(true),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export type Inspiration = z.infer<typeof InspirationSchema>;

export const InspirationCreateSchema = InspirationSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InspirationCreate = z.infer<typeof InspirationCreateSchema>;

export const InspirationUpdateSchema = InspirationCreateSchema.partial();
export type InspirationUpdate = z.infer<typeof InspirationUpdateSchema>;

// ─── Pain ───────────────────────────────────────────────────

export const PainSchema = z.object({
  id: z.string().min(1),
  trigger: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  severity: z.number().min(0).max(1).default(0.5),
  isActive: z.boolean().default(true),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export type Pain = z.infer<typeof PainSchema>;

export const PainCreateSchema = PainSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type PainCreate = z.infer<typeof PainCreateSchema>;

export const PainUpdateSchema = PainCreateSchema.partial();
export type PainUpdate = z.infer<typeof PainUpdateSchema>;

// ─── User Profile ──────────────────────────────────────────

export const UserRelationshipSchema = z.enum(['owner', 'collaborator', 'user', 'guest']);
export type UserRelationship = z.infer<typeof UserRelationshipSchema>;

export const UserProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  nickname: z.string().max(100).default(''),
  relationship: UserRelationshipSchema.default('user'),
  preferences: z.record(z.string(), z.string()).default({}),
  notes: z.string().max(2000).default(''),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export type UserProfile = z.infer<typeof UserProfileSchema>;

export const UserProfileCreateSchema = UserProfileSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type UserProfileCreate = z.infer<typeof UserProfileCreateSchema>;

export const UserProfileUpdateSchema = UserProfileCreateSchema.partial();
export type UserProfileUpdate = z.infer<typeof UserProfileUpdateSchema>;

// ─── Heartbeat ─────────────────────────────────────────────

export const HeartbeatCheckTypeSchema = z.enum([
  'system_health',
  'memory_status',
  'log_anomalies',
  'integration_health',
  'reflective_task',
  'llm_analysis', // NEW: LLM-driven analysis check
  'custom',
]);
export type HeartbeatCheckType = z.infer<typeof HeartbeatCheckTypeSchema>;

// Action trigger condition
export const HeartbeatActionConditionSchema = z.enum(['always', 'on_warning', 'on_error', 'on_ok']);
export type HeartbeatActionCondition = z.infer<typeof HeartbeatActionConditionSchema>;

// Action types
export const HeartbeatActionTypeSchema = z.enum([
  'webhook',
  'notify',
  'remember',
  'execute',
  'llm_analyze',
]);
export type HeartbeatActionType = z.infer<typeof HeartbeatActionTypeSchema>;

// Webhook action configuration
export const WebhookActionConfigSchema = z.object({
  url: z.string().url(),
  method: z.enum(['GET', 'POST', 'PUT']).default('POST'),
  headers: z.record(z.string()).optional(),
  timeoutMs: z.number().int().min(1000).max(60000).default(30000),
  retryCount: z.number().int().min(0).max(5).default(2),
  retryDelayMs: z.number().int().min(100).max(10000).default(1000),
});
export type WebhookActionConfig = z.infer<typeof WebhookActionConfigSchema>;

// Notification action configuration
export const NotifyActionConfigSchema = z.object({
  channel: z.enum(['email', 'slack', 'telegram', 'discord', 'console']),
  recipients: z.array(z.string()).optional(),
  messageTemplate: z.string().optional(),
});
export type NotifyActionConfig = z.infer<typeof NotifyActionConfigSchema>;

// Remember action configuration
export const RememberActionConfigSchema = z.object({
  importance: z.number().min(0).max(1).default(0.5),
  category: z.string().default('heartbeat_alert'),
  memoryType: z.enum(['episodic', 'semantic']).default('episodic'),
});
export type RememberActionConfig = z.infer<typeof RememberActionConfigSchema>;

// Execute action configuration
export const ExecuteActionConfigSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).default([]),
  timeoutMs: z.number().int().min(1000).max(300000).default(60000),
  captureOutput: z.boolean().default(true),
});
export type ExecuteActionConfig = z.infer<typeof ExecuteActionConfigSchema>;

// LLM analyze action configuration
export const LLMAnalyzeActionConfigSchema = z.object({
  prompt: z.string(),
  model: z.string().optional(), // Defaults to cheapest available
  maxTokens: z.number().int().positive().max(10000).default(500),
  temperature: z.number().min(0).max(2).default(0.3),
  expectedOutput: z.enum(['boolean', 'categorize', 'extract', 'summary']).default('summary'),
});
export type LLMAnalyzeActionConfig = z.infer<typeof LLMAnalyzeActionConfigSchema>;

// Heartbeat action trigger
export const HeartbeatActionTriggerSchema = z.object({
  condition: HeartbeatActionConditionSchema,
  action: HeartbeatActionTypeSchema,
  config: z
    .union([
      WebhookActionConfigSchema,
      NotifyActionConfigSchema,
      RememberActionConfigSchema,
      ExecuteActionConfigSchema,
      LLMAnalyzeActionConfigSchema,
      z.record(z.unknown()),
    ])
    .default({}),
});
export type HeartbeatActionTrigger = z.infer<typeof HeartbeatActionTriggerSchema>;

// Conditional scheduling
export const HeartbeatScheduleSchema = z.object({
  daysOfWeek: z.array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])).optional(),
  activeHours: z
    .object({
      start: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/), // HH:mm format
      end: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
      timezone: z.string().default('UTC'),
    })
    .optional(),
});
export type HeartbeatSchedule = z.infer<typeof HeartbeatScheduleSchema>;

export const HeartbeatCheckSchema = z.object({
  name: z.string().min(1).max(100),
  type: HeartbeatCheckTypeSchema,
  enabled: z.boolean().default(true),
  intervalMs: z.number().int().min(30_000).max(86_400_000).optional(),
  schedule: HeartbeatScheduleSchema.optional(), // NEW: Conditional scheduling
  config: z.record(z.string(), z.unknown()).default({}),
  actions: z.array(HeartbeatActionTriggerSchema).default([]), // NEW: Proactive actions
});

export type HeartbeatCheck = z.infer<typeof HeartbeatCheckSchema>;

export const HeartbeatConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    intervalMs: z.number().int().min(5000).max(3_600_000).default(30_000),
    defaultActions: z.array(HeartbeatActionTriggerSchema).default([]), // NEW: Global default actions
    checks: z.array(HeartbeatCheckSchema).default([
      {
        name: 'system_health',
        type: 'system_health',
        enabled: true,
        intervalMs: 300_000,
        config: {},
        actions: [],
      },
      {
        name: 'memory_status',
        type: 'memory_status',
        enabled: true,
        intervalMs: 600_000,
        config: {},
        actions: [],
      },
      {
        name: 'log_anomalies',
        type: 'log_anomalies',
        enabled: true,
        intervalMs: 300_000,
        config: {},
        actions: [],
      },
      {
        name: 'self_reflection',
        type: 'reflective_task',
        enabled: true,
        intervalMs: 1_800_000,
        config: { prompt: 'how can I help my user and improve myself, securely' },
        actions: [],
      },
    ]),
  })
  .default({});

export type HeartbeatConfig = z.infer<typeof HeartbeatConfigSchema>;

// ─── External Brain Sync ───────────────────────────────────

export const ExternalBrainProviderSchema = z.enum(['obsidian', 'git_repo', 'filesystem']);
export type ExternalBrainProvider = z.infer<typeof ExternalBrainProviderSchema>;

export const ExternalBrainConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    provider: ExternalBrainProviderSchema.default('obsidian'),
    /** Absolute path to the vault/repo root directory */
    path: z.string().default(''),
    /** Subdirectory within the vault for FRIDAY notes (e.g. "30 - Resources/FRIDAY") */
    subdir: z.string().default(''),
    /** Auto-sync interval in ms (0 = manual only) */
    syncIntervalMs: z.number().int().min(0).max(86_400_000).default(0),
    /** Which memory types to sync */
    syncMemories: z.boolean().default(true),
    /** Which knowledge entries to sync */
    syncKnowledge: z.boolean().default(true),
    /** Include frontmatter/metadata in exported markdown */
    includeFrontmatter: z.boolean().default(true),
    /** Tag prefix for Obsidian tags (e.g. "secureyeoman/" → #secureyeoman/memory) */
    tagPrefix: z.string().max(50).default('secureyeoman/'),
  })
  .default({});

export type ExternalBrainConfig = z.infer<typeof ExternalBrainConfigSchema>;

// ─── Heart Config ───────────────────────────────────────────

export const HeartConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    intervalMs: z.number().int().min(5000).max(3_600_000).default(30_000),
    checks: z.array(HeartbeatCheckSchema).default([
      {
        name: 'system_health',
        type: 'system_health',
        enabled: true,
        intervalMs: 300_000,
        config: {},
      },
      {
        name: 'memory_status',
        type: 'memory_status',
        enabled: true,
        intervalMs: 600_000,
        config: {},
      },
      {
        name: 'log_anomalies',
        type: 'log_anomalies',
        enabled: true,
        intervalMs: 300_000,
        config: {},
      },
      {
        name: 'self_reflection',
        type: 'reflective_task',
        enabled: true,
        intervalMs: 1_800_000,
        config: { prompt: 'how can I help my user and improve myself, securely' },
      },
    ]),
  })
  .default({});

export type HeartConfig = z.infer<typeof HeartConfigSchema>;

// ─── Comms Config ────────────────────────────────────────────

export const MessageTypeSchema = z.enum([
  'task_request',
  'task_response',
  'knowledge_share',
  'status_update',
  'coordination',
]);
export type MessageType = z.infer<typeof MessageTypeSchema>;

export const CommsConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    agentName: z.string().default(''),
    listenForPeers: z.boolean().default(true),
    maxPeers: z.number().int().positive().max(100).default(10),
    messageRetentionDays: z.number().int().positive().max(365).default(30),
  })
  .default({});

export type CommsConfig = z.infer<typeof CommsConfigSchema>;

// ─── Reasoning Strategies ────────────────────────────────────

export const ReasoningStrategyCategorySchema = z.enum([
  'chain_of_thought',
  'tree_of_thought',
  'reflexion',
  'self_refine',
  'self_consistent',
  'chain_of_density',
  'argument_of_thought',
  'standard',
]);
export type ReasoningStrategyCategory = z.infer<typeof ReasoningStrategyCategorySchema>;

export const ReasoningStrategySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/),
  description: z.string().max(2000).default(''),
  promptPrefix: z.string().max(4000),
  category: ReasoningStrategyCategorySchema,
  isBuiltin: z.boolean().default(false),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
export type ReasoningStrategy = z.infer<typeof ReasoningStrategySchema>;

export const ReasoningStrategyCreateSchema = ReasoningStrategySchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  isBuiltin: true,
});
export type ReasoningStrategyCreate = z.infer<typeof ReasoningStrategyCreateSchema>;

export const ReasoningStrategyUpdateSchema = ReasoningStrategyCreateSchema.partial();
export type ReasoningStrategyUpdate = z.infer<typeof ReasoningStrategyUpdateSchema>;
