/**
 * Dashboard Types
 *
 * Mirrors the shared types but optimized for frontend use
 */

export interface MetricsSnapshot {
  timestamp: number;
  tasks: TaskMetrics;
  resources: ResourceMetrics;
  security: SecurityMetrics;
}

export interface TaskMetrics {
  total: number;
  tasksToday?: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  successRate: number;
  failureRate: number;
  avgDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  p99DurationMs: number;
  queueDepth: number;
  inProgress: number;
}

export interface ResourceMetrics {
  cpuPercent: number;
  memoryUsedMb: number;
  memoryLimitMb: number;
  memoryPercent: number;
  diskUsedMb: number;
  diskLimitMb?: number;
  inputTokensToday: number;
  outputTokensToday: number;
  tokensUsedToday: number;
  tokensLimitDaily?: number;
  tokensCachedToday: number;
  costUsdToday: number;
  costUsdMonth: number;
  apiCallsTotal: number;
  apiErrorsTotal: number;
  apiLatencyAvgMs: number;
}

export interface SecurityMetrics {
  authAttemptsTotal: number;
  authSuccessTotal: number;
  authFailuresTotal: number;
  activeSessions: number;
  permissionChecksTotal: number;
  permissionDenialsTotal: number;
  blockedRequestsTotal: number;
  rateLimitHitsTotal: number;
  injectionAttemptsTotal: number;
  eventsBySeverity: Record<string, number>;
  eventsByType: Record<string, number>;
  auditEntriesTotal: number;
  auditChainValid: boolean;
  lastAuditVerification?: number;
}

export interface Task {
  id: string;
  correlationId?: string;
  parentTaskId?: string;
  type: string;
  name: string;
  description?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timeout';
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  result?: {
    success: boolean;
    error?: {
      code: string;
      message: string;
    };
  };
  securityContext?: {
    userId?: string;
    role?: string;
    personalityId?: string;
    personalityName?: string;
  };
}

export interface SecurityEvent {
  id: string;
  type: string;
  severity: 'info' | 'warn' | 'error' | 'critical';
  message: string;
  userId?: string;
  ipAddress?: string;
  timestamp: number;
  acknowledged: boolean;
}

export interface AuditEntry {
  id: string;
  sequence: number;
  timestamp: number;
  event: string;
  level: string;
  message: string;
  userId?: string;
  taskId?: string;
  metadata?: Record<string, unknown>;
  signature?: string;
  previousHash?: string;
}

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  version: string;
  uptime: number;
  networkMode?: 'local' | 'lan' | 'public';
  checks: {
    database: boolean;
    auditChain: boolean;
  };
}

export interface WebSocketMessage {
  type: 'update' | 'event' | 'error' | 'ack';
  channel: string;
  payload: unknown;
  timestamp: number;
  sequence: number;
}

// ─── Soul Types ──────────────────────────────────────────────

export interface DefaultModel {
  provider: string;
  model: string;
}

export interface Personality {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  traits: Record<string, string>;
  sex: 'male' | 'female' | 'non-binary' | 'unspecified';
  voice: string;
  preferredLanguage: string;
  defaultModel: DefaultModel | null;
  modelFallbacks: { provider: string; model: string }[];
  includeArchetypes: boolean;
  injectDateTime: boolean;
  empathyResonance: boolean;
  avatarUrl: string | null;
  isActive: boolean;
  isDefault: boolean;
  isArchetype: boolean;
  isWithinActiveHours?: boolean;
  body?: {
    enabled?: boolean;
    capabilities?: string[];
    heartEnabled?: boolean;
    creationConfig?: {
      skills?: boolean;
      tasks?: boolean;
      personalities?: boolean;
      subAgents?: boolean;
      customRoles?: boolean;
      roleAssignments?: boolean;
      experiments?: boolean;
      allowA2A?: boolean;
      allowSwarms?: boolean;
      allowDynamicTools?: boolean;
      workflows?: boolean;
    };
    selectedServers?: string[];
    selectedIntegrations?: string[];
    integrationAccess?: { id: string; mode: 'auto' | 'draft' | 'suggest' }[];
    mcpFeatures?: {
      exposeGit?: boolean;
      exposeFilesystem?: boolean;
      exposeWeb?: boolean;
      exposeWebScraping?: boolean;
      exposeWebSearch?: boolean;
      exposeBrowser?: boolean;
      exposeDesktopControl?: boolean;
      exposeNetworkDevices?: boolean;
      exposeNetworkDiscovery?: boolean;
      exposeNetworkAudit?: boolean;
      exposeNetBox?: boolean;
      exposeNvd?: boolean;
      exposeNetworkUtils?: boolean;
      exposeTwingateTools?: boolean;
      exposeOrgIntentTools?: boolean;
      exposeGmail?: boolean;
      exposeTwitter?: boolean;
      exposeGithub?: boolean;
      exposeDocker?: boolean;
      exposeTerminal?: boolean;
    };
    proactiveConfig?: {
      enabled?: boolean;
      builtins?: {
        dailyStandup?: boolean;
        weeklySummary?: boolean;
        contextualFollowup?: boolean;
        integrationHealthAlert?: boolean;
        securityAlertDigest?: boolean;
      };
      builtinModes?: {
        dailyStandup?: 'auto' | 'suggest' | 'manual';
        weeklySummary?: 'auto' | 'suggest' | 'manual';
        contextualFollowup?: 'auto' | 'suggest' | 'manual';
        integrationHealthAlert?: 'auto' | 'suggest' | 'manual';
        securityAlertDigest?: 'auto' | 'suggest' | 'manual';
      };
      learning?: {
        enabled?: boolean;
        minConfidence?: number;
      };
    };
    activeHours?: {
      enabled?: boolean;
      start?: string;
      end?: string;
      daysOfWeek?: ('mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun')[];
      timezone?: string;
    };
    thinkingConfig?: {
      enabled?: boolean;
      budgetTokens?: number;
    };
    reasoningConfig?: {
      enabled?: boolean;
      effort?: 'low' | 'medium' | 'high';
    };
    contextOverflowStrategy?: 'summarise' | 'truncate' | 'error';
    costBudget?: {
      dailyUsd?: number;
      monthlyUsd?: number;
    };
    maxPromptTokens?: number;
    omnipresentMind?: boolean;
    strictSystemPromptConfidentiality?: boolean;
    knowledgeMode?: 'rag' | 'notebook' | 'hybrid';
    notebookTokenBudget?: number;
    defaultStrategyId?: string | null;
    enableCitations?: boolean;
    groundednessMode?: 'off' | 'annotate_only' | 'block_unverified' | 'strip_unverified';
    resourcePolicy?: {
      deletionMode?: 'auto' | 'request' | 'manual';
      automationLevel?: 'full_manual' | 'semi_auto' | 'supervised_auto';
      emergencyStop?: boolean;
    };
  };
  createdAt: number;
  updatedAt: number;
}

export interface PersonalityCreate {
  name: string;
  description?: string;
  systemPrompt?: string;
  traits?: Record<string, string>;
  sex?: 'male' | 'female' | 'non-binary' | 'unspecified';
  voice?: string;
  preferredLanguage?: string;
  defaultModel?: DefaultModel | null;
  modelFallbacks?: { provider: string; model: string }[];
  includeArchetypes?: boolean;
  injectDateTime?: boolean;
  empathyResonance?: boolean;
  body?: {
    enabled?: boolean;
    capabilities?: string[];
    heartEnabled?: boolean;
    creationConfig?: {
      skills?: boolean;
      tasks?: boolean;
      personalities?: boolean;
      subAgents?: boolean;
      customRoles?: boolean;
      roleAssignments?: boolean;
      experiments?: boolean;
      allowA2A?: boolean;
      allowSwarms?: boolean;
      allowDynamicTools?: boolean;
      workflows?: boolean;
    };
    selectedServers?: string[];
    selectedIntegrations?: string[];
    integrationAccess?: { id: string; mode: 'auto' | 'draft' | 'suggest' }[];
    mcpFeatures?: {
      exposeGit?: boolean;
      exposeFilesystem?: boolean;
      exposeWeb?: boolean;
      exposeWebScraping?: boolean;
      exposeWebSearch?: boolean;
      exposeBrowser?: boolean;
      exposeDesktopControl?: boolean;
      exposeNetworkDevices?: boolean;
      exposeNetworkDiscovery?: boolean;
      exposeNetworkAudit?: boolean;
      exposeNetBox?: boolean;
      exposeNvd?: boolean;
      exposeNetworkUtils?: boolean;
      exposeTwingateTools?: boolean;
      exposeOrgIntentTools?: boolean;
      exposeGmail?: boolean;
      exposeTwitter?: boolean;
      exposeGithub?: boolean;
      exposeDocker?: boolean;
      exposeTerminal?: boolean;
    };
    proactiveConfig?: {
      enabled?: boolean;
      builtins?: {
        dailyStandup?: boolean;
        weeklySummary?: boolean;
        contextualFollowup?: boolean;
        integrationHealthAlert?: boolean;
        securityAlertDigest?: boolean;
      };
      builtinModes?: {
        dailyStandup?: 'auto' | 'suggest' | 'manual';
        weeklySummary?: 'auto' | 'suggest' | 'manual';
        contextualFollowup?: 'auto' | 'suggest' | 'manual';
        integrationHealthAlert?: 'auto' | 'suggest' | 'manual';
        securityAlertDigest?: 'auto' | 'suggest' | 'manual';
      };
      learning?: {
        enabled?: boolean;
        minConfidence?: number;
      };
    };
    activeHours?: {
      enabled?: boolean;
      start?: string;
      end?: string;
      daysOfWeek?: ('mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun')[];
      timezone?: string;
    };
    thinkingConfig?: {
      enabled?: boolean;
      budgetTokens?: number;
    };
    reasoningConfig?: {
      enabled?: boolean;
      effort?: 'low' | 'medium' | 'high';
    };
    contextOverflowStrategy?: 'summarise' | 'truncate' | 'error';
    costBudget?: {
      dailyUsd?: number;
      monthlyUsd?: number;
    };
    maxPromptTokens?: number;
    omnipresentMind?: boolean;
    strictSystemPromptConfidentiality?: boolean;
    knowledgeMode?: 'rag' | 'notebook' | 'hybrid';
    notebookTokenBudget?: number;
    defaultStrategyId?: string | null;
    enableCitations?: boolean;
    groundednessMode?: 'off' | 'annotate_only' | 'block_unverified' | 'strip_unverified';
    resourcePolicy?: {
      deletionMode?: 'auto' | 'request' | 'manual';
      automationLevel?: 'full_manual' | 'semi_auto' | 'supervised_auto';
      emergencyStop?: boolean;
    };
  };
}

// ─── Spirit Types ────────────────────────────────────────────

export interface Passion {
  id: string;
  name: string;
  description: string;
  intensity: number;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Inspiration {
  id: string;
  source: string;
  description: string;
  impact: number;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Pain {
  id: string;
  trigger: string;
  description: string;
  severity: number;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

// ─── Brain Types ─────────────────────────────────────────────

export interface KnowledgeEntry {
  id: string;
  personalityId: string | null;
  topic: string;
  content: string;
  source: string;
  confidence: number;
  createdAt: number;
  updatedAt: number;
}

export interface CatalogSkillAuthorInfo {
  name: string;
  github?: string;
  website?: string;
  license?: string;
}

/** Canonical catalog-layer skill type — mirrors CatalogSkillSchema from @secureyeoman/shared. */
export interface CatalogSkill {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  authorInfo?: CatalogSkillAuthorInfo;
  category: string;
  tags: string[];
  downloadCount: number;
  rating: number;
  instructions: string;
  tools: { name: string; description: string }[];
  triggerPatterns: string[];
  useWhen?: string;
  doNotUseWhen?: string;
  successCriteria?: string;
  mcpToolsAllowed?: string[];
  routing?: 'fuzzy' | 'explicit';
  autonomyLevel?: AutonomyLevel;
  installed: boolean;
  installedGlobally: boolean;
  source: 'builtin' | 'community' | 'published';
  /** Derived from source: 'community' when source='community', else 'marketplace'. */
  origin: 'marketplace' | 'community';
  publishedAt: number;
  updatedAt: number;
}

/** @deprecated Use CatalogSkill. */
export type MarketplaceSkill = CatalogSkill;
/** @deprecated Use CatalogSkillAuthorInfo. */
export type MarketplaceSkillAuthorInfo = CatalogSkillAuthorInfo;

// ─── Autonomy Level (Phase 49) ──────────────────────────────
export type AutonomyLevel = 'L1' | 'L2' | 'L3' | 'L4' | 'L5';
export type AuditItemStatus = 'pending' | 'pass' | 'fail' | 'deferred';

export interface AutonomyOverviewItem {
  id: string;
  name: string;
  type: 'skill' | 'workflow';
  autonomyLevel: AutonomyLevel;
  emergencyStopProcedure?: string;
}

export interface AutonomyOverview {
  byLevel: Record<AutonomyLevel, AutonomyOverviewItem[]>;
  totals: Record<AutonomyLevel, number>;
}

export interface ChecklistItem {
  id: string;
  section: 'A' | 'B' | 'C' | 'D';
  text: string;
  status: AuditItemStatus;
  note: string;
}

export interface AuditRun {
  id: string;
  name: string;
  status: string;
  items: ChecklistItem[];
  reportMarkdown?: string;
  reportJson?: unknown;
  createdBy?: string;
  createdAt: number;
  completedAt?: number;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  instructions: string;
  tools: { name: string; description: string; inputSchema: Record<string, unknown> }[];
  triggerPatterns: string[];
  // Routing quality (Phase 44)
  useWhen?: string;
  doNotUseWhen?: string;
  successCriteria?: string;
  mcpToolsAllowed?: string[];
  routing?: 'fuzzy' | 'explicit';
  linkedWorkflowId?: string | null;
  // Autonomy (Phase 49)
  autonomyLevel?: AutonomyLevel;
  emergencyStopProcedure?: string;
  enabled: boolean;
  source: 'user' | 'ai_proposed' | 'ai_learned' | 'marketplace' | 'community';
  status: 'active' | 'pending_approval' | 'disabled';
  usageCount: number;
  invokedCount?: number;
  lastUsedAt: number | null;
  personalityId?: string | null;
  personalityName?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface SkillCreate {
  name: string;
  description?: string;
  instructions?: string;
  tools?: Skill['tools'];
  triggerPatterns?: string[];
  // Routing quality (Phase 44)
  useWhen?: string;
  doNotUseWhen?: string;
  successCriteria?: string;
  mcpToolsAllowed?: string[];
  routing?: 'fuzzy' | 'explicit';
  linkedWorkflowId?: string | null;
  // Autonomy (Phase 49)
  autonomyLevel?: AutonomyLevel;
  emergencyStopProcedure?: string;
  enabled?: boolean;
  source?: Skill['source'];
  status?: Skill['status'];
  personalityId?: string | null;
}

export interface HeartbeatTask {
  name: string;
  type: string;
  enabled: boolean;
  intervalMs?: number;
  lastRunAt: number | null;
  config: Record<string, unknown>;
  /** @deprecated use personalities[] */
  personalityId?: string | null;
  /** @deprecated use personalities[] */
  personalityName?: string | null;
  /** All personalities currently served by this heartbeat task */
  personalities?: { id: string; name: string }[];
}

export interface HeartbeatLogEntry {
  id: string;
  checkName: string;
  personalityId: string | null;
  ranAt: number;
  status: 'ok' | 'warning' | 'error';
  message: string;
  durationMs: number;
  errorDetail: string | null;
}

export interface HeartbeatStatus {
  running: boolean;
  enabled: boolean;
  intervalMs: number;
  beatCount: number;
  lastBeat: { timestamp: number; results: Record<string, unknown> } | null;
  tasks: HeartbeatTask[];
  /** Number of currently enabled personalities this heartbeat serves */
  activePersonalityCount?: number;
  /** Total heartbeat task slots = tasks.length × activePersonalityCount */
  totalTasks?: number;
  /** Enabled task slots = enabled tasks × activePersonalityCount */
  enabledTasks?: number;
}

export interface OnboardingStatus {
  needed: boolean;
  agentName: string | null;
  personality: Personality | null;
}

export interface PromptPreview {
  prompt: string;
  tools: { name: string; description: string; inputSchema: Record<string, unknown> }[];
  charCount: number;
  estimatedTokens: number;
}

// ─── API Key Types ──────────────────────────────────────────

export interface ApiKey {
  id: string;
  name: string;
  role: string;
  prefix: string;
  createdAt: string;
  expiresAt?: string;
  lastUsedAt?: string;
}

export interface ApiKeyCreateRequest {
  name: string;
  role: string;
  expiresInDays?: number;
}

export interface ApiKeyCreateResponse extends ApiKey {
  rawKey: string;
}

// ─── Integration / Connection Types ─────────────────────────

export type IntegrationStatus = 'connected' | 'disconnected' | 'error' | 'configuring';

export interface IntegrationInfo {
  id: string;
  platform: string;
  displayName: string;
  status: IntegrationStatus;
  enabled: boolean;
  config: Record<string, unknown>;
  connectedAt?: string;
  lastMessageAt?: string;
  messageCount: number;
  errorMessage?: string;
}

/** Response from GET /api/v1/ai/health */
export interface AiHealthStatus {
  status: 'reachable' | 'unreachable' | 'configured' | 'missing_key';
  provider: string;
  model: string;
  local: boolean;
  baseUrl?: string;
  latencyMs?: number;
}

/** Stored OAuth token record returned by GET /api/v1/auth/oauth/tokens */
export interface OAuthConnectedToken {
  id: string;
  provider: string;
  email: string;
  userId: string;
  scopes: string;
  expiresAt: number | null;
  createdAt: number;
  updatedAt: number;
}

// ─── Brain Types (Memory) ────────────────────────────────────

export interface Memory {
  id: string;
  personalityId: string | null;
  type: 'episodic' | 'semantic' | 'procedural' | 'preference';
  content: string;
  source: string;
  importance: number;
  createdAt: number;
}

export interface BrainContext {
  memoriesUsed: number;
  knowledgeUsed: number;
  contextSnippets: string[];
}

// ─── Conversation Types ─────────────────────────────────────

export interface Conversation {
  id: string;
  title: string;
  personalityId: string | null;
  messageCount: number;
  parentConversationId: string | null;
  forkMessageIndex: number | null;
  branchLabel: string | null;
  createdAt: number;
  updatedAt: number;
}

// ─── Branching & Replay Types (Phase 99) ────────────────────

export interface BranchTreeNode {
  conversationId: string;
  title: string;
  forkMessageIndex: number | null;
  branchLabel: string | null;
  model: string | null;
  qualityScore: number | null;
  messageCount: number;
  children: BranchTreeNode[];
}

export interface ReplayJob {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  sourceConversationIds: string[];
  replayModel: string;
  replayProvider: string;
  replayPersonalityId: string | null;
  totalConversations: number;
  completedConversations: number;
  failedConversations: number;
  errorMessage: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ReplayResult {
  id: string;
  replayJobId: string;
  sourceConversationId: string;
  replayConversationId: string;
  sourceModel: string | null;
  replayModel: string;
  sourceQualityScore: number | null;
  replayQualityScore: number | null;
  pairwiseWinner: 'source' | 'replay' | 'tie' | null;
  pairwiseReason: string | null;
  createdAt: number;
}

export interface ReplayBatchReport {
  job: ReplayJob;
  results: ReplayResult[];
  summary: {
    sourceWins: number;
    replayWins: number;
    ties: number;
    avgSourceQuality: number | null;
    avgReplayQuality: number | null;
  };
}

export interface ConversationMessageResponse {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  model: string | null;
  thinkingContent?: string | null;
  toolCalls?: ToolCallRecord[] | null;
  provider: string | null;
  tokensUsed: number | null;
  brainContext: BrainContext | null;
  creationEvents: CreationEvent[] | null;
  citationsMeta?: {
    sources: SourceReference[];
    citationsEnabled: boolean;
    groundednessMode?: string;
    groundingScore?: number;
  } | null;
  groundingScore?: number | null;
  createdAt: number;
}

export interface ConversationDetail extends Conversation {
  messages: ConversationMessageResponse[];
}

// ─── Chat Types ─────────────────────────────────────────────

/** A resource created by the AI during a tool-execution loop. */
export interface CreationEvent {
  tool: string;
  label: string;
  action: string;
  name: string;
  id?: string;
}

/** A tool invoked by the AI during a response (persisted in the message record). */
export interface ToolCallRecord {
  toolName: string;
  label: string;
  serverName?: string;
  isMcp: boolean;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  model?: string;
  provider?: string;
  tokensUsed?: number;
  brainContext?: BrainContext;
  creationEvents?: CreationEvent[];
  toolCalls?: ToolCallRecord[];
  thinkingContent?: string;
  citationsMeta?: {
    sources: SourceReference[];
    citationsEnabled: boolean;
    groundednessMode?: string;
    groundingScore?: number;
  } | null;
  groundingScore?: number | null;
}

export interface ChatResponse {
  role: 'assistant';
  content: string;
  model: string;
  provider: string;
  tokensUsed?: number;
  brainContext?: BrainContext;
  conversationId?: string;
  creationEvents?: CreationEvent[];
  thinkingContent?: string;
}

// ─── Code Session Types ─────────────────────────────────────

export interface CodeSession {
  id: string;
  filename: string;
  language: string;
  content: string;
  personalityId: string | null;
  createdAt: number;
  updatedAt: number;
}

// ─── Model Types ────────────────────────────────────────────

export interface ModelInfo {
  provider: string;
  model: string;
  inputPer1M: number;
  outputPer1M: number;
  cachedInputPer1M?: number;
}

export interface ModelCurrentConfig {
  provider: string;
  model: string;
  maxTokens: number;
  temperature: number;
  localFirst: boolean;
}

export interface ModelInfoResponse {
  current: ModelCurrentConfig;
  available: Record<string, ModelInfo[]>;
}

// ─── MCP Types ──────────────────────────────────────────────

export interface McpServerConfig {
  id: string;
  name: string;
  description: string;
  transport: 'stdio' | 'sse' | 'streamable-http';
  command: string | null;
  args: string[];
  url: string | null;
  env: Record<string, string>;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  serverId: string;
  serverName: string;
}

export interface McpFeatureConfig {
  exposeGit: boolean;
  exposeFilesystem: boolean;
  exposeWeb: boolean;
  exposeWebScraping: boolean;
  exposeWebSearch: boolean;
  exposeBrowser: boolean;
  exposeDesktopControl: boolean;
  exposeNetworkTools: boolean;
  exposeTwingateTools: boolean;
  exposeOrgIntentTools: boolean;
  respectContentSignal: boolean;
  exposeGmail: boolean;
  exposeTwitter: boolean;
  exposeGithub: boolean;
  exposeKnowledgeBase: boolean;
  exposeDockerTools: boolean;
  // Terminal tools
  exposeTerminal: boolean;
  // CI/CD (Phase 90)
  exposeGithubActions: boolean;
  exposeJenkins: boolean;
  exposeGitlabCi: boolean;
  exposeNorthflank: boolean;
}

export interface CicdPlatformConfig {
  exposeGithubActions: boolean;
  exposeJenkins: boolean;
  jenkinsUrl?: string;
  jenkinsUsername?: string;
  exposeGitlabCi: boolean;
  gitlabUrl: string;
  exposeNorthflank: boolean;
}

export interface McpServerHealth {
  serverId: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  latencyMs: number | null;
  consecutiveFailures: number;
  lastCheckedAt: number | null;
  lastSuccessAt: number | null;
  lastError: string | null;
}

export interface McpCredentialKey {
  key: string;
  createdAt: number;
  updatedAt: number;
}

export interface McpResourceDef {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  serverId: string;
  serverName: string;
}

// ─── Soul Config Types ──────────────────────────────────────

export interface SoulConfig {
  enabled: boolean;
  learningMode: string[];
  maxSkills: number;
  maxPromptTokens: number;
}

// ─── Notification Types (Phase 51 + 55) ─────────────────────────

export type NotificationLevel = 'info' | 'warn' | 'error' | 'critical';

/** Server-persisted notification (DB-backed, pushed via WebSocket). */
export interface ServerNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  level: NotificationLevel;
  source?: string;
  metadata?: Record<string, unknown>;
  readAt: number | null;
  createdAt: number;
}

/** Per-user external notification delivery preference (Phase 55). */
export interface UserNotificationPref {
  id: string;
  userId: string;
  channel: 'slack' | 'telegram' | 'discord' | 'email';
  integrationId: string | null;
  chatId: string;
  enabled: boolean;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  minLevel: NotificationLevel;
  createdAt: number;
  updatedAt: number;
}

// ─── Risk Assessment Types (Phase 53) ────────────────────────────────────────

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type RiskDomain = 'security' | 'autonomy' | 'governance' | 'infrastructure' | 'external';
export type RiskFindingSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type AssessmentStatus = 'pending' | 'running' | 'completed' | 'failed';
export type ExternalFindingStatus = 'open' | 'acknowledged' | 'resolved';
export type ExternalFeedSourceType = 'webhook' | 'upload' | 'manual';
export type ExternalFeedCategory = 'finance' | 'compliance' | 'cyber' | 'other';

export interface RiskFinding {
  id: string;
  domain: RiskDomain;
  severity: RiskFindingSeverity;
  title: string;
  description: string;
  affectedResource?: string;
  recommendation?: string;
  evidence?: Record<string, unknown>;
}

export interface RiskAssessment {
  id: string;
  name: string;
  status: AssessmentStatus;
  assessmentTypes: RiskDomain[];
  windowDays: number;
  compositeScore?: number;
  riskLevel?: RiskLevel;
  domainScores?: Record<string, number>;
  findings?: RiskFinding[];
  findingsCount: number;
  options?: Record<string, unknown>;
  createdBy?: string;
  createdAt: number;
  completedAt?: number;
  error?: string;
}

export interface ExternalFeed {
  id: string;
  name: string;
  description?: string;
  sourceType: ExternalFeedSourceType;
  category: ExternalFeedCategory;
  enabled: boolean;
  config?: Record<string, unknown>;
  lastIngestedAt?: number;
  recordCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface ExternalFinding {
  id: string;
  feedId?: string;
  sourceRef?: string;
  category: ExternalFeedCategory;
  severity: RiskFindingSeverity;
  title: string;
  description?: string;
  affectedResource?: string;
  recommendation?: string;
  evidence?: Record<string, unknown>;
  status: ExternalFindingStatus;
  acknowledgedBy?: string;
  acknowledgedAt?: number;
  resolvedAt?: number;
  sourceDate?: number;
  importedAt: number;
}

export interface CreateRiskAssessmentOptions {
  name: string;
  assessmentTypes?: RiskDomain[];
  windowDays?: number;
  options?: Record<string, unknown>;
}

export interface CreateExternalFeedOptions {
  name: string;
  description?: string;
  sourceType: ExternalFeedSourceType;
  category: ExternalFeedCategory;
  enabled?: boolean;
  config?: Record<string, unknown>;
}

export interface CreateExternalFindingOptions {
  feedId?: string;
  sourceRef?: string;
  category: ExternalFeedCategory;
  severity: RiskFindingSeverity;
  title: string;
  description?: string;
  affectedResource?: string;
  recommendation?: string;
  evidence?: Record<string, unknown>;
  sourceDate?: number;
}

// ── Backup & DR ──────────────────────────────────────────────────

export interface BackupRecord {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  sizeBytes: number | null;
  filePath: string | null;
  error: string | null;
  pgDumpVersion: string | null;
  createdBy: string | null;
  createdAt: number;
  completedAt: number | null;
}

// ── Multi-Tenancy ─────────────────────────────────────────────────

export interface TenantRecord {
  id: string;
  name: string;
  slug: string;
  plan: string;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

// ─── Federation Types (Phase 79) ───────────────────────────────────────

export interface FederationPeer {
  id: string;
  name: string;
  url: string;
  status: 'online' | 'offline' | 'unknown';
  features: { knowledge: boolean; marketplace: boolean; personalities: boolean };
  lastSeen: string | null;
  createdAt: string;
}

// ─── API Gateway Types (Phase 80) ──────────────────────────────────────

export interface ApiKeyUsageSummary {
  keyId: string;
  keyPrefix: string;
  personalityId: string | null;
  requests24h: number;
  tokens24h: number;
  errors24h: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
}

export interface ApiKeyUsageRow {
  id: string;
  keyId: string;
  timestamp: number;
  tokensUsed: number;
  latencyMs: number | null;
  personalityId: string | null;
  statusCode: number;
  errorMessage: string | null;
}

// ─── Knowledge Base Types (Phase 82) ─────────────────────────────────────────

export interface KbDocument {
  id: string;
  personalityId: string | null;
  title: string;
  filename?: string;
  format: 'pdf' | 'html' | 'md' | 'txt' | 'url';
  sourceUrl?: string;
  visibility: 'private' | 'shared';
  status: 'pending' | 'processing' | 'ready' | 'error';
  chunkCount: number;
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
}

export interface KnowledgeHealthStats {
  totalDocuments: number;
  totalChunks: number;
  byFormat: Record<string, number>;
  recentQueryCount: number;
  avgTopScore: number | null;
  lowCoverageQueries: number;
}

// ─── Memory Audit types (Phase 118) ─────────────────────────────────────────

export interface MemoryHealthMetrics {
  healthScore: number;
  totalMemories: number;
  totalKnowledge: number;
  avgImportance: number;
  expiringWithin7Days: number;
  lowImportanceRatio: number;
  duplicateEstimate: number;
  lastAuditAt: number | null;
  lastAuditScope: string | null;
  compressionSavings: number;
}

export interface MemoryAuditReport {
  id: string;
  scope: string;
  status: string;
  startedAt: number;
  completedAt: number | null;
  preSnapshot: Record<string, unknown> | null;
  postSnapshot: Record<string, unknown> | null;
  compressionSummary: Record<string, unknown> | null;
  reorganizationSummary: Record<string, unknown> | null;
  maintenanceSummary: Record<string, unknown> | null;
  error: string | null;
}

// ─── Shareables — Workflow + Swarm exports (Phase 89) ────────────────────────

export interface WorkflowShareableRequires {
  integrations?: string[];
  tools?: string[];
}

export interface SwarmTemplateRequires {
  profileRoles?: string[];
}

export interface CompatibilityCheckResult {
  compatible: boolean;
  gaps: {
    integrations?: string[];
    tools?: string[];
    profileRoles?: string[];
  };
}

// WorkflowDefinition and SwarmTemplate are defined in api/client.ts (authoritative).
// WorkflowExport and SwarmTemplateExport use any for the entity to avoid duplication.

export interface WorkflowExport {
  exportedAt: number;
  requires: WorkflowShareableRequires;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  workflow: any;
}

export interface SwarmTemplateExport {
  exportedAt: number;
  requires: SwarmTemplateRequires;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  template: any;
}

// ─── Observability / Alert Rules (Phase 83) ──────────────────────────────────

export interface AlertChannel {
  type: 'slack' | 'pagerduty' | 'opsgenie' | 'webhook' | 'ntfy';
  url?: string;
  routingKey?: string;
}

export interface AlertRule {
  id: string;
  name: string;
  description?: string;
  metricPath: string;
  operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
  threshold: number;
  channels: AlertChannel[];
  enabled: boolean;
  cooldownSeconds: number;
  lastFiredAt?: number;
  createdAt: number;
  updatedAt: number;
}

// Capture consent (Phase 108)
export type CaptureConsentStatus = 'pending' | 'granted' | 'denied' | 'expired' | 'revoked';

export interface CaptureConsentItem {
  id: string;
  requestedBy: string;
  userId: string;
  scope: { resource: string; duration: number; purpose: string };
  status: CaptureConsentStatus;
  expiresAt: number;
  grantedAt?: number;
  requestedAt: number;
}

export interface CaptureRecordingItem {
  id: string;
  userId: string;
  status: 'active' | 'completed' | 'stopped' | 'failed';
  config: Record<string, unknown>;
  filePath?: string;
  fileSize?: number;
  startedAt: number;
  stoppedAt?: number;
}

// ── Reasoning Strategies (Phase 107-A) ────────────────────────

export interface ReasoningStrategy {
  id: string;
  name: string;
  slug: string;
  description: string;
  promptPrefix: string;
  category: string;
  isBuiltin: boolean;
  createdAt: number;
  updatedAt: number;
}

// ── Inline Citations & Grounding (Phase 110) ──────────────────

export interface SourceReference {
  index: number;
  type: 'memory' | 'knowledge' | 'document_chunk' | 'web_search';
  sourceId: string;
  content: string;
  sourceLabel: string;
  documentId?: string;
  documentTitle?: string;
  confidence?: number;
  trustScore?: number;
  url?: string;
}
