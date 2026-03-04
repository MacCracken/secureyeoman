/**
 * SecureYeoman - Main Entry Point
 *
 * The primary class that initializes and coordinates all SecureYeoman components.
 *
 * Security considerations:
 * - All components are initialized in secure order
 * - Secrets are validated before startup
 * - Graceful shutdown ensures audit trail is complete
 */

import {
  loadConfig,
  validateSecrets,
  requireSecret,
  initializeKeyring,
  type LoadConfigOptions,
} from './config/loader.js';
import type { KeyringManager } from './security/keyring/manager.js';
import { SecretsManager } from './security/secrets-manager.js';
import { TlsManager } from './security/tls-manager.js';
import { SecretRotationManager } from './security/rotation/manager.js';
import { RotationStorage } from './security/rotation/rotation-storage.js';
import type { SecretMetadata } from './security/rotation/types.js';
import { initializeLogger, type SecureLogger } from './logging/logger.js';
import {
  AuditChain,
  InMemoryAuditStorage,
  type AuditChainStorage,
  type AuditQueryOptions,
  type AuditQueryResult,
} from './logging/audit-chain.js';
import { SQLiteAuditStorage } from './logging/sqlite-storage.js';
import { createValidator, type InputValidator } from './security/input-validator.js';
import { createRateLimiter, type RateLimiterLike } from './security/rate-limiter.js';
import { initializeRBAC, type RBAC } from './security/rbac.js';
import { RBACStorage } from './security/rbac-storage.js';
import {
  createTaskExecutor,
  type TaskExecutor,
  type TaskHandler,
  type ExecutionContext,
} from './task/executor.js';
import { SandboxManager, type SandboxManagerConfig } from './sandbox/manager.js';
import type { SandboxOptions } from './sandbox/types.js';
import { GatewayServer, createGatewayServer } from './gateway/server.js';
import { AIClient } from './ai/client.js';
import { UsageStorage } from './ai/usage-storage.js';
import { AuthStorage } from './security/auth-storage.js';
import { AuthService } from './security/auth.js';
import { sha256 } from './utils/crypto.js';
import { SoulStorage } from './soul/storage.js';
import { SoulManager } from './soul/manager.js';
import { ApprovalManager } from './soul/approval-manager.js';
import { BrainStorage } from './brain/storage.js';
import { BrainManager } from './brain/manager.js';
import { DocumentManager } from './brain/document-manager.js';
import { SpiritStorage } from './spirit/storage.js';
import { SpiritManager } from './spirit/manager.js';
import { AgentComms } from './comms/agent-comms.js';
import { TaskStorage } from './task/task-storage.js';
import { IntegrationStorage } from './integrations/storage.js';
import { IntegrationManager } from './integrations/manager.js';
import { PluginLoader } from './integrations/plugin-loader.js';
import { MessageRouter } from './integrations/message-router.js';
import { ConversationManager } from './integrations/conversation.js';
import { TelegramIntegration } from './integrations/telegram/index.js';
import { DiscordIntegration } from './integrations/discord/index.js';
import { SlackIntegration } from './integrations/slack/index.js';
import { GitHubIntegration } from './integrations/github/index.js';
import { IMessageIntegration } from './integrations/imessage/index.js';
import { GoogleChatIntegration } from './integrations/googlechat/index.js';
import { GmailIntegration } from './integrations/gmail/index.js';
import { EmailIntegration } from './integrations/email/index.js';
import { CliIntegration } from './integrations/cli/index.js';
import { GenericWebhookIntegration } from './integrations/webhook/index.js';
import { WhatsAppIntegration } from './integrations/whatsapp/index.js';
import { SignalIntegration } from './integrations/signal/index.js';
import { TeamsIntegration } from './integrations/teams/index.js';
import { GoogleCalendarIntegration } from './integrations/googlecalendar/index.js';
import { NotionIntegration } from './integrations/notion/index.js';
import { GitLabIntegration } from './integrations/gitlab/index.js';
import { JiraIntegration } from './integrations/jira/index.js';
import { AwsIntegration } from './integrations/aws/index.js';
import { AzureDevOpsIntegration } from './integrations/azure/index.js';
import { FigmaIntegration } from './integrations/figma/index.js';
import { StripeIntegration } from './integrations/stripe/index.js';
import { ZapierIntegration } from './integrations/zapier/index.js';
import { QQIntegration } from './integrations/qq/index.js';
import { DingTalkIntegration } from './integrations/dingtalk/index.js';
import { LineIntegration } from './integrations/line/index.js';
import { LinearIntegration } from './integrations/linear/index.js';
import { AirtableIntegration } from './integrations/airtable/index.js';
import { TodoistIntegration } from './integrations/todoist/index.js';
import { SpotifyIntegration } from './integrations/spotify/index.js';
import { YouTubeIntegration } from './integrations/youtube/index.js';
import { TwitterIntegration } from './integrations/twitter/index.js';
import { HeartbeatManager } from './body/heartbeat.js';
import { HeartbeatLogStorage } from './body/heartbeat-log-storage.js';
import { HeartManager } from './body/heart.js';
import { ExternalBrainSync } from './brain/external-sync.js';
import { McpStorage } from './mcp/storage.js';
import { McpClientManager } from './mcp/client.js';
import { McpServer } from './mcp/server.js';
import { AuditReportGenerator } from './reporting/audit-report.js';
import { CostOptimizer } from './ai/cost-optimizer.js';
import { PROVIDER_KEY_ENV } from './ai/cost-calculator.js';
import { DashboardStorage } from './dashboard/storage.js';
import { DashboardManager } from './dashboard/manager.js';
import { WorkspaceStorage } from './workspace/storage.js';
import { WorkspaceManager } from './workspace/manager.js';
import { SsoStorage } from './security/sso-storage.js';
import { SsoManager } from './security/sso-manager.js';
import { ExperimentStorage } from './experiment/storage.js';
import { ExperimentManager } from './experiment/manager.js';
import { MarketplaceStorage } from './marketplace/storage.js';
import { MarketplaceManager } from './marketplace/manager.js';
import { ConversationStorage } from './chat/conversation-storage.js';
import { BranchingManager } from './chat/branching-manager.js';
import { SubAgentStorage } from './agents/storage.js';
import { SubAgentManager } from './agents/manager.js';
import { SwarmStorage } from './agents/swarm-storage.js';
import { SwarmManager } from './agents/swarm-manager.js';
import { TeamStorage } from './agents/team-storage.js';
import { TeamManager } from './agents/team-manager.js';
import { CouncilStorage } from './agents/council-storage.js';
import { CouncilManager } from './agents/council-manager.js';
import { WorkflowStorage } from './workflow/workflow-storage.js';
import { WorkflowManager } from './workflow/workflow-manager.js';
import { PersonalityVersionStorage } from './soul/personality-version-storage.js';
import { PersonalityVersionManager } from './soul/personality-version-manager.js';
import { WorkflowVersionStorage } from './workflow/workflow-version-storage.js';
import { WorkflowVersionManager } from './workflow/workflow-version-manager.js';
import { PersonalityMarkdownSerializer } from './soul/personality-serializer.js';
import { ExtensionStorage } from './extensions/storage.js';
import { ExtensionManager } from './extensions/manager.js';
import { ExecutionStorage } from './execution/storage.js';
import { CodeExecutionManager } from './execution/manager.js';
import { A2AStorage } from './a2a/storage.js';
import { A2AManager } from './a2a/manager.js';
import { RemoteDelegationTransport } from './a2a/transport.js';
import { DynamicToolStorage } from './soul/dynamic-tool-storage.js';
import { DynamicToolManager } from './soul/dynamic-tool-manager.js';
import { IntentStorage } from './intent/storage.js';
import { IntentManager } from './intent/manager.js';
import { AutonomyAuditStorage, AutonomyAuditManager } from './security/autonomy-audit.js';
import { NotificationStorage } from './notifications/notification-storage.js';
import { NotificationManager } from './notifications/notification-manager.js';
import { UserNotificationPrefsStorage } from './notifications/user-notification-prefs-storage.js';
import { RiskAssessmentStorage } from './risk-assessment/risk-assessment-storage.js';
import { RiskAssessmentManager } from './risk-assessment/risk-assessment-manager.js';
import { DepartmentRiskStorage } from './risk-assessment/department-risk-storage.js';
import { DepartmentRiskManager } from './risk-assessment/department-risk-manager.js';
import { ProviderAccountStorage } from './ai/provider-account-storage.js';
import { ProviderAccountManager } from './ai/provider-account-manager.js';
import { ProviderHealthTracker } from './ai/provider-health.js';
import { CostBudgetChecker } from './ai/cost-budget-checker.js';
import { ProviderKeyValidator } from './ai/provider-key-validator.js';
import { AthiStorage } from './security/athi-storage.js';
import { AthiManager } from './security/athi-manager.js';
import { BackupStorage } from './backup/backup-storage.js';
import { BackupManager } from './backup/backup-manager.js';
import { TenantStorage } from './tenants/tenant-storage.js';
import { TenantManager } from './tenants/tenant-manager.js';
import { SystemPreferencesStorage } from './config/system-preferences-storage.js';
import { GroupChatStorage } from './integrations/group-chat-storage.js';
import { RoutingRulesStorage } from './integrations/routing-rules-storage.js';
import { RoutingRulesManager } from './integrations/routing-rules-manager.js';
import { initPoolFromConfig, getPool } from './storage/pg-pool.js';
import { runMigrations } from './storage/migrations/runner.js';
import { closePool } from './storage/pg-pool.js';
import type { Config, TaskCreate, Task, MetricsSnapshot, AuditEntry } from '@secureyeoman/shared';
import os from 'os';
import { OllamaProvider } from './ai/providers/ollama.js';
import { DistillationManager } from './training/distillation-manager.js';
import { FinetuneManager } from './training/finetune-manager.js';
import { DataCurationManager } from './training/data-curation.js';
import { EvaluationManager } from './training/evaluation-manager.js';
import { PipelineApprovalManager } from './training/approval-manager.js';
import { PipelineLineageStorage } from './training/pipeline-lineage.js';
import { ConversationQualityScorer } from './training/conversation-quality-scorer.js';
import { ComputerUseManager } from './training/computer-use-manager.js';
import { CaptureAuditLogger } from './body/capture-audit-logger.js';
import { DesktopTrainingBridge } from './body/desktop-training-bridge.js';
import { LlmJudgeManager } from './training/llm-judge-manager.js';
import { PreferenceManager } from './training/preference-manager.js';
import { DatasetCuratorManager } from './training/dataset-curator.js';
import { ExperimentRegistryManager } from './training/experiment-registry.js';
import { ModelVersionManager } from './training/model-version-manager.js';
import { AbTestManager } from './training/ab-test-manager.js';
import { FederationStorage } from './federation/federation-storage.js';
import { FederationManager } from './federation/federation-manager.js';
import { AlertStorage } from './telemetry/alert-storage.js';
import { AlertManager } from './telemetry/alert-manager.js';
import { initTracing } from './telemetry/otel.js';
import { LicenseManager } from './licensing/license-manager.js';
import { StrategyStorage } from './soul/strategy-storage.js';
import { AnalyticsStorage } from './analytics/analytics-storage.js';
import { SentimentAnalyzer } from './analytics/sentiment-analyzer.js';
import { ConversationSummarizer } from './analytics/conversation-summarizer.js';
import { EntityExtractor } from './analytics/entity-extractor.js';
import { EngagementMetricsService } from './analytics/engagement-metrics.js';
import { UsageAnomalyDetector } from './analytics/usage-anomaly-detector.js';
import {
  CodeScanner,
  SecretsScanner,
  DataScanner,
  ScannerPipeline,
  ExternalizationGate,
  QuarantineStorage,
  ScanHistoryStore,
} from './sandbox/scanning/index.js';

export interface SecureYeomanOptions {
  /** Configuration options */
  config?: LoadConfigOptions;
  /** Custom audit storage backend */
  auditStorage?: AuditChainStorage;
  /** Enable gateway server on startup */
  enableGateway?: boolean;
  /** Path to pre-built dashboard dist for SPA serving */
  dashboardDist?: string;
}

export interface SecureYeomanState {
  initialized: boolean;
  healthy: boolean;
  startedAt?: number;
  config: Config;
}

/**
 * Main SecureYeoman class
 */
export class SecureYeoman {
  private config: Config | null = null;
  private logger: SecureLogger | null = null;
  private auditChain: AuditChain | null = null;
  private auditStorage: AuditChainStorage | null = null;
  private validator: InputValidator | null = null;
  private rateLimiter: RateLimiterLike | null = null;
  private rbac: RBAC | null = null;
  private taskExecutor: TaskExecutor | null = null;
  private aiClient: AIClient | null = null;
  private usageStorage: UsageStorage | null = null;
  private usagePruneTimer: ReturnType<typeof setInterval> | null = null;
  private authStorage: AuthStorage | null = null;
  private authService: AuthService | null = null;
  private gateway: GatewayServer | null = null;
  private keyringManager: KeyringManager | null = null;
  private secretsManager: SecretsManager | null = null;
  private tlsManager: TlsManager | null = null;
  private rotationManager: SecretRotationManager | null = null;
  private rotationStorage: RotationStorage | null = null;
  private rbacStorage: RBACStorage | null = null;
  private brainStorage: BrainStorage | null = null;
  private brainManager: BrainManager | null = null;
  private memoryAuditStorage: import('./brain/audit/audit-store.js').MemoryAuditStorage | null = null;
  private memoryAuditScheduler: import('./brain/audit/scheduler.js').MemoryAuditScheduler | null = null;
  private documentManager: DocumentManager | null = null;
  private heartbeatManager: HeartbeatManager | null = null;
  private heartbeatLogStorage: HeartbeatLogStorage | null = null;
  private heartManager: HeartManager | null = null;
  private externalBrainSync: ExternalBrainSync | null = null;
  private spiritStorage: SpiritStorage | null = null;
  private spiritManager: SpiritManager | null = null;
  private soulStorage: SoulStorage | null = null;
  private soulManager: SoulManager | null = null;
  private approvalManager: ApprovalManager | null = null;
  private agentComms: AgentComms | null = null;
  private integrationStorage: IntegrationStorage | null = null;
  private integrationManager: IntegrationManager | null = null;
  private messageRouter: MessageRouter | null = null;
  private conversationManager: ConversationManager | null = null;
  private sandboxManager: SandboxManager | null = null;
  private taskStorage: TaskStorage | null = null;
  private mcpStorage: McpStorage | null = null;
  private mcpClientManager: McpClientManager | null = null;
  private mcpServer: McpServer | null = null;
  private reportGenerator: AuditReportGenerator | null = null;
  private costOptimizer: CostOptimizer | null = null;
  private dashboardStorage: DashboardStorage | null = null;
  private dashboardManager: DashboardManager | null = null;
  private workspaceStorage: WorkspaceStorage | null = null;
  private workspaceManager: WorkspaceManager | null = null;
  private ssoStorage: SsoStorage | null = null;
  private ssoManager: SsoManager | null = null;
  private experimentStorage: ExperimentStorage | null = null;
  private experimentManager: ExperimentManager | null = null;
  private marketplaceStorage: MarketplaceStorage | null = null;
  private marketplaceManager: MarketplaceManager | null = null;
  private chatConversationStorage: ConversationStorage | null = null;
  private branchingManager: BranchingManager | null = null;
  private subAgentStorage: SubAgentStorage | null = null;
  private subAgentManager: SubAgentManager | null = null;
  private swarmStorage: SwarmStorage | null = null;
  private swarmManager: SwarmManager | null = null;
  private teamStorage: TeamStorage | null = null;
  private teamManager: TeamManager | null = null;
  private councilStorage: CouncilStorage | null = null;
  private councilManager: CouncilManager | null = null;
  private workflowStorage: WorkflowStorage | null = null;
  private workflowManager: WorkflowManager | null = null;
  private personalityVersionStorage: PersonalityVersionStorage | null = null;
  private personalityVersionManager: PersonalityVersionManager | null = null;
  private workflowVersionStorage: WorkflowVersionStorage | null = null;
  private workflowVersionManager: WorkflowVersionManager | null = null;
  private extensionStorage: ExtensionStorage | null = null;
  private extensionManager: ExtensionManager | null = null;
  private executionStorage: ExecutionStorage | null = null;
  private executionManager: CodeExecutionManager | null = null;
  private a2aStorage: A2AStorage | null = null;
  private a2aManager: A2AManager | null = null;
  private dynamicToolStorage: DynamicToolStorage | null = null;
  private dynamicToolManager: DynamicToolManager | null = null;
  private intentStorage: IntentStorage | null = null;
  private intentManager: IntentManager | null = null;
  private autonomyAuditStorage: AutonomyAuditStorage | null = null;
  private autonomyAuditManager: AutonomyAuditManager | null = null;
  private notificationStorage: NotificationStorage | null = null;
  private notificationManager: NotificationManager | null = null;
  private userNotificationPrefsStorage: UserNotificationPrefsStorage | null = null;
  private riskAssessmentStorage: RiskAssessmentStorage | null = null;
  private riskAssessmentManager: RiskAssessmentManager | null = null;
  private riskScheduleTimer: ReturnType<typeof setInterval> | null = null;
  private departmentRiskStorage: DepartmentRiskStorage | null = null;
  private departmentRiskManager: DepartmentRiskManager | null = null;
  private athiStorage: AthiStorage | null = null;
  private athiManager: AthiManager | null = null;
  private proactiveManager: import('./proactive/manager.js').ProactiveManager | null = null;
  private multimodalManager: import('./multimodal/manager.js').MultimodalManager | null = null;
  private browserSessionStorage: import('./browser/storage.js').BrowserSessionStorage | null = null;
  private systemPreferences: SystemPreferencesStorage | null = null;
  private groupChatStorage: GroupChatStorage | null = null;
  private routingRulesStorage: RoutingRulesStorage | null = null;
  private routingRulesManager: RoutingRulesManager | null = null;
  private backupStorage: BackupStorage | null = null;
  private backupManager: BackupManager | null = null;
  private tenantStorage: TenantStorage | null = null;
  private tenantManager: TenantManager | null = null;
  private distillationManager: DistillationManager | null = null;
  private finetuneManager: FinetuneManager | null = null;
  private dataCurationManager: DataCurationManager | null = null;
  private evaluationManager: EvaluationManager | null = null;
  private pipelineApprovalManager: PipelineApprovalManager | null = null;
  private pipelineLineageStorage: PipelineLineageStorage | null = null;
  private conversationQualityScorer: ConversationQualityScorer | null = null;
  private computerUseManager: ComputerUseManager | null = null;
  private captureAuditLogger: CaptureAuditLogger | null = null;
  private desktopTrainingBridge: DesktopTrainingBridge | null = null;
  private llmJudgeManager: LlmJudgeManager | null = null;
  private preferenceManager: PreferenceManager | null = null;
  private datasetCuratorManager: DatasetCuratorManager | null = null;
  private experimentRegistryManager: ExperimentRegistryManager | null = null;
  private modelVersionManager: ModelVersionManager | null = null;
  private abTestManager: AbTestManager | null = null;
  private federationStorage: FederationStorage | null = null;
  private federationManager: FederationManager | null = null;
  private alertStorage: AlertStorage | null = null;
  private alertManager: AlertManager | null = null;
  private analyticsStorage: AnalyticsStorage | null = null;
  private sentimentAnalyzer: SentimentAnalyzer | null = null;
  private conversationSummarizer: ConversationSummarizer | null = null;
  private entityExtractor: EntityExtractor | null = null;
  private engagementMetricsService: EngagementMetricsService | null = null;
  private usageAnomalyDetector: UsageAnomalyDetector | null = null;
  private licenseManager: LicenseManager = new LicenseManager();
  private providerAccountStorage: ProviderAccountStorage | null = null;
  private providerAccountManager: ProviderAccountManager | null = null;
  private providerHealthTracker: ProviderHealthTracker = new ProviderHealthTracker();
  private costBudgetChecker: CostBudgetChecker | null = null;
  private strategyStorage: StrategyStorage | null = null;
  private scanHistoryStore: ScanHistoryStore | null = null;
  private quarantineStorage: QuarantineStorage | null = null;
  private externalizationGate: ExternalizationGate | null = null;
  private modelDefaultSet = false;
  private initialized = false;
  private startedAt: number | null = null;
  private shutdownPromise: Promise<void> | null = null;
  // CPU usage sampler — updated every getMetrics() call to compute a rolling delta
  private _lastCpuUsage: NodeJS.CpuUsage = process.cpuUsage();
  private _lastCpuSampleAt: number = Date.now();

  constructor(private readonly options: SecureYeomanOptions = {}) {}

  /**
   * Initialize SecureYeoman
   * Must be called before any other operations
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      throw new Error('SecureYeoman is already initialized');
    }

    try {
      // Step 1: Load and validate configuration
      this.config = loadConfig(this.options.config);

      // Step 1.5: Initialize OpenTelemetry tracing (before any I/O)
      await initTracing({});

      // Step 2: Initialize logger first (needed for other components)
      this.logger = initializeLogger(this.config.logging);
      this.logger.info('SecureYeoman initializing', {
        environment: this.config.core.environment,
        version: this.config.version,
      });

      // Step 2.05b: Initialize LicenseManager
      this.licenseManager = new LicenseManager(process.env.SECUREYEOMAN_LICENSE_KEY);
      const licTier = this.licenseManager.getTier();
      this.logger.info(`License: ${licTier}`, {
        tier: licTier,
        org: this.licenseManager.getClaims()?.organization ?? null,
      });
      if (this.licenseManager.getParseError()) {
        this.logger.warn('License key invalid, running as community tier', {
          err: this.licenseManager.getParseError(),
        });
      }

      // Step 2.5: Initialize keyring (pre-loads secrets from system keyring)
      const knownSecretKeys = [
        this.config.gateway.auth.tokenSecret,
        this.config.gateway.auth.adminPasswordEnv,
        this.config.logging.audit.signingKeyEnv,
        this.config.security.encryption.keyEnv,
        this.config.model.apiKeyEnv,
      ];
      this.keyringManager = initializeKeyring(this.config.security.secretBackend, knownSecretKeys);
      this.logger.debug('Keyring initialized', {
        backend: this.keyringManager.getProvider().name,
      });

      // Step 2.05: Initialize SecretsManager (unified secrets facade)
      {
        const vaultCfg = this.config.security.vault;
        const smConfig: import('./security/secrets-manager.js').SecretsManagerConfig = {
          backend: this.config.security.secretBackend,
          keyringManager: this.keyringManager,
          knownKeys: knownSecretKeys,
          ...(vaultCfg && {
            vault: {
              address: vaultCfg.address,
              mount: vaultCfg.mount,
              namespace: vaultCfg.namespace,
              token: vaultCfg.tokenEnv ? process.env[vaultCfg.tokenEnv] : undefined,
              roleId: vaultCfg.roleIdEnv ? process.env[vaultCfg.roleIdEnv] : undefined,
              secretId: vaultCfg.secretIdEnv ? process.env[vaultCfg.secretIdEnv] : undefined,
            },
            vaultFallback: vaultCfg.fallback,
          }),
        };
        this.secretsManager = new SecretsManager(smConfig);
        await this.secretsManager.initialize();
        this.logger.debug('SecretsManager initialized', {
          backend: this.config.security.secretBackend,
        });
      }

      // Step 2.06: Initialize TlsManager (cert lifecycle)
      {
        const tlsCfg = this.config.gateway.tls;
        this.tlsManager = new TlsManager({
          enabled: tlsCfg.enabled,
          certPath: tlsCfg.certPath,
          keyPath: tlsCfg.keyPath,
          caPath: tlsCfg.caPath,
          autoGenerate: tlsCfg.autoGenerate,
          certDir: `${this.config.core.dataDir}/tls`,
        });
        this.logger.debug('TlsManager initialized', { tlsEnabled: tlsCfg.enabled });
      }

      // Step 2.1: Initialize PostgreSQL pool and run migrations
      initPoolFromConfig(this.config.core.database);
      await runMigrations();
      this.logger.debug('PostgreSQL pool initialized and migrations applied');

      // Step 2.2: Load persisted security policy from DB (overrides YAML defaults)
      await this.loadSecurityPolicyFromDb();

      // Step 2.07: Initialize IntentManager (org intent documents, if enabled)
      if (this.config.security.allowOrgIntent) {
        this.intentStorage = new IntentStorage();
        this.intentManager = new IntentManager({
          storage: this.intentStorage,
          signalRefreshIntervalMs: this.config.intent?.signalRefreshIntervalMs,
          getDepartmentRiskManager: () => this.departmentRiskManager,
        });
        await this.intentManager.initialize();
        this.logger.debug('IntentManager initialized');
      }

      // Step 2.08: Initialize AutonomyAuditStorage (manager is wired lazily via getter)
      this.autonomyAuditStorage = new AutonomyAuditStorage();

      // Step 2.09: Initialize NotificationStorage (manager is wired with broadcast after gateway starts)
      this.notificationStorage = new NotificationStorage();
      this.notificationManager = new NotificationManager(this.notificationStorage);
      this.userNotificationPrefsStorage = new UserNotificationPrefsStorage();
      this.notificationManager.setUserPrefsStorage(this.userNotificationPrefsStorage);
      this.notificationManager.startCleanupJob(this.config.notifications?.retentionDays);
      this.logger.debug('NotificationManager initialized (broadcast wired after gateway starts)');

      // Step 2.10: Initialize RiskAssessmentStorage
      this.riskAssessmentStorage = new RiskAssessmentStorage();
      this.logger.debug('RiskAssessmentStorage initialized');

      // Step 2.11: Initialize DepartmentRiskStorage
      this.departmentRiskStorage = new DepartmentRiskStorage();
      this.logger.debug('DepartmentRiskStorage initialized');

      // Step 2.11b: Initialize ProviderAccountStorage (Phase 112)
      this.providerAccountStorage = new ProviderAccountStorage();
      this.logger.debug('ProviderAccountStorage initialized');

      // Step 2.12: Initialize AthiStorage (Phase 107-F)
      this.athiStorage = new AthiStorage();
      this.logger.debug('AthiStorage initialized');

      // Step 2.13: Initialize ScanHistoryStore + QuarantineStorage (Phase 116)
      this.scanHistoryStore = new ScanHistoryStore();
      const dataDir = this.config.core?.dataDir ?? '~/.secureyeoman/data';
      this.quarantineStorage = new QuarantineStorage(dataDir);
      this.logger.debug('ScanHistoryStore + QuarantineStorage initialized');

      // Step 3: Validate secrets are available
      validateSecrets(this.config);
      this.logger.debug('Secrets validated');

      // Step 4: Initialize security components
      //
      // RBAC is now backed by SQLite persistent storage.  Custom role
      // definitions and user-role assignments are automatically loaded
      // from the database on construction, so roles created via the API
      // survive process restarts.  The storage file lives alongside the
      // other per-component databases in the configured data directory.
      this.rbacStorage = new RBACStorage();
      this.rbac = await initializeRBAC(undefined, this.rbacStorage);
      this.logger.debug('RBAC initialized with persistent storage');

      this.validator = createValidator(this.config.security);
      this.logger.debug('Input validator initialized');

      this.rateLimiter = createRateLimiter(this.config.security);
      this.logger.debug('Rate limiter initialized');

      // Step 5: Initialize audit chain
      const signingKey = requireSecret(this.config.logging.audit.signingKeyEnv);
      const storage = this.options.auditStorage ?? new SQLiteAuditStorage();
      this.auditStorage = storage;

      this.auditChain = new AuditChain({
        storage,
        signingKey,
        repairOnInit: true,
      });
      await this.auditChain.initialize();
      this.logger.debug('Audit chain initialized');

      // Step 5.5: Initialize auth service
      this.authStorage = new AuthStorage();

      const tokenSecret = requireSecret(this.config.gateway.auth.tokenSecret);
      const adminPasswordRaw = requireSecret(this.config.gateway.auth.adminPasswordEnv);
      const adminPassword = sha256(adminPasswordRaw);

      this.authService = new AuthService(
        {
          tokenSecret,
          tokenExpirySeconds: this.config.gateway.auth.tokenExpirySeconds,
          refreshTokenExpirySeconds: this.config.gateway.auth.refreshTokenExpirySeconds,
          adminPassword,
        },
        {
          storage: this.authStorage,
          auditChain: this.auditChain,
          rbac: this.rbac,
          rateLimiter: this.rateLimiter,
          logger: this.logger.child({ component: 'AuthService' }),
        }
      );
      this.logger.debug('Auth service initialized');

      // Step 5.6: Initialize SSO manager
      this.ssoStorage = new SsoStorage();
      this.ssoManager = new SsoManager({
        storage: this.ssoStorage,
        authService: this.authService,
        logger: this.logger.child({ component: 'SsoManager' }),
      });
      this.logger.debug('SSO manager initialized');

      // Step 5.55: Initialize secret rotation (if enabled)
      if (this.config.security.rotation.enabled) {
        this.rotationStorage = new RotationStorage();

        this.rotationManager = new SecretRotationManager(this.rotationStorage, {
          checkIntervalMs: this.config.security.rotation.checkIntervalMs,
          warningDaysBeforeExpiry: this.config.security.rotation.warningDaysBeforeExpiry,
        });

        // Track known secrets
        const now = Date.now();
        const tokenRotDays = this.config.security.rotation.tokenRotationIntervalDays;
        const signingRotDays = this.config.security.rotation.signingKeyRotationIntervalDays;

        const secretDefs: SecretMetadata[] = [
          {
            name: this.config.gateway.auth.tokenSecret,
            createdAt: now,
            expiresAt: now + tokenRotDays * 86_400_000,
            rotatedAt: null,
            rotationIntervalDays: tokenRotDays,
            autoRotate: true,
            source: 'internal',
            category: 'jwt',
          },
          {
            name: this.config.logging.audit.signingKeyEnv,
            createdAt: now,
            expiresAt: now + signingRotDays * 86_400_000,
            rotatedAt: null,
            rotationIntervalDays: signingRotDays,
            autoRotate: true,
            source: 'internal',
            category: 'audit_signing',
          },
          {
            name: this.config.gateway.auth.adminPasswordEnv,
            createdAt: now,
            expiresAt: null,
            rotatedAt: null,
            rotationIntervalDays: null,
            autoRotate: false,
            source: 'external',
            category: 'admin',
          },
          {
            name: this.config.security.encryption.keyEnv,
            createdAt: now,
            expiresAt: null,
            rotatedAt: null,
            rotationIntervalDays: null,
            autoRotate: false,
            source: 'external',
            category: 'encryption',
          },
        ];

        for (const def of secretDefs) {
          await this.rotationManager.trackSecret(def);
        }

        // Wire rotation callbacks
        const authSvc = this.authService;
        const auditCh = this.auditChain;
        const tokenSecretEnv = this.config.gateway.auth.tokenSecret;
        const signingKeyEnv = this.config.logging.audit.signingKeyEnv;

        const secretsMgr = this.secretsManager;
        this.rotationManager.setCallbacks({
          onRotate: async (name, newValue) => {
            // Persist the new value via SecretsManager so the configured backend
            // (file, keyring, vault) always holds the latest rotated secret.
            await secretsMgr?.set(name, newValue);
            if (name === tokenSecretEnv) {
              authSvc.updateTokenSecret(newValue);
            } else if (name === signingKeyEnv) {
              await auditCh.updateSigningKey(newValue);
            }
          },
          onWarning: (name, daysLeft) => {
            this.logger?.warn('Secret expiring soon', { name, daysLeft });
          },
        });

        this.rotationManager.start();
        this.logger.debug('Secret rotation manager started');
      }

      // Step 5.6: Initialize system preferences storage
      this.systemPreferences = new SystemPreferencesStorage();
      await this.systemPreferences.init();
      this.logger.debug('System preferences storage initialized');

      // Step 5.6: Initialize AI client with persistent usage storage
      try {
        this.usageStorage = new UsageStorage();
        const usageStorage = this.usageStorage;
        await usageStorage.init();

        // Prune expired records daily (startup prune already done inside init())
        const MS_PER_DAY = 24 * 60 * 60 * 1000;
        this.usagePruneTimer = setInterval(() => {
          void usageStorage.prune().catch(() => {
            // Non-fatal — old records will be pruned on next startup
          });
        }, MS_PER_DAY);

        this.aiClient = new AIClient(
          {
            model: this.config.model,
            retryConfig: {
              maxRetries: this.config.model.maxRetries,
              baseDelayMs: this.config.model.retryDelayMs,
            },
          },
          {
            auditChain: this.auditChain,
            logger: this.logger.child({ component: 'AIClient' }),
            usageStorage,
            providerAccountManager: this.providerAccountManager ?? undefined,
            healthTracker: this.providerHealthTracker,
          }
        );

        // Cost budget checker (Phase 119)
        if (this.providerAccountStorage) {
          this.costBudgetChecker = new CostBudgetChecker(
            this.providerAccountStorage,
            () => this.alertManager
          );
        }

        // Fire usage history init in the background — non-blocking so startup
        // stays fast, but ensures the tracker is seeded well before the first
        // metrics poll (dashboard refetches every 30 s).
        void this.aiClient
          .init()
          .catch((err: unknown) => this.logger?.warn('AI usage history init failed', { err }));
        this.logger.debug('AI client initialized', { provider: this.config.model.provider });

        // Apply persisted model default if one exists.
        // Uses applyModelSwitch() directly because this.initialized is not yet
        // true at this point — switchModel() would throw ensureInitialized().
        if (this.systemPreferences) {
          const storedProvider = await this.systemPreferences.get('model.provider');
          const storedModel = await this.systemPreferences.get('model.model');
          if (storedProvider && storedModel) {
            this.applyModelSwitch(storedProvider, storedModel);
            this.modelDefaultSet = true;
            this.logger.debug('Applied persisted model default', {
              provider: storedProvider,
              model: storedModel,
            });
          }

          // Restore persisted localFirst setting
          const storedLocalFirst = await this.systemPreferences.get('model.localFirst');
          if (storedLocalFirst === 'true' && this.config) {
            this.config = {
              ...this.config,
              model: { ...this.config.model, localFirst: true },
            };
            this.logger.debug('Applied persisted localFirst=true');
          }
        }

        // Quantization memory check: warn if configured Ollama model may exceed RAM
        if (this.config?.model.provider === 'ollama') {
          const ollamaBaseUrl = this.config.model.baseUrl ?? 'http://localhost:11434';
          const ollamaModel = this.config.model.model;
          try {
            const models = await OllamaProvider.fetchAvailableModels(ollamaBaseUrl);
            const info = models.find(
              (m) => m.id === ollamaModel || m.id.startsWith(ollamaModel + ':')
            );
            if (info?.size) {
              const totalMem = os.totalmem();
              if (info.size > totalMem * 0.8) {
                const sizeGb = (info.size / 1e9).toFixed(1);
                const memGb = (totalMem / 1e9).toFixed(1);
                this.logger.warn(
                  `Ollama model "${ollamaModel}" (${sizeGb} GB) may exceed available RAM ` +
                    `(${memGb} GB). Consider a lower quantization (e.g. Q4_K_M). ` +
                    `See docs/guides/model-quantization.md`
                );
              }
            }
          } catch {
            // non-fatal
          }
        }
      } catch (error) {
        // AI client failure is non-fatal — the system can run without AI
        this.logger.warn('AI client initialization failed (non-fatal)', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      // Step 5.7: Initialize brain system
      this.brainStorage = new BrainStorage();
      this.brainManager = new BrainManager(this.brainStorage, this.config.brain, {
        auditChain: this.auditChain,
        logger: this.logger.child({ component: 'BrainManager' }),
        auditStorage:
          this.auditStorage &&
          'queryEntries' in this.auditStorage &&
          'searchFullText' in this.auditStorage
            ? (this.auditStorage as unknown as import('./brain/types.js').AuditStorage)
            : undefined,
      });
      this.logger.debug('Brain manager initialized');

      // Step 5.7.1: Initialize document manager (knowledge base pipeline)
      this.documentManager = new DocumentManager({
        brainManager: this.brainManager,
        storage: this.brainStorage,
        logger: this.logger.child({ component: 'DocumentManager' }),
      });
      this.logger.debug('Document manager initialized');

      // Step 5.7.2: Initialize memory audit system (Phase 118)
      if (this.config.brain?.audit?.enabled) {
        try {
          const { MemoryAuditStorage } = await import('./brain/audit/audit-store.js');
          const { MemoryAuditPolicy } = await import('./brain/audit/policy.js');
          const { MemoryAuditEngine } = await import('./brain/audit/engine.js');
          const { MemoryAuditScheduler } = await import('./brain/audit/scheduler.js');
          const { MemoryCompressor } = await import('./brain/audit/compressor.js');
          const { MemoryReorganizer } = await import('./brain/audit/reorganizer.js');
          const { KnowledgeGraphCoherenceChecker } = await import('./brain/audit/coherence-checker.js');

          this.memoryAuditStorage = new MemoryAuditStorage();
          const auditPolicy = new MemoryAuditPolicy(this.config.brain.audit);
          const compressor = new MemoryCompressor({
            brainStorage: this.brainStorage,
            auditStorage: this.memoryAuditStorage,
            policy: auditPolicy,
            logger: this.logger.child({ component: 'MemoryCompressor' }),
          });
          const reorganizer = new MemoryReorganizer({
            brainStorage: this.brainStorage,
            auditStorage: this.memoryAuditStorage,
            logger: this.logger.child({ component: 'MemoryReorganizer' }),
          });
          const coherenceChecker = new KnowledgeGraphCoherenceChecker({
            brainStorage: this.brainStorage,
            logger: this.logger.child({ component: 'CoherenceChecker' }),
          });
          const auditEngine = new MemoryAuditEngine({
            brainStorage: this.brainStorage,
            auditStorage: this.memoryAuditStorage,
            policy: auditPolicy,
            brainManager: this.brainManager,
            compressor,
            reorganizer,
            coherenceChecker,
            logger: this.logger.child({ component: 'MemoryAuditEngine' }),
            getAlertManager: () => this.alertManager,
          });
          this.memoryAuditScheduler = new MemoryAuditScheduler({
            brainStorage: this.brainStorage,
            engine: auditEngine,
            policy: auditPolicy,
            logger: this.logger.child({ component: 'MemoryAuditScheduler' }),
          });
          this.logger.debug('Memory audit system initialized');
        } catch (error) {
          this.logger.warn('Failed to initialize memory audit system', { error: String(error) });
        }
      }

      // Step 5.7a: Initialize spirit system (between Brain and Soul)
      this.spiritStorage = new SpiritStorage();
      this.spiritManager = new SpiritManager(this.spiritStorage, this.config.spirit, {
        auditChain: this.auditChain,
        logger: this.logger.child({ component: 'SpiritManager' }),
      });
      this.logger.debug('Spirit manager initialized');

      // Step 5.7b: Initialize soul system (now depends on Brain and Spirit)
      this.soulStorage = new SoulStorage();
      this.approvalManager = new ApprovalManager();
      this.soulManager = new SoulManager(
        this.soulStorage,
        this.config.soul,
        {
          auditChain: this.auditChain,
          logger: this.logger.child({ component: 'SoulManager' }),
          securityConfig: this.config.security,
        },
        this.brainManager,
        this.spiritManager
      );
      await this.soulManager.loadConfigOverrides();
      if (await this.soulManager.needsOnboarding()) {
        if (!(await this.soulManager.getAgentName())) {
          await this.soulManager.setAgentName('FRIDAY');
        }
        await this.soulManager.seedAvailablePresets();
        if ((await this.soulManager.getAgentName()) === 'FRIDAY') {
          await this.spiritManager.seedDefaultSpirit();
        }
        this.logger.debug('Soul personalities seeded (onboarding)');
      }

      // Seed per-personality base knowledge at every startup (idempotent).
      // This ensures new personalities added after first run also get their self-identity.
      {
        const allResult = await this.soulManager.listPersonalities({ limit: 200 });
        await this.brainManager.seedBaseKnowledge(
          allResult.personalities.map((p) => ({ id: p.id, name: p.name }))
        );
      }

      this.logger.debug('Soul manager initialized');

      // Step 5.7b2: Personality version tracking (Phase 114)
      this.personalityVersionStorage = new PersonalityVersionStorage();
      this.personalityVersionManager = new PersonalityVersionManager({
        versionStorage: this.personalityVersionStorage,
        soulStorage: this.soulStorage,
        serializer: new PersonalityMarkdownSerializer(),
      });
      this.soulManager.setPersonalityVersionManager(this.personalityVersionManager);
      this.logger.debug('Personality version manager initialized');

      // Wire SoulManager into AIClient for personality_id tracking
      if (this.aiClient && this.soulManager) {
        this.aiClient.setSoulManager(this.soulManager);
      }

      // Wire IntentManager into SoulManager if available
      if (this.soulManager && this.intentManager) {
        this.soulManager.setIntentManager(this.intentManager);
      }

      // Step 5.7c: Initialize agent comms (if enabled)
      if (this.config.comms?.enabled) {
        this.agentComms = new AgentComms(this.config.comms, {
          logger: this.logger.child({ component: 'AgentComms' }),
          auditChain: this.auditChain,
        });
        await this.agentComms.init({
          keyStorePath: `${this.config.core.dataDir}/agent-keys.json`,
          dbPath: `${this.config.core.dataDir}/comms.db`,
        });
        this.logger.debug('Agent comms initialized');
      }

      // Step 5.75: Initialize integration system
      this.integrationStorage = new IntegrationStorage();
      // IntegrationManager + MessageRouter are fully wired after task executor
      // is available (see post-step-6 below). For now just store the storage.
      this.logger.debug('Integration storage initialized');

      // Step 5.76: Initialize group chat + routing rules storage (PostgreSQL-backed)
      this.groupChatStorage = new GroupChatStorage();
      this.routingRulesStorage = new RoutingRulesStorage();
      this.logger.debug('Group chat and routing rules storage initialized');

      // Step 5.8: Initialize sandbox manager
      const sandboxConfig: SandboxManagerConfig = {
        enabled: this.config.security.sandbox.enabled,
        technology: this.config.security.sandbox.technology,
        allowedReadPaths: this.config.security.sandbox.allowedReadPaths,
        allowedWritePaths: this.config.security.sandbox.allowedWritePaths,
        maxMemoryMb: this.config.security.sandbox.maxMemoryMb,
        maxCpuPercent: this.config.security.sandbox.maxCpuPercent,
        maxFileSizeMb: this.config.security.sandbox.maxFileSizeMb,
        networkAllowed: this.config.security.sandbox.networkAllowed,
      };
      this.sandboxManager = new SandboxManager(sandboxConfig, {
        logger: this.logger.child({ component: 'SandboxManager' }),
        auditChain: this.auditChain,
      });
      const sandboxCaps = this.sandboxManager.detect();
      this.logger.debug('Sandbox manager initialized', {
        enabled: this.sandboxManager.isEnabled(),
        capabilities: sandboxCaps,
      });

      // Step 5.85: Initialize ExternalizationGate (Phase 116)
      try {
        const scanPolicy = this.config.security.sandboxArtifactScanning ?? {};
        const pipeline = new ScannerPipeline(
          [new CodeScanner(), new SecretsScanner(), new DataScanner()],
          { policy: scanPolicy as import('@secureyeoman/shared').ExternalizationPolicy },
        );
        this.externalizationGate = new ExternalizationGate({
          pipeline,
          quarantineStorage: this.quarantineStorage,
          scanHistoryStore: this.scanHistoryStore,
          secretsScanner: new SecretsScanner(),
          policy: scanPolicy as import('@secureyeoman/shared').ExternalizationPolicy,
          getAlertManager: () => this.alertManager ? {
            fire: (type: string, severity: string, message: string, meta?: Record<string, unknown>) => {
              void this.alertManager!.evaluate({ [type]: 1 });
            },
          } : null,
          auditChain: this.auditChain ? {
            record: async (event: string, level: string, message: string, metadata?: Record<string, unknown>): Promise<void> => {
              await this.auditChain!.record({ event, level: level as 'info' | 'warn' | 'error' | 'security' | 'debug' | 'trace', message, metadata });
            },
          } : null,
        });
        this.logger.debug('ExternalizationGate initialized');
      } catch (err) {
        this.logger.warn('ExternalizationGate initialization failed', {
          reason: err instanceof Error ? err.message : String(err),
        });
      }

      // Step 5.9: Initialize task storage
      this.taskStorage = new TaskStorage();
      this.logger.debug('Task storage initialized');

      // Step 6: Initialize task executor
      const sandbox = this.sandboxManager.createSandbox();
      const sandboxOpts: SandboxOptions = {
        filesystem: {
          readPaths: sandboxConfig.allowedReadPaths,
          writePaths: sandboxConfig.allowedWritePaths,
          execPaths: [],
        },
        resources: {
          maxMemoryMb: sandboxConfig.maxMemoryMb,
          maxCpuPercent: sandboxConfig.maxCpuPercent,
          maxFileSizeMb: sandboxConfig.maxFileSizeMb,
        },
        network: {
          allowed: sandboxConfig.networkAllowed,
        },
      };
      this.taskExecutor = createTaskExecutor(
        this.validator,
        this.rateLimiter,
        this.auditChain,
        undefined,
        sandbox,
        sandboxOpts,
        this.taskStorage
      );
      this.logger.debug('Task executor initialized');

      // Step 6.5: Wire up IntegrationManager + MessageRouter + ConversationManager
      this.conversationManager = new ConversationManager();
      this.integrationManager = new IntegrationManager(this.integrationStorage, {
        logger: this.logger.child({ component: 'IntegrationManager' }),
        onMessage: async (msg) => {
          this.conversationManager!.addMessage(msg);
          await this.messageRouter!.handleInbound(msg);
        },
      });
      this.messageRouter = new MessageRouter({
        logger: this.logger.child({ component: 'MessageRouter' }),
        taskExecutor: this.taskExecutor,
        integrationManager: this.integrationManager,
        integrationStorage: this.integrationStorage,
        // multimodalManager and getActivePersonality are wired later at Step 6c
      });
      // Register platform adapters
      this.integrationManager.registerPlatform('telegram', () => new TelegramIntegration());
      this.integrationManager.registerPlatform('discord', () => new DiscordIntegration());
      this.integrationManager.registerPlatform('slack', () => new SlackIntegration());
      this.integrationManager.registerPlatform('github', () => new GitHubIntegration());
      this.integrationManager.registerPlatform('imessage', () => new IMessageIntegration());
      this.integrationManager.registerPlatform('googlechat', () => new GoogleChatIntegration());
      this.integrationManager.registerPlatform('gmail', () => new GmailIntegration());
      this.integrationManager.registerPlatform('email', () => new EmailIntegration());
      this.integrationManager.registerPlatform('cli', () => new CliIntegration());
      this.integrationManager.registerPlatform('webhook', () => new GenericWebhookIntegration());
      this.integrationManager.registerPlatform('whatsapp', () => new WhatsAppIntegration());
      this.integrationManager.registerPlatform('signal', () => new SignalIntegration());
      this.integrationManager.registerPlatform('teams', () => new TeamsIntegration());
      this.integrationManager.registerPlatform(
        'googlecalendar',
        () => new GoogleCalendarIntegration()
      );
      this.integrationManager.registerPlatform('notion', () => new NotionIntegration());
      this.integrationManager.registerPlatform('gitlab', () => new GitLabIntegration());
      this.integrationManager.registerPlatform('jira', () => new JiraIntegration());
      this.integrationManager.registerPlatform('aws', () => new AwsIntegration());
      this.integrationManager.registerPlatform('azure', () => new AzureDevOpsIntegration());
      this.integrationManager.registerPlatform('figma', () => new FigmaIntegration());
      this.integrationManager.registerPlatform('stripe', () => new StripeIntegration());
      this.integrationManager.registerPlatform('zapier', () => new ZapierIntegration());
      this.integrationManager.registerPlatform('qq', () => new QQIntegration());
      this.integrationManager.registerPlatform('dingtalk', () => new DingTalkIntegration());
      this.integrationManager.registerPlatform('line', () => new LineIntegration());
      this.integrationManager.registerPlatform('linear', () => new LinearIntegration());
      this.integrationManager.registerPlatform('airtable', () => new AirtableIntegration());
      this.integrationManager.registerPlatform('todoist', () => new TodoistIntegration());
      this.integrationManager.registerPlatform('spotify', () => new SpotifyIntegration());
      this.integrationManager.registerPlatform('youtube', () => new YouTubeIntegration());
      this.integrationManager.registerPlatform('twitter', () => new TwitterIntegration());

      // Wire up RoutingRulesManager into MessageRouter
      if (this.routingRulesStorage && this.integrationManager) {
        this.routingRulesManager = new RoutingRulesManager({
          storage: this.routingRulesStorage,
          integrationManager: this.integrationManager,
          logger: this.logger.child({ component: 'RoutingRulesManager' }),
        });
        // Inject routing rule processing into the message router
        (
          this.messageRouter as MessageRouter & {
            setRoutingRulesManager?: (m: RoutingRulesManager) => void;
          }
        ).setRoutingRulesManager?.(this.routingRulesManager);
        this.logger.debug('Routing rules manager initialized and wired to message router');
      }

      // Wire up external plugin loader (INTEGRATION_PLUGIN_DIR env var)
      const pluginDir = process.env.INTEGRATION_PLUGIN_DIR;
      if (pluginDir) {
        const pluginLoader = new PluginLoader({
          pluginDir,
          logger: this.logger.child({ component: 'PluginLoader' }),
        });
        const externalPlugins = await pluginLoader.loadAll();
        for (const plugin of externalPlugins) {
          this.integrationManager.registerPlatform(
            plugin.platform,
            plugin.factory,
            plugin.configSchema
          );
        }
        this.integrationManager.setPluginLoader(pluginLoader);
        this.logger.info(`Loaded ${externalPlugins.length} external integration plugin(s)`);
      }

      // Start auto-reconnect health checks
      this.integrationManager.startHealthChecks();

      // Wire IntegrationManager into NotificationManager for external fan-out (Phase 55)
      if (this.notificationManager) {
        this.notificationManager.setIntegrationManager(this.integrationManager);
      }

      this.logger.debug('Integration manager and message router initialized');

      // Step 6.6: Initialize heartbeat + heart system
      if (this.config.heartbeat?.enabled) {
        this.heartbeatLogStorage = new HeartbeatLogStorage();
        this.heartbeatManager = new HeartbeatManager(
          this.brainManager,
          this.auditChain,
          this.logger.child({ component: 'HeartbeatManager' }),
          this.config.heartbeat,
          this.integrationManager,
          this.heartbeatLogStorage
        );
        this.heartManager = new HeartManager(this.heartbeatManager);
        this.soulManager.setHeart(this.heartManager);
        if (this.integrationManager) {
          this.soulManager.setIntegrationManager(this.integrationManager);
        }
        // Wire notification manager so heartbeat alerts create DB records
        if (this.notificationManager) {
          this.heartbeatManager.setNotificationManager(this.notificationManager);
        }
        await this.heartbeatManager.initialize();
        this.heartbeatManager.start();
        this.logger.debug('Heart manager started', {
          intervalMs: this.config.heartbeat.intervalMs,
        });
        const hbmRef = this.heartbeatManager;
        void Promise.all([
          this.soulManager.getActivePersonality(),
          this.soulManager.listPersonalities({ limit: 200 }),
        ])
          .then(([active, allResult]) => {
            if (active?.body?.activeHours) {
              hbmRef.setPersonalitySchedule(active.body.activeHours);
            }
            if (active?.id) {
              hbmRef.setActivePersonalityId(active.id);
            }
            hbmRef.setActivePersonalityIds(
              allResult.personalities.map((p) => ({
                id: p.id,
                name: p.name,
                omnipresentMind: p.body?.omnipresentMind ?? false,
              }))
            );
          })
          .catch((err: unknown) => {
            this.logger?.warn('Failed to seed personality roster for heartbeat', {
              error: err instanceof Error ? err.message : 'Unknown error',
            });
          });
      }

      // Step 6.7: Initialize external brain sync (if configured)
      if (this.config.externalBrain?.enabled && this.config.externalBrain.path) {
        this.externalBrainSync = new ExternalBrainSync(
          this.brainManager,
          this.config.externalBrain,
          this.logger.child({ component: 'ExternalBrainSync' })
        );
        this.externalBrainSync.start();
        this.logger.debug('External brain sync initialized', {
          provider: this.config.externalBrain.provider,
          path: this.config.externalBrain.path,
        });
      }

      // Step 6.7.1: Start memory audit scheduler (Phase 118)
      if (this.memoryAuditScheduler) {
        this.memoryAuditScheduler.start();
        this.logger.debug('Memory audit scheduler started');
      }

      // Step 6.8: Initialize MCP system (if enabled)
      if (this.config.mcp?.enabled) {
        this.mcpStorage = new McpStorage();
        const mcpTokenSecret = (() => {
          try {
            return requireSecret(this.config.gateway.auth.tokenSecret);
          } catch {
            return undefined;
          }
        })();
        this.mcpClientManager = new McpClientManager(this.mcpStorage, {
          logger: this.logger.child({ component: 'McpClient' }),
          tokenSecret: mcpTokenSecret,
        });
        this.mcpServer = new McpServer({
          logger: this.logger.child({ component: 'McpServer' }),
          brainManager: this.brainManager ?? undefined,
          soulManager: this.soulManager ?? undefined,
        });
        this.logger.debug('MCP system initialized');
      }

      // Step 6.9: Initialize reporting, dashboard, workspace, experiment, marketplace
      this.reportGenerator = new AuditReportGenerator({
        logger: this.logger.child({ component: 'AuditReportGenerator' }),
        auditChain: this.auditChain,
        queryAuditLog: (opts) => this.queryAuditLog(opts),
        queryTasks: this.taskStorage ? (filter) => this.taskStorage!.listTasks(filter) : undefined,
        queryHeartbeatTasks: this.heartbeatManager
          ? () => this.heartbeatManager!.getStatus().tasks
          : undefined,
      });
      this.logger.debug('Audit report generator initialized');

      if (this.aiClient) {
        this.costOptimizer = new CostOptimizer({
          logger: this.logger.child({ component: 'CostOptimizer' }),
          usageTracker: this.aiClient.getUsageTracker(),
        });
        this.logger.debug('Cost optimizer initialized');
      }

      this.dashboardStorage = new DashboardStorage();
      this.dashboardManager = new DashboardManager(this.dashboardStorage, {
        logger: this.logger.child({ component: 'DashboardManager' }),
      });
      this.logger.debug('Dashboard manager initialized');

      this.workspaceStorage = new WorkspaceStorage();
      this.workspaceManager = new WorkspaceManager(this.workspaceStorage, {
        logger: this.logger.child({ component: 'WorkspaceManager' }),
      });
      await this.workspaceManager.ensureDefaultWorkspace();
      this.logger.debug('Workspace manager initialized');

      this.experimentStorage = new ExperimentStorage();
      this.experimentManager = new ExperimentManager(this.experimentStorage, {
        logger: this.logger.child({ component: 'ExperimentManager' }),
      });
      this.logger.debug('Experiment manager initialized');

      this.marketplaceStorage = new MarketplaceStorage();
      this.marketplaceManager = new MarketplaceManager(this.marketplaceStorage, {
        logger: this.logger.child({ component: 'MarketplaceManager' }),
        brainManager: this.brainManager ?? undefined,
        communityRepoPath: process.env.COMMUNITY_REPO_PATH ?? './community-skills',
        allowCommunityGitFetch: this.config.security.allowCommunityGitFetch,
        communityGitUrl:
          this.config.security.communityGitUrl ??
          process.env.COMMUNITY_GIT_URL ??
          'https://github.com/MacCracken/secureyeoman-community-skills',
      });
      await this.marketplaceManager.seedBuiltinSkills();
      // Wire marketplace into soul so skill deletion keeps installed state in sync
      if (this.soulManager) {
        this.soulManager.setMarketplaceManager(this.marketplaceManager);
      }
      this.logger.debug('Marketplace manager initialized');

      // Step 6.10a: Initialize reasoning strategy storage
      {
        this.strategyStorage = new StrategyStorage();
        await this.strategyStorage.seedBuiltinStrategies();
        if (this.soulManager) {
          this.soulManager.setStrategyStorage(this.strategyStorage);
        }
        this.logger.debug('Strategy storage initialized');
      }

      // Step 6.10: Initialize conversation storage
      this.chatConversationStorage = new ConversationStorage();
      this.logger.debug('Conversation storage initialized');

      // Step 6.10b: Initialize branching manager
      try {
        const pool = this.getPool();
        if (pool) {
          this.branchingManager = new BranchingManager({
            conversationStorage: this.chatConversationStorage,
            pool,
            logger: this.logger.child({ component: 'BranchingManager' }),
            aiClient: this.aiClient ?? undefined,
          });
          this.logger.debug('Branching manager initialized');
        } else {
          this.logger.debug('Branching manager skipped — no database pool');
        }
      } catch (err) {
        this.logger.warn('Branching manager init failed (non-fatal)', {
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // Step 6.11: Initialize sub-agent delegation.
      // Boot the delegation chain when any of three conditions are true:
      //   1. config.delegation.enabled is set in the YAML/env config, OR
      //   2. The persisted security policy (loaded from DB at Step 2.2) has
      //      allowSubAgents, allowSwarms, or allowWorkflows enabled — meaning
      //      the operator turned these on via Security Settings and expects
      //      the infrastructure to be running.
      const delegationNeeded =
        this.config.delegation?.enabled ||
        this.config.security?.allowSubAgents ||
        this.config.security?.allowSwarms ||
        this.config.security?.allowWorkflows;
      if (delegationNeeded) {
        await this.bootDelegationChain();
      }

      // Step 6.11b: Always seed workflow/swarm templates and wire marketplace
      // managers so the marketplace shows templates even before delegation is
      // explicitly enabled.  bootDelegationChain() already creates these
      // storage objects — this block only runs when it was skipped.
      try {
        if (!this.workflowStorage) {
          this.workflowStorage = new WorkflowStorage();
        }
        const { BUILTIN_WORKFLOW_TEMPLATES } = await import('./workflow/workflow-templates.js');
        await this.workflowStorage.seedBuiltinWorkflows(BUILTIN_WORKFLOW_TEMPLATES);

        if (!this.swarmStorage) {
          this.swarmStorage = new SwarmStorage();
        }
        await this.swarmStorage.seedBuiltinTemplates();

        // Wire managers into marketplace for community sync (if they exist)
        if (
          this.marketplaceManager &&
          (this.workflowManager || this.swarmManager || this.soulManager)
        ) {
          this.marketplaceManager.setDelegationManagers({
            workflowManager: this.workflowManager ?? undefined,
            swarmManager: this.swarmManager ?? undefined,
            soulManager: this.soulManager ?? undefined,
          });
        }

        this.logger.debug('Workflow/swarm templates seeded');
      } catch (seedErr) {
        this.logger.warn('Template seeding failed (non-fatal)', {
          error: seedErr instanceof Error ? seedErr.message : 'Unknown error',
        });
      }

      // Step 6.12: Initialize extension hooks (if enabled)
      if (this.config.extensions?.enabled) {
        try {
          this.extensionStorage = new ExtensionStorage();
          this.extensionManager = new ExtensionManager(this.config.extensions, {
            storage: this.extensionStorage,
            logger: this.logger.child({ component: 'ExtensionManager' }),
            auditChain: this.auditChain,
          });
          await this.extensionManager.initialize();
          this.logger.debug('Extension manager initialized');
        } catch (error) {
          this.logger.warn('Extension manager initialization failed (non-fatal)', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Step 6.13: Initialize code execution (if enabled)
      if (this.config.execution?.enabled) {
        try {
          this.executionStorage = new ExecutionStorage();
          this.executionManager = new CodeExecutionManager(this.config.execution, {
            storage: this.executionStorage,
            logger: this.logger.child({ component: 'CodeExecutionManager' }),
            auditChain: this.auditChain,
          });
          await this.executionManager.initialize();
          this.logger.debug('Code execution manager initialized');
        } catch (error) {
          this.logger.warn('Code execution manager initialization failed (non-fatal)', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Step 6.14: Initialize A2A protocol (if enabled)
      if (this.config.a2a?.enabled) {
        try {
          this.a2aStorage = new A2AStorage();
          const transport = new RemoteDelegationTransport({
            logger: this.logger.child({ component: 'A2ATransport' }),
          });
          this.a2aManager = new A2AManager(this.config.a2a, {
            storage: this.a2aStorage,
            transport,
            logger: this.logger.child({ component: 'A2AManager' }),
            auditChain: this.auditChain,
          });
          await this.a2aManager.initialize();
          this.logger.debug('A2A manager initialized');
        } catch (error) {
          this.logger.warn('A2A manager initialization failed (non-fatal)', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Step 6.15: Initialize dynamic tool manager (if enabled by security policy)
      // The manager is started when allowDynamicTools is true at startup so that
      // tools persisted from a previous session are immediately available.
      if (this.config.security.allowDynamicTools) {
        try {
          this.dynamicToolStorage = new DynamicToolStorage();
          await this.dynamicToolStorage.ensureTables();
          this.dynamicToolManager = new DynamicToolManager(
            this.dynamicToolStorage,
            // Pass a live reference to the security config object so that runtime
            // policy changes (e.g. toggling sandboxDynamicTools via the UI) are
            // picked up immediately without requiring a restart.
            this.config.security,
            {
              logger: this.logger.child({ component: 'DynamicToolManager' }),
              auditChain: this.auditChain ?? undefined,
              sandboxManager: this.sandboxManager ?? undefined,
            }
          );
          await this.dynamicToolManager.initialize();
          // Wire schemas into the soul manager so registered dynamic tools are
          // injected into the AI context alongside skill and creation tools.
          if (this.soulManager) {
            this.soulManager.setDynamicToolManager(this.dynamicToolManager);
          }
          this.logger.debug('Dynamic tool manager initialized', {
            sandboxed: this.config.security.sandboxDynamicTools ?? true,
          });
        } catch (error) {
          this.logger.warn('Dynamic tool manager initialization failed (non-fatal)', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Step 6b: Initialize Proactive Manager
      if (this.config.security.allowProactive || this.config.proactive?.enabled) {
        try {
          const { ProactiveStorage } = await import('./proactive/storage.js');
          const { ProactiveManager } = await import('./proactive/manager.js');
          const { PatternLearner } = await import('./proactive/pattern-learner.js');
          const proactiveStorage = new ProactiveStorage();
          const patternLearner = new PatternLearner(
            this.brainManager,
            this.logger.child({ component: 'PatternLearner' })
          );
          this.proactiveManager = new ProactiveManager(
            proactiveStorage,
            {
              logger: this.logger.child({ component: 'ProactiveManager' }),
              brainManager: this.brainManager,
              integrationManager: this.integrationManager ?? undefined,
            },
            this.config.proactive ?? {},
            patternLearner
          );
          await this.proactiveManager.initialize();
          this.logger.debug('Proactive manager initialized');
        } catch (error) {
          this.logger.warn('Proactive manager initialization failed (non-fatal)', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Step 6c: Initialize Multimodal Manager
      if (this.config.security.allowMultimodal || this.config.multimodal?.enabled) {
        try {
          const { MultimodalStorage } = await import('./multimodal/storage.js');
          const { MultimodalManager } = await import('./multimodal/manager.js');
          const multimodalStorage = new MultimodalStorage();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const mmDeps: any = {
            logger: this.logger.child({ component: 'MultimodalManager' }),
            aiClient: this.aiClient!,
            extensionManager: this.extensionManager ?? undefined,
          };
          this.multimodalManager = new MultimodalManager(
            multimodalStorage,
            mmDeps,
            this.config.multimodal ?? {}
          );
          await this.multimodalManager.initialize();
          // Wire multimodal into IntegrationManager (created earlier at Step 6.5)
          // Wrap methods to adapt strict Zod-inferred types to the loose IntegrationDeps interface
          if (this.integrationManager) {
            const mmRef = this.multimodalManager;
            this.integrationManager.setMultimodalManager({
              analyzeImage: (req) =>
                mmRef.analyzeImage(req as Parameters<typeof mmRef.analyzeImage>[0]),
              transcribeAudio: (req) =>
                mmRef.transcribeAudio(req as Parameters<typeof mmRef.transcribeAudio>[0]),
              synthesizeSpeech: (req) =>
                mmRef.synthesizeSpeech(req as Parameters<typeof mmRef.synthesizeSpeech>[0]),
            });
          }
          // Wire multimodal + personality into MessageRouter for TTS on outbound
          if (this.messageRouter) {
            const mmRef = this.multimodalManager;
            const soul = this.soulManager;
            this.messageRouter.setMultimodalDeps({
              multimodalManager: {
                synthesizeSpeech: (req) =>
                  mmRef.synthesizeSpeech(req as Parameters<typeof mmRef.synthesizeSpeech>[0]),
              },
              getActivePersonality: soul
                ? async () => {
                    const p = await soul.getActivePersonality();
                    return p
                      ? {
                          voice: p.voice,
                          selectedIntegrations: p.body?.selectedIntegrations ?? [],
                        }
                      : null;
                  }
                : undefined,
            });
          }
          this.logger.debug('Multimodal manager initialized');
        } catch (error) {
          this.logger.warn('Multimodal manager initialization failed (non-fatal)', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Step 6d: Initialize Browser Session Storage (for browser automation tracking)
      {
        let browserEnabled = false;
        if (this.mcpStorage) {
          try {
            const mcpCfg = await this.mcpStorage.getConfig();
            browserEnabled = mcpCfg.exposeBrowser;
          } catch {
            // ignore — default to false
          }
        }
        if (browserEnabled) {
          try {
            const { BrowserSessionStorage } = await import('./browser/storage.js');
            this.browserSessionStorage = new BrowserSessionStorage();
            await this.browserSessionStorage.ensureTables();
            this.logger.debug('Browser session storage initialized');
          } catch (error) {
            this.logger.warn('Browser session storage initialization failed (non-fatal)', {
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }
      }

      // Step 6e: Initialize RiskAssessmentManager (uses pool from Step 2.1)
      if (this.riskAssessmentStorage) {
        try {
          const pool = getPool();
          this.riskAssessmentManager = new RiskAssessmentManager({
            storage: this.riskAssessmentStorage,
            pool,
            auditChain: this.auditChain,
            tlsManager: this.tlsManager,
            getDepartmentRiskManager: () => this.departmentRiskManager,
          });
          this.logger.debug('RiskAssessmentManager initialized');

          // Schedule a daily automated assessment
          const MS_PER_DAY = 24 * 60 * 60 * 1000;
          this.riskScheduleTimer = setInterval(() => {
            void this.riskAssessmentManager!.runAssessment({
              name: `Scheduled ${new Date().toISOString()}`,
              assessmentTypes: ['security', 'autonomy', 'governance', 'infrastructure', 'external'],
              windowDays: 7,
            }).catch(() => {
              // non-fatal — logged by manager
            });
          }, MS_PER_DAY);
        } catch (error) {
          this.logger.warn('RiskAssessmentManager initialization failed (non-fatal)', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Step 6e.2: Initialize DepartmentRiskManager (Phase 111)
      if (this.departmentRiskStorage) {
        try {
          const pool = getPool();
          this.departmentRiskManager = new DepartmentRiskManager({
            storage: this.departmentRiskStorage,
            pool,
            auditChain: this.auditChain,
            getAlertManager: () => this.alertManager,
          });
          this.logger.debug('DepartmentRiskManager initialized');
        } catch (error) {
          this.logger.warn('DepartmentRiskManager initialization failed (non-fatal)', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Step 6e.2b: Initialize ProviderAccountManager (Phase 112)
      if (this.providerAccountStorage && this.secretsManager) {
        try {
          this.providerAccountManager = new ProviderAccountManager({
            storage: this.providerAccountStorage,
            secretsManager: this.secretsManager,
            validator: new ProviderKeyValidator(),
            auditChain: this.auditChain ?? undefined,
            getAlertManager: () => this.alertManager,
          });
          // Import API keys from environment variables (fire-and-forget)
          this.providerAccountManager.importFromEnv().catch((err) => {
            this.logger?.warn('Provider account env import failed (non-fatal)', {
              error: err instanceof Error ? err.message : String(err),
            });
          });
          this.logger.debug('ProviderAccountManager initialized');
        } catch (error) {
          this.logger.warn('ProviderAccountManager initialization failed (non-fatal)', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Step 6e.3: Initialize AthiManager (Phase 107-F)
      if (this.athiStorage) {
        try {
          const pool = getPool();
          this.athiManager = new AthiManager({
            storage: this.athiStorage,
            pool,
            auditChain: this.auditChain,
            getAlertManager: () => this.alertManager,
          });
          this.logger.debug('AthiManager initialized');
        } catch (error) {
          this.logger.warn('AthiManager initialization failed (non-fatal)', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Step 6f: Initialize BackupManager (Phase 61)
      {
        this.backupStorage = new BackupStorage();
        const dbCfg = this.config.core.database;
        this.backupManager = new BackupManager({
          storage: this.backupStorage,
          dataDir: this.config.core.dataDir,
          dbConfig: {
            host: dbCfg.host,
            port: dbCfg.port,
            user: dbCfg.user,
            password: process.env[dbCfg.passwordEnv] ?? undefined,
            database: dbCfg.database,
          },
          logger: this.logger.child({ component: 'BackupManager' }),
        });
        this.logger.debug('BackupManager initialized');
      }

      // Step 6g: Initialize TenantManager (Phase 61)
      {
        this.tenantStorage = new TenantStorage();
        this.tenantManager = new TenantManager(this.tenantStorage, this.auditChain);
        this.logger.debug('TenantManager initialized');
      }

      // Step 6h: Initialize DistillationManager (Phase 64)
      {
        const pool = getPool();
        this.distillationManager = new DistillationManager(
          pool,
          this.logger.child({ component: 'DistillationManager' }),
          () => this.alertManager
        );
        this.logger.debug('DistillationManager initialized');
      }

      // Step 6i: Initialize FinetuneManager (Phase 64)
      {
        const pool = getPool();
        this.finetuneManager = new FinetuneManager(
          pool,
          this.logger.child({ component: 'FinetuneManager' }),
          undefined,
          undefined,
          () => this.alertManager
        );
        this.logger.debug('FinetuneManager initialized');
      }

      // Step 6j: Initialize ML Pipeline managers (Phase 73)
      {
        const pool = getPool();
        const convStorage = this.chatConversationStorage;
        if (convStorage) {
          this.dataCurationManager = new DataCurationManager(
            convStorage,
            this.logger.child({ component: 'DataCurationManager' })
          );
          this.logger.debug('DataCurationManager initialized');
        }
        this.evaluationManager = new EvaluationManager(
          this.logger.child({ component: 'EvaluationManager' }),
          () => this.alertManager
        );
        this.logger.debug('EvaluationManager initialized');
        this.pipelineApprovalManager = new PipelineApprovalManager(
          pool,
          this.logger.child({ component: 'PipelineApprovalManager' })
        );
        this.pipelineLineageStorage = new PipelineLineageStorage(
          pool,
          this.logger.child({ component: 'PipelineLineageStorage' })
        );
        this.conversationQualityScorer = new ConversationQualityScorer(
          pool,
          this.logger.child({ component: 'ConversationQualityScorer' })
        );
        this.computerUseManager = new ComputerUseManager(
          pool,
          this.logger.child({ component: 'ComputerUseManager' })
        );
        this.conversationQualityScorer.start();
        this.logger.debug('ML Pipeline managers initialized');

        // Phase 108: Capture audit logger + desktop training bridge
        this.captureAuditLogger = new CaptureAuditLogger({
          signingKey: requireSecret(this.config.gateway.auth.tokenSecret),
        });
        await this.captureAuditLogger.initialize();
        this.desktopTrainingBridge = new DesktopTrainingBridge({
          getComputerUseManager: () => this.computerUseManager,
        });
        this.logger.debug('Capture audit logger and desktop training bridge initialized');
      }

      // Step 6j-2: Initialize LlmJudgeManager (Phase 97)
      {
        const pool = getPool();
        this.llmJudgeManager = new LlmJudgeManager({
          pool,
          logger: this.logger.child({ component: 'LlmJudgeManager' }),
          aiClient: this.aiClient!,
          notificationManager: this.notificationManager ?? undefined,
        });
        this.logger.debug('LlmJudgeManager initialized');
      }

      // Step 6j-3: Initialize Lifecycle Platform managers (Phase 98)
      {
        const pool = getPool();
        this.preferenceManager = new PreferenceManager({
          pool,
          logger: this.logger.child({ component: 'PreferenceManager' }),
        });
        this.datasetCuratorManager = new DatasetCuratorManager({
          pool,
          logger: this.logger.child({ component: 'DatasetCuratorManager' }),
        });
        this.experimentRegistryManager = new ExperimentRegistryManager({
          pool,
          logger: this.logger.child({ component: 'ExperimentRegistryManager' }),
        });
        this.modelVersionManager = new ModelVersionManager({
          pool,
          logger: this.logger.child({ component: 'ModelVersionManager' }),
          soulStorage: this.soulStorage,
        });
        this.abTestManager = new AbTestManager({
          pool,
          logger: this.logger.child({ component: 'AbTestManager' }),
        });
        this.logger.debug('Lifecycle Platform managers initialized');
      }

      // Step 6k: Initialize FederationManager (Phase 79)
      {
        this.federationStorage = new FederationStorage();
        const masterSecret = requireSecret(this.config.gateway.auth.tokenSecret);
        this.federationManager = new FederationManager({
          storage: this.federationStorage,
          masterSecret,
          logger: this.logger.child({ component: 'FederationManager' }),
          brainManager: this.brainManager ?? undefined,
          marketplaceManager: (this.marketplaceManager as any) ?? undefined,
          soulManager: this.soulManager ?? undefined,
        });
        this.federationManager.startHealthCycle();
        this.logger.debug('FederationManager initialized');
      }

      // Step 6l: Initialize AlertManager (Phase 83)
      {
        this.alertStorage = new AlertStorage();
        this.alertManager = new AlertManager(
          this.alertStorage,
          this.notificationManager,
          this.logger.child({ component: 'AlertManager' })
        );
        this.logger.debug('AlertManager initialized');
      }

      // Step 6m: Initialize Conversation Analytics (Phase 96)
      {
        const pool = getPool();
        this.analyticsStorage = new AnalyticsStorage(pool);
        this.engagementMetricsService = new EngagementMetricsService(pool);
        this.usageAnomalyDetector = new UsageAnomalyDetector(
          this.analyticsStorage,
          this.logger.child({ component: 'UsageAnomalyDetector' })
        );
        if (this.aiClient) {
          this.sentimentAnalyzer = new SentimentAnalyzer(
            pool,
            this.aiClient,
            this.analyticsStorage,
            this.logger.child({ component: 'SentimentAnalyzer' })
          );
          this.conversationSummarizer = new ConversationSummarizer(
            pool,
            this.aiClient,
            this.analyticsStorage,
            this.logger.child({ component: 'ConversationSummarizer' })
          );
          this.entityExtractor = new EntityExtractor(
            pool,
            this.aiClient,
            this.analyticsStorage,
            this.logger.child({ component: 'EntityExtractor' })
          );
          this.sentimentAnalyzer.start();
          this.conversationSummarizer.start();
          this.entityExtractor.start();
        }
        this.logger.debug('Conversation Analytics initialized');
      }

      // Step 7: Record initialization in audit log
      await this.auditChain.record({
        event: 'system_initialized',
        level: 'info',
        message: 'SecureYeoman initialized successfully',
        metadata: {
          environment: this.config.core.environment,
          version: this.config.version,
        },
      });

      this.initialized = true;
      this.startedAt = Date.now();

      // Step 8: Start gateway if enabled
      if (this.options.enableGateway) {
        await this.startGateway();
      }

      this.logger.info('SecureYeoman initialized successfully', {
        environment: this.config.core.environment,
        gatewayEnabled: this.options.enableGateway ?? false,
      });
    } catch (error) {
      // Log initialization failure if logger is available
      if (this.logger) {
        this.logger.fatal('SecureYeoman initialization failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      // Clean up any partially initialized components
      await this.cleanup();

      throw error;
    }
  }

  /**
   * Check if SecureYeoman is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get current state
   */
  getState(): SecureYeomanState {
    return {
      initialized: this.initialized,
      healthy: this.isHealthy(),
      startedAt: this.startedAt ?? undefined,
      config: this.config ?? loadConfig(this.options.config),
    };
  }

  /**
   * Check if all components are healthy
   */
  isHealthy(): boolean {
    if (!this.initialized) {
      return false;
    }

    // Add more health checks as needed
    return true;
  }

  /**
   * Register a task handler
   */
  registerTaskHandler(handler: TaskHandler): void {
    this.ensureInitialized();
    this.taskExecutor!.registerHandler(handler);
  }

  /**
   * Submit a task for execution
   */
  async submitTask(create: TaskCreate, context: ExecutionContext): Promise<Task> {
    this.ensureInitialized();
    return this.taskExecutor!.submit(create, context);
  }

  /**
   * Cancel a running task
   */
  async cancelTask(taskId: string, context: ExecutionContext): Promise<boolean> {
    this.ensureInitialized();
    return this.taskExecutor!.cancel(taskId, context);
  }

  /**
   * Get current metrics snapshot
   */
  async getMetrics(): Promise<Partial<MetricsSnapshot>> {
    this.ensureInitialized();

    // Gather statistics from each subsystem to build a comprehensive
    // metrics snapshot. Each subsystem exposes its own getStats() method
    // that returns monotonically increasing counters and point-in-time
    // gauges. We merge them into the unified MetricsSnapshot shape that
    // the dashboard consumes via REST and WebSocket.
    const auditStats = await this.auditChain!.getStats();
    const rateLimitStats = this.rateLimiter!.getStats();
    const aiStats = this.aiClient?.getUsageStats();
    const taskStats = await this.taskStorage?.getStats();
    const authStats = this.authService?.getStats() ?? {
      authAttemptsTotal: 0,
      authSuccessTotal: 0,
      authFailuresTotal: 0,
    };

    const { getCurrentTraceId } = await import('./telemetry/otel.js');

    return {
      timestamp: Date.now(),
      traceId: getCurrentTraceId() ?? undefined,
      tasks: {
        total: taskStats?.total ?? 0,
        tasksToday: taskStats?.tasksToday ?? 0,
        byStatus: taskStats?.byStatus ?? {},
        byType: taskStats?.byType ?? {},
        successRate: taskStats?.successRate ?? 0,
        failureRate: taskStats ? 1 - taskStats.successRate : 0,
        avgDurationMs: taskStats?.avgDurationMs ?? 0,
        minDurationMs: 0,
        maxDurationMs: 0,
        p50DurationMs: 0,
        p95DurationMs: 0,
        p99DurationMs: 0,
        queueDepth: this.taskExecutor!.getQueueDepth(),
        inProgress: this.taskExecutor!.getActiveCount(),
      },
      resources: {
        // process.cpuUsage() measures only THIS process's CPU time (user + system),
        // not system-wide CPU. The delta form process.cpuUsage(previous) returns
        // microseconds consumed since the previous sample.
        cpuPercent: (() => {
          const now = Date.now();
          const elapsedMs = now - this._lastCpuSampleAt;
          // delta: µs of CPU time this process used since last sample
          const delta = process.cpuUsage(this._lastCpuUsage);
          this._lastCpuUsage = process.cpuUsage();
          this._lastCpuSampleAt = now;
          if (elapsedMs <= 0) return 0;
          // (µs → ms) / elapsed ms → fraction → percent
          return Math.min(100, Math.max(0, ((delta.user + delta.system) / 1000 / elapsedMs) * 100));
        })(),
        memoryUsedMb: process.memoryUsage().heapUsed / 1024 / 1024,
        memoryLimitMb: 0,
        memoryPercent: 0,
        diskUsedMb: 0,
        inputTokensToday: aiStats?.inputTokensToday ?? 0,
        outputTokensToday: aiStats?.outputTokensToday ?? 0,
        tokensUsedToday: aiStats?.tokensUsedToday ?? 0,
        tokensCachedToday: aiStats?.tokensCachedToday ?? 0,
        costUsdToday: aiStats?.costUsdToday ?? 0,
        costUsdMonth: aiStats?.costUsdMonth ?? 0,
        apiCallsTotal: aiStats?.apiCallsTotal ?? 0,
        apiErrorsTotal: aiStats?.apiErrorsTotal ?? 0,
        apiLatencyAvgMs:
          aiStats && aiStats.apiCallCount > 0
            ? aiStats.apiLatencyTotalMs / aiStats.apiCallCount
            : 0,
      },
      security: {
        authAttemptsTotal: authStats.authAttemptsTotal,
        authSuccessTotal: authStats.authSuccessTotal,
        authFailuresTotal: authStats.authFailuresTotal,
        activeSessions: 0,
        permissionChecksTotal: 0,
        permissionDenialsTotal: 0,
        // blockedRequestsTotal now reflects actual rate-limiter rejections
        // rather than a hardcoded zero. The totalHits counter in the rate
        // limiter is monotonically increasing and survives cleanup cycles.
        blockedRequestsTotal: rateLimitStats.totalHits,
        // rateLimitHitsTotal mirrors blockedRequestsTotal for backwards
        // compatibility — both draw from the same underlying counter.
        rateLimitHitsTotal: rateLimitStats.totalHits,
        injectionAttemptsTotal: 0,
        eventsBySeverity: {},
        eventsByType: {},
        auditEntriesTotal: auditStats.entriesCount,
        auditChainValid: auditStats.chainValid,
        lastAuditVerification: auditStats.lastVerification,
      },
      // Sandbox scanning metrics (Phase 116) — non-fatal; omitted when unavailable
      ...(this.scanHistoryStore
        ? await (async () => {
            try {
              const stats = await this.scanHistoryStore!.getStats();
              return {
                sandbox: {
                  scanning: {
                    totalScans: stats.total,
                    quarantineCount: stats.byVerdict?.quarantine ?? 0,
                    blockCount: stats.byVerdict?.block ?? 0,
                    criticalFindings: stats.bySeverity?.critical ?? 0,
                    maxIntentScore: 0,
                    failureRate: 0,
                    escalations: 0,
                  },
                },
              };
            } catch {
              return {};
            }
          })()
        : {}),
      // Departmental risk metrics (Phase 111) — non-fatal; omitted when unavailable
      ...(this.departmentRiskManager
        ? await (async () => {
            try {
              const summary = await this.departmentRiskManager!.getExecutiveSummary();
              return {
                departmentalRisk: {
                  departmentCount: summary.totalDepartments,
                  openRegisterEntries: summary.totalOpenRisks,
                  overdueEntries: summary.totalOverdueRisks,
                  appetiteBreaches: summary.appetiteBreaches,
                },
              };
            } catch {
              return {};
            }
          })()
        : {}),
    };
  }

  /**
   * Get detailed AI usage statistics including per-provider breakdown.
   */
  getAiUsageStats() {
    return this.aiClient?.getUsageStats();
  }

  /**
   * Reset a usage stat counter to zero (persisted to DB via usage_resets table).
   * Supported stats: 'errors' | 'latency'
   */
  async resetUsageStat(stat: 'errors' | 'latency'): Promise<void> {
    this.ensureInitialized();
    const tracker = this.aiClient?.getUsageTracker();
    if (!tracker) throw new Error('Usage tracker not available');
    if (stat === 'errors') {
      await tracker.resetErrors();
    } else {
      await tracker.resetLatency();
    }
  }

  /**
   * Query audit log entries
   */
  async queryAuditLog(options: AuditQueryOptions = {}): Promise<AuditQueryResult> {
    this.ensureInitialized();
    if (
      !this.auditStorage ||
      !('queryEntries' in this.auditStorage) ||
      typeof (this.auditStorage as Record<string, unknown>).queryEntries !== 'function'
    ) {
      throw new Error('Audit storage does not support querying');
    }
    return (
      this.auditStorage as { queryEntries(opts: AuditQueryOptions): Promise<AuditQueryResult> }
    ).queryEntries(options);
  }

  /**
   * Verify audit chain integrity
   */
  async verifyAuditChain(): Promise<{ valid: boolean; entriesChecked: number; error?: string }> {
    this.ensureInitialized();
    return this.auditChain!.verify();
  }

  /**
   * Get the logger instance
   */
  getLogger(): SecureLogger {
    this.ensureInitialized();
    return this.logger!;
  }

  /**
   * Get the RBAC instance
   */
  getRBAC(): RBAC {
    this.ensureInitialized();
    return this.rbac!;
  }

  /**
   * Get the audit chain instance
   */
  getAuditChain(): AuditChain {
    this.ensureInitialized();
    return this.auditChain!;
  }

  /**
   * Get audit statistics
   */
  async getAuditStats(): Promise<{
    totalEntries: number;
    chainValid: boolean;
    lastVerification?: number;
    oldestEntry?: number;
    dbSizeEstimateMb?: number;
    chainError?: string;
    chainBrokenAt?: string;
  }> {
    this.ensureInitialized();
    const stats = await this.auditChain!.getStats();

    let dbSizeEstimateMb: number | undefined;
    let oldestEntry: number | undefined;
    try {
      const pool = getPool();
      const [sizeResult, oldestResult] = await Promise.all([
        pool.query<{ size: string }>('SELECT pg_database_size(current_database()) AS size'),
        pool.query<{ timestamp: number }>(
          'SELECT timestamp FROM audit.entries ORDER BY timestamp ASC LIMIT 1'
        ),
      ]);
      const bytes = parseInt(sizeResult.rows[0]?.size ?? '0', 10);
      dbSizeEstimateMb = bytes / (1024 * 1024);
      oldestEntry = oldestResult.rows[0]?.timestamp;
    } catch {
      // Pool may not be available (e.g. SQLite-only mode)
    }

    return {
      totalEntries: stats.entriesCount,
      chainValid: stats.chainValid,
      lastVerification: stats.lastVerification,
      chainError: stats.chainError,
      chainBrokenAt: stats.chainBrokenAt,
      oldestEntry,
      dbSizeEstimateMb,
    };
  }

  /**
   * Re-sign the entire audit chain using the current signing key and the
   * deep-sorted hash function.  Entries that are already valid are skipped.
   */
  async repairAuditChain(): Promise<{ repairedCount: number; entriesTotal: number }> {
    this.ensureInitialized();
    return this.auditChain!.repair();
  }

  /**
   * Enforce retention policy, deleting entries beyond the given limits.
   * Returns the number of deleted entries.
   */
  async enforceAuditRetention(opts: { maxAgeDays?: number; maxEntries?: number }): Promise<number> {
    this.ensureInitialized();
    if (this.auditStorage && this.auditStorage instanceof SQLiteAuditStorage) {
      return await this.auditStorage.enforceRetention(opts);
    }
    return 0;
  }

  /**
   * Export audit entries as a JSON array for backup.
   */
  async exportAuditLog(opts?: {
    from?: number;
    to?: number;
    limit?: number;
  }): Promise<AuditEntry[]> {
    this.ensureInitialized();
    const result = await this.queryAuditLog({
      from: opts?.from,
      to: opts?.to,
      limit: opts?.limit ?? 100_000,
      offset: 0,
      order: 'asc' as const,
    });
    return result.entries;
  }

  /**
   * Get the input validator instance
   */
  getValidator(): InputValidator {
    this.ensureInitialized();
    return this.validator!;
  }

  /**
   * Get the rate limiter instance
   */
  getRateLimiter(): RateLimiterLike {
    this.ensureInitialized();
    return this.rateLimiter!;
  }

  /**
   * Get the SecretsManager instance (unified secret storage facade)
   */
  getSecretsManager(): SecretsManager | null {
    return this.secretsManager;
  }

  /**
   * Get the TlsManager instance (certificate lifecycle manager)
   */
  getTlsManager(): TlsManager | null {
    return this.tlsManager;
  }

  /**
   * Get the SecretRotationManager instance (may be null if rotation is disabled)
   */
  getRotationManager(): SecretRotationManager | null {
    return this.rotationManager;
  }

  /**
   * Get the KeyringManager instance
   */
  getKeyringManager(): KeyringManager | null {
    return this.keyringManager;
  }

  /**
   * Get the auth service instance
   */
  getAuthService(): AuthService {
    this.ensureInitialized();
    if (!this.authService) {
      throw new Error('Auth service is not available');
    }
    return this.authService;
  }

  /**
   * Get the usage storage instance (may return null if AI client failed to init)
   */
  getUsageStorage(): UsageStorage | null {
    return this.usageStorage;
  }

  /**
   * Get the AI client instance
   */
  getAIClient(): AIClient {
    this.ensureInitialized();
    if (!this.aiClient) {
      throw new Error('AI client is not available. Check provider configuration and API keys.');
    }
    return this.aiClient;
  }

  /**
   * Get the brain manager instance
   */
  getBrainManager(): BrainManager {
    this.ensureInitialized();
    if (!this.brainManager) {
      throw new Error('Brain manager is not available');
    }
    return this.brainManager;
  }

  /**
   * Get the document manager instance
   */
  getDocumentManager(): DocumentManager {
    this.ensureInitialized();
    if (!this.documentManager) {
      throw new Error('Document manager is not available');
    }
    return this.documentManager;
  }

  getBrainStorage(): BrainStorage | null {
    return this.brainStorage;
  }

  getMemoryAuditScheduler(): import('./brain/audit/scheduler.js').MemoryAuditScheduler | null {
    return this.memoryAuditScheduler;
  }

  getMemoryAuditStorage(): import('./brain/audit/audit-store.js').MemoryAuditStorage | null {
    return this.memoryAuditStorage;
  }

  /**
   * Get the spirit manager instance
   */
  getSpiritManager(): SpiritManager {
    this.ensureInitialized();
    if (!this.spiritManager) {
      throw new Error('Spirit manager is not available');
    }
    return this.spiritManager;
  }

  /**
   * Get the data directory path (e.g. ~/.secureyeoman or $SECUREYEOMAN_DATA_DIR)
   */
  getDataDir(): string {
    this.ensureInitialized();
    return this.config!.core.dataDir;
  }

  /**
   * Get the soul manager instance
   */
  getSoulManager(): SoulManager {
    this.ensureInitialized();
    if (!this.soulManager) {
      throw new Error('Soul manager is not available');
    }
    return this.soulManager;
  }

  /**
   * Get the approval manager instance (human-in-the-loop queue)
   */
  getApprovalManager(): ApprovalManager {
    this.ensureInitialized();
    if (!this.approvalManager) {
      throw new Error('Approval manager is not available');
    }
    return this.approvalManager;
  }

  /**
   * Get the agent comms instance (may be null if comms is disabled)
   */
  getAgentComms(): AgentComms | null {
    this.ensureInitialized();
    return this.agentComms;
  }

  /**
   * Get the sandbox manager instance
   */
  getSandboxManager(): SandboxManager {
    this.ensureInitialized();
    if (!this.sandboxManager) {
      throw new Error('Sandbox manager is not available');
    }
    return this.sandboxManager;
  }

  /**
   * Get the task storage instance
   */
  getTaskStorage(): TaskStorage {
    this.ensureInitialized();
    if (!this.taskStorage) {
      throw new Error('Task storage is not available');
    }
    return this.taskStorage;
  }

  /**
   * Get the task executor instance
   */
  getTaskExecutor(): TaskExecutor | null {
    return this.taskExecutor;
  }

  /**
   * Get the integration manager instance
   */
  getIntegrationManager(): IntegrationManager {
    this.ensureInitialized();
    if (!this.integrationManager) {
      throw new Error('Integration manager is not available');
    }
    return this.integrationManager;
  }

  /**
   * Get the heartbeat manager instance (may be null if heartbeat is disabled)
   */
  getHeartbeatManager(): HeartbeatManager | null {
    this.ensureInitialized();
    return this.heartbeatManager;
  }

  /**
   * Get the heartbeat log storage instance (may be null if heartbeat is disabled)
   */
  getHeartbeatLogStorage(): HeartbeatLogStorage | null {
    this.ensureInitialized();
    return this.heartbeatLogStorage;
  }

  /**
   * Get the external brain sync instance (may be null if not configured)
   */
  getExternalBrainSync(): ExternalBrainSync | null {
    this.ensureInitialized();
    return this.externalBrainSync;
  }

  /**
   * Get the MCP storage instance
   */
  getMcpStorage(): McpStorage | null {
    this.ensureInitialized();
    return this.mcpStorage;
  }

  /**
   * Get the MCP client manager instance
   */
  getMcpClientManager(): McpClientManager | null {
    this.ensureInitialized();
    return this.mcpClientManager;
  }

  /**
   * Get the MCP server instance
   */
  getMcpServer(): McpServer | null {
    this.ensureInitialized();
    return this.mcpServer;
  }

  /**
   * Get the audit report generator instance
   */
  getReportGenerator(): AuditReportGenerator | null {
    this.ensureInitialized();
    return this.reportGenerator;
  }

  /**
   * Get the cost optimizer instance
   */
  getCostOptimizer(): CostOptimizer | null {
    this.ensureInitialized();
    return this.costOptimizer;
  }

  /**
   * Get the cost calculator instance (from the active AI client).
   */
  getCostCalculator() {
    this.ensureInitialized();
    return this.aiClient?.getCostCalculator() ?? null;
  }

  /**
   * Get the dashboard manager instance
   */
  getDashboardManager(): DashboardManager | null {
    this.ensureInitialized();
    return this.dashboardManager;
  }

  /**
   * Get the workspace manager instance
   */
  getWorkspaceManager(): WorkspaceManager | null {
    this.ensureInitialized();
    return this.workspaceManager;
  }

  getSsoStorage(): SsoStorage | null {
    this.ensureInitialized();
    return this.ssoStorage;
  }

  getSsoManager(): SsoManager | null {
    this.ensureInitialized();
    return this.ssoManager;
  }

  /**
   * Get the experiment manager instance
   */
  getExperimentManager(): ExperimentManager | null {
    this.ensureInitialized();
    return this.experimentManager;
  }

  /**
   * Get the marketplace manager instance
   */
  getMarketplaceManager(): MarketplaceManager | null {
    this.ensureInitialized();
    return this.marketplaceManager;
  }

  getConversationStorage(): ConversationStorage | null {
    this.ensureInitialized();
    return this.chatConversationStorage;
  }

  getBranchingManager(): BranchingManager | null {
    this.ensureInitialized();
    return this.branchingManager;
  }

  /**
   * Get the sub-agent manager instance (may be null if delegation is disabled)
   */
  getSubAgentManager(): SubAgentManager | null {
    this.ensureInitialized();
    return this.subAgentManager;
  }

  /**
   * Get the swarm manager instance (may be null if delegation is disabled)
   */
  getSwarmManager(): SwarmManager | null {
    this.ensureInitialized();
    return this.swarmManager;
  }

  /**
   * Get the swarm storage instance (may be null if not initialized)
   */
  getSwarmStorage(): SwarmStorage | null {
    this.ensureInitialized();
    return this.swarmStorage;
  }

  /**
   * Get the sub-agent storage instance (may be null if not initialized)
   */
  getSubAgentStorage(): SubAgentStorage | null {
    this.ensureInitialized();
    return this.subAgentStorage;
  }

  /**
   * Get the team manager instance (may be null if not initialized)
   */
  getTeamManager(): TeamManager | null {
    this.ensureInitialized();
    return this.teamManager;
  }

  /**
   * Get the council manager instance (may be null if not initialized)
   */
  getCouncilManager(): CouncilManager | null {
    this.ensureInitialized();
    return this.councilManager;
  }

  /**
   * Get the workflow manager instance (may be null if not initialized)
   */
  getWorkflowManager(): WorkflowManager | null {
    this.ensureInitialized();
    return this.workflowManager;
  }

  getPersonalityVersionManager(): PersonalityVersionManager | null {
    this.ensureInitialized();
    return this.personalityVersionManager;
  }

  getWorkflowVersionManager(): WorkflowVersionManager | null {
    this.ensureInitialized();
    return this.workflowVersionManager;
  }

  /**
   * Get the extension manager instance (may be null if extensions are disabled)
   */
  getExtensionManager(): ExtensionManager | null {
    this.ensureInitialized();
    return this.extensionManager;
  }

  /**
   * Get the code execution manager instance (may be null if execution is disabled)
   */
  getExecutionManager(): CodeExecutionManager | null {
    this.ensureInitialized();
    return this.executionManager;
  }

  /**
   * Get the A2A manager instance (may be null if A2A is disabled)
   */
  getA2AManager(): A2AManager | null {
    this.ensureInitialized();
    return this.a2aManager;
  }

  /**
   * Get the dynamic tool manager instance (null when allowDynamicTools is disabled).
   */
  getDynamicToolManager(): DynamicToolManager | null {
    this.ensureInitialized();
    return this.dynamicToolManager;
  }

  getProactiveManager(): import('./proactive/manager.js').ProactiveManager | null {
    this.ensureInitialized();
    return this.proactiveManager;
  }

  /**
   * Get the intent manager instance (null when allowOrgIntent is disabled).
   */
  getIntentManager(): IntentManager | null {
    this.ensureInitialized();
    return this.intentManager;
  }

  /**
   * Get the autonomy audit manager (always available when initialized).
   * Manager is wired lazily so all dependencies (soul, workflow, audit) are available.
   */
  getAutonomyAuditManager(): AutonomyAuditManager | null {
    this.ensureInitialized();
    if (!this.autonomyAuditStorage) return null;
    if (!this.autonomyAuditManager) {
      this.autonomyAuditManager = new AutonomyAuditManager(
        this.autonomyAuditStorage,
        this.soulManager,
        this.workflowManager,
        this.auditChain
      );
    }
    return this.autonomyAuditManager;
  }

  /**
   * Get the notification manager instance (always available after initialization).
   * The broadcast callback is wired by the gateway after it starts.
   */
  getNotificationManager(): NotificationManager | null {
    this.ensureInitialized();
    return this.notificationManager;
  }

  /** Get the user notification preferences storage (always available after initialization). */
  getUserNotificationPrefsStorage(): UserNotificationPrefsStorage | null {
    this.ensureInitialized();
    return this.userNotificationPrefsStorage;
  }

  /**
   * Get the risk assessment manager instance (always available after initialization).
   */
  getRiskAssessmentManager(): RiskAssessmentManager | null {
    this.ensureInitialized();
    return this.riskAssessmentManager;
  }

  getDepartmentRiskManager(): DepartmentRiskManager | null {
    this.ensureInitialized();
    return this.departmentRiskManager;
  }

  getProviderAccountManager(): ProviderAccountManager | null {
    this.ensureInitialized();
    return this.providerAccountManager;
  }

  getExternalizationGate(): ExternalizationGate | null {
    this.ensureInitialized();
    return this.externalizationGate;
  }

  getQuarantineStorage(): QuarantineStorage | null {
    this.ensureInitialized();
    return this.quarantineStorage;
  }

  getScanHistoryStore(): ScanHistoryStore | null {
    this.ensureInitialized();
    return this.scanHistoryStore;
  }

  getProviderHealthTracker(): ProviderHealthTracker {
    return this.providerHealthTracker;
  }

  getCostBudgetChecker(): CostBudgetChecker | null {
    return this.costBudgetChecker;
  }

  getAthiManager(): AthiManager | null {
    this.ensureInitialized();
    return this.athiManager;
  }

  getMultimodalManager(): import('./multimodal/manager.js').MultimodalManager | null {
    this.ensureInitialized();
    return this.multimodalManager;
  }

  getBrowserSessionStorage(): import('./browser/storage.js').BrowserSessionStorage | null {
    this.ensureInitialized();
    return this.browserSessionStorage;
  }

  /**
   * Get the integration storage instance
   */
  getIntegrationStorage(): IntegrationStorage {
    this.ensureInitialized();
    if (!this.integrationStorage) {
      throw new Error('Integration storage is not available');
    }
    return this.integrationStorage;
  }

  /**
   * Get the message router instance (may return null if not yet initialised).
   */
  getMessageRouter(): MessageRouter | null {
    return this.messageRouter;
  }

  /**
   * Get the group chat storage instance (may return null if not yet initialised).
   */
  getGroupChatStorage(): GroupChatStorage | null {
    return this.groupChatStorage;
  }

  /**
   * Get the routing rules storage instance (may return null if not yet initialised).
   */
  getRoutingRulesStorage(): RoutingRulesStorage | null {
    return this.routingRulesStorage;
  }

  /**
   * Get the routing rules manager instance (may return null if not yet initialised).
   */
  getRoutingRulesManager(): RoutingRulesManager | null {
    return this.routingRulesManager;
  }

  /**
   * Get the raw audit storage instance (for streaming export).
   */
  getAuditStorage(): import('./logging/audit-chain.js').AuditChainStorage | null {
    return this.auditStorage;
  }

  /**
   * Get the backup manager instance (Phase 61).
   */
  getBackupManager(): BackupManager | null {
    this.ensureInitialized();
    return this.backupManager;
  }

  /**
   * Get the tenant manager instance (Phase 61).
   */
  getTenantManager(): TenantManager | null {
    this.ensureInitialized();
    return this.tenantManager;
  }

  /**
   * Get the federation manager instance (Phase 79).
   */
  getFederationManager(): FederationManager | null {
    return this.federationManager;
  }

  /**
   * Get the alert manager instance (Phase 83).
   */
  getAlertManager(): AlertManager | null {
    return this.alertManager;
  }

  /**
   * Get the alert storage instance (Phase 83).
   */
  getAlertStorage(): AlertStorage | null {
    return this.alertStorage;
  }

  /**
   * Get the auth storage instance.
   */
  getAuthStorage(): AuthStorage {
    this.ensureInitialized();
    if (!this.authStorage) throw new Error('Auth storage not available');
    return this.authStorage;
  }

  /**
   * Get the distillation manager instance (Phase 64).
   */
  getDistillationManager(): DistillationManager | null {
    this.ensureInitialized();
    return this.distillationManager;
  }

  /**
   * Get the finetune manager instance (Phase 64).
   */
  getFinetuneManager(): FinetuneManager | null {
    this.ensureInitialized();
    return this.finetuneManager;
  }

  /**
   * Get the data curation manager instance (Phase 73).
   */
  getDataCurationManager(): DataCurationManager | null {
    this.ensureInitialized();
    return this.dataCurationManager;
  }

  /**
   * Get the evaluation manager instance (Phase 73).
   */
  getEvaluationManager(): EvaluationManager | null {
    this.ensureInitialized();
    return this.evaluationManager;
  }

  /**
   * Get the pipeline approval manager instance (Phase 73).
   */
  getPipelineApprovalManager(): PipelineApprovalManager | null {
    this.ensureInitialized();
    return this.pipelineApprovalManager;
  }

  /**
   * Get the pipeline lineage storage instance (Phase 73).
   */
  getPipelineLineageStorage(): PipelineLineageStorage | null {
    this.ensureInitialized();
    return this.pipelineLineageStorage;
  }

  /**
   * Get the LLM judge manager instance (Phase 97).
   */
  getLlmJudgeManager(): LlmJudgeManager | null {
    this.ensureInitialized();
    return this.llmJudgeManager;
  }

  /**
   * Get the preference manager instance (Phase 98).
   */
  getPreferenceManager(): PreferenceManager | null {
    this.ensureInitialized();
    return this.preferenceManager;
  }

  /**
   * Get the dataset curator manager instance (Phase 98).
   */
  getDatasetCuratorManager(): DatasetCuratorManager | null {
    this.ensureInitialized();
    return this.datasetCuratorManager;
  }

  /**
   * Get the experiment registry manager instance (Phase 98).
   */
  getExperimentRegistryManager(): ExperimentRegistryManager | null {
    this.ensureInitialized();
    return this.experimentRegistryManager;
  }

  /**
   * Get the model version manager instance (Phase 98).
   */
  getModelVersionManager(): ModelVersionManager | null {
    this.ensureInitialized();
    return this.modelVersionManager;
  }

  /**
   * Get the A/B test manager instance (Phase 98).
   */
  getAbTestManager(): AbTestManager | null {
    this.ensureInitialized();
    return this.abTestManager;
  }

  /**
   * Get the LicenseManager instance.
   */
  getLicenseManager(): LicenseManager {
    return this.licenseManager;
  }

  getStrategyStorage(): StrategyStorage {
    this.ensureInitialized();
    if (!this.strategyStorage) {
      throw new Error('Strategy storage not initialized');
    }
    return this.strategyStorage;
  }

  /**
   * Replace the active license key at runtime (called by POST /api/v1/license/key).
   */
  reloadLicenseKey(key: string): void {
    this.licenseManager = new LicenseManager(key);
    this.logger?.info('License key reloaded', { tier: this.licenseManager.getTier() });
  }

  /**
   * Get the analytics storage instance (Phase 96).
   */
  getAnalyticsStorage(): AnalyticsStorage | null {
    this.ensureInitialized();
    return this.analyticsStorage;
  }

  /**
   * Get the sentiment analyzer instance (Phase 96).
   */
  getSentimentAnalyzer(): SentimentAnalyzer | null {
    this.ensureInitialized();
    return this.sentimentAnalyzer;
  }

  /**
   * Get the conversation summarizer instance (Phase 96).
   */
  getConversationSummarizer(): ConversationSummarizer | null {
    this.ensureInitialized();
    return this.conversationSummarizer;
  }

  /**
   * Get the entity extractor instance (Phase 96).
   */
  getEntityExtractor(): EntityExtractor | null {
    this.ensureInitialized();
    return this.entityExtractor;
  }

  /**
   * Get the engagement metrics service instance (Phase 96).
   */
  getEngagementMetricsService(): EngagementMetricsService | null {
    this.ensureInitialized();
    return this.engagementMetricsService;
  }

  /**
   * Get the usage anomaly detector instance (Phase 96).
   */
  getUsageAnomalyDetector(): UsageAnomalyDetector | null {
    this.ensureInitialized();
    return this.usageAnomalyDetector;
  }

  /**
   * Get the conversation quality scorer instance (Phase 92).
   */
  getConversationQualityScorer(): ConversationQualityScorer | null {
    this.ensureInitialized();
    return this.conversationQualityScorer;
  }

  /**
   * Get the computer-use manager instance (Phase 92).
   */
  getComputerUseManager(): ComputerUseManager | null {
    this.ensureInitialized();
    return this.computerUseManager;
  }

  /**
   * Get the capture audit logger instance (Phase 108-B).
   */
  getCaptureAuditLogger(): CaptureAuditLogger | null {
    return this.captureAuditLogger;
  }

  /**
   * Get the desktop training bridge instance (Phase 108-C).
   */
  getDesktopTrainingBridge(): DesktopTrainingBridge | null {
    return this.desktopTrainingBridge;
  }

  /**
   * Get the Postgres pool (Phase 92 — used by training quality routes).
   */
  getPool(): import('pg').Pool | null {
    try {
      return getPool();
    } catch {
      return null;
    }
  }

  /**
   * Switch the AI model at runtime by recreating the AIClient.
   * The switch is not persisted across restarts.
   */
  switchModel(provider: string, model: string): void {
    this.ensureInitialized();
    this.applyModelSwitch(provider, model);
  }

  /**
   * Internal model-switch logic that can be called during initialization
   * (before this.initialized = true) as well as at runtime.
   */
  private applyModelSwitch(provider: string, model: string): void {
    const validProviders = [
      'anthropic',
      'openai',
      'gemini',
      'ollama',
      'opencode',
      'lmstudio',
      'localai',
      'deepseek',
      'mistral',
    ];
    if (!validProviders.includes(provider)) {
      throw new Error(
        `Invalid provider: ${provider}. Must be one of: ${validProviders.join(', ')}`
      );
    }

    const currentModelConfig = this.config!.model;

    const newModelConfig = {
      ...currentModelConfig,
      provider: provider as typeof currentModelConfig.provider,
      model,
      apiKeyEnv: PROVIDER_KEY_ENV[provider] ?? currentModelConfig.apiKeyEnv,
    };

    try {
      this.aiClient = new AIClient(
        {
          model: newModelConfig,
          retryConfig: {
            maxRetries: newModelConfig.maxRetries,
            baseDelayMs: newModelConfig.retryDelayMs,
          },
        },
        {
          auditChain: this.auditChain ?? undefined,
          logger: this.logger?.child({ component: 'AIClient' }),
          // Carry the existing tracker across model switches so historical
          // records and DB-seeded counters are not lost when the user changes
          // provider/model (including the persisted default applied on startup).
          usageStorage: this.usageStorage ?? undefined,
          usageTracker: this.aiClient?.getUsageTracker(),
          providerAccountManager: this.providerAccountManager ?? undefined,
        }
      );

      // Update the in-memory config so getConfig() reflects the change
      this.config = { ...this.config!, model: newModelConfig };

      this.logger?.info('AI model switched', { provider, model });

      void this.auditChain?.record({
        event: 'model_switched',
        level: 'info',
        message: `AI model switched to ${provider}/${model}`,
        metadata: { provider, model },
      });
    } catch (error) {
      this.logger?.error('Failed to switch AI model', {
        provider,
        model,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Set a persistent AI model default that survives restarts.
   * Validates the provider, switches the active model, and persists the choice.
   */
  async setModelDefault(provider: string, model: string): Promise<void> {
    this.ensureInitialized();

    if (!this.systemPreferences) {
      throw new Error('System preferences storage is not available');
    }

    // switchModel already validates the provider and throws on invalid input
    this.switchModel(provider, model);

    await this.systemPreferences.set('model.provider', provider);
    await this.systemPreferences.set('model.model', model);
    this.modelDefaultSet = true;

    this.logger?.info('AI model default persisted', { provider, model });
  }

  /**
   * Clear the persistent AI model default.
   * The model will revert to the config file default on next restart.
   */
  async clearModelDefault(): Promise<void> {
    this.ensureInitialized();

    if (!this.systemPreferences) {
      throw new Error('System preferences storage is not available');
    }

    await this.systemPreferences.delete('model.provider');
    await this.systemPreferences.delete('model.model');
    this.modelDefaultSet = false;

    this.logger?.info('AI model default cleared');
  }

  /**
   * Return the current persisted model default, or null if none is set.
   */
  getModelDefault(): { provider: string; model: string } | null {
    if (!this.modelDefaultSet) return null;
    const config = this.config;
    if (!config) return null;
    return { provider: config.model.provider, model: config.model.model };
  }

  /**
   * Enable or disable local-first routing and persist the setting.
   * When enabled, local providers (ollama/lmstudio/localai) in the fallback
   * chain are tried before the primary cloud provider.
   */
  async setLocalFirst(enabled: boolean): Promise<void> {
    if (!this.config) throw new Error('Not initialized');
    this.config = {
      ...this.config,
      model: { ...this.config.model, localFirst: enabled },
    };

    // Recreate AIClient with updated config so the change takes effect immediately
    if (this.aiClient) {
      const newModelConfig = { ...this.config.model };
      this.aiClient = new AIClient(
        {
          model: newModelConfig,
          retryConfig: {
            maxRetries: newModelConfig.maxRetries,
            baseDelayMs: newModelConfig.retryDelayMs,
          },
        },
        {
          auditChain: this.auditChain ?? undefined,
          logger: this.logger?.child({ component: 'AIClient' }),
          usageStorage: this.usageStorage ?? undefined,
          usageTracker: this.aiClient.getUsageTracker(),
          providerAccountManager: this.providerAccountManager ?? undefined,
        }
      );
    }

    if (this.systemPreferences) {
      await this.systemPreferences.set('model.localFirst', String(enabled));
    }

    this.logger?.info('Local-first routing updated', { enabled });
  }

  /**
   * Return the current localFirst setting.
   */
  getLocalFirst(): boolean {
    return this.config?.model.localFirst ?? false;
  }

  /**
   * Get the system preferences storage instance.
   */
  getSystemPreferences(): SystemPreferencesStorage | null {
    return this.systemPreferences;
  }

  /**
   * Boot (or re-boot) the sub-agent delegation chain at runtime.
   * Called at startup when delegation is needed, and lazily when the
   * security policy is toggled on via updateSecurityPolicy().
   */
  async ensureDelegationReady(): Promise<void> {
    if (!this.subAgentManager) {
      await this.bootDelegationChain();
    }
  }

  private async bootDelegationChain(): Promise<void> {
    try {
      if (!this.subAgentStorage) {
        this.subAgentStorage = new SubAgentStorage();
      }
      this.subAgentManager = new SubAgentManager(this.config!.delegation, {
        storage: this.subAgentStorage,
        aiClientConfig: {
          model: this.config!.model,
          retryConfig: {
            maxRetries: this.config!.model.maxRetries,
            baseDelayMs: this.config!.model.retryDelayMs,
          },
        },
        aiClientDeps: {
          auditChain: this.auditChain ?? undefined,
          logger: this.logger!.child({ component: 'SubAgentAI' }),
        },
        mcpClient: this.mcpClientManager ?? undefined,
        auditChain: this.auditChain!,
        logger: this.logger!.child({ component: 'SubAgentManager' }),
        brainManager: this.brainManager ?? undefined,
        securityConfig: this.config!.security,
      });
      await this.subAgentManager.initialize();
      this.logger!.debug('Sub-agent delegation system initialized');

      // Swarm manager (requires subAgentManager)
      try {
        if (!this.swarmStorage) {
          this.swarmStorage = new SwarmStorage();
        }
        const subMgr = this.subAgentManager;
        this.swarmManager = new SwarmManager({
          storage: this.swarmStorage,
          subAgentManager: subMgr,
          logger: this.logger!.child({ component: 'SwarmManager' }),
        });
        await this.swarmManager.initialize();
        this.logger!.debug('Swarm manager initialized');
      } catch (swarmError) {
        this.logger!.warn('Swarm manager initialization failed (non-fatal)', {
          error: swarmError instanceof Error ? swarmError.message : 'Unknown error',
        });
      }

      // Team manager (requires subAgentManager)
      try {
        if (!this.teamStorage) {
          this.teamStorage = new TeamStorage();
        }
        const subMgr = this.subAgentManager;
        this.teamManager = new TeamManager({
          storage: this.teamStorage,
          subAgentManager: subMgr,
          aiClientConfig: {
            model: this.config!.model,
            retryConfig: {
              maxRetries: this.config!.model.maxRetries,
              baseDelayMs: this.config!.model.retryDelayMs,
            },
          },
          aiClientDeps: {
            auditChain: this.auditChain ?? undefined,
            logger: this.logger!.child({ component: 'TeamManagerAI' }),
          },
          auditChain: this.auditChain,
          logger: this.logger!.child({ component: 'TeamManager' }),
        });
        await this.teamManager.initialize();
        this.logger!.debug('Team manager initialized');
      } catch (teamError) {
        this.logger!.warn('Team manager initialization failed (non-fatal)', {
          error: teamError instanceof Error ? teamError.message : 'Unknown error',
        });
      }

      // Council manager (requires subAgentManager)
      try {
        if (!this.councilStorage) {
          this.councilStorage = new CouncilStorage();
        }
        const subMgrCouncil = this.subAgentManager;
        this.councilManager = new CouncilManager({
          storage: this.councilStorage,
          subAgentManager: subMgrCouncil,
          aiClientConfig: {
            model: this.config!.model,
          },
          aiClientDeps: {
            auditChain: this.auditChain ?? undefined,
            logger: this.logger!.child({ component: 'CouncilManagerAI' }),
          },
          logger: this.logger!.child({ component: 'CouncilManager' }),
        });
        await this.councilManager.initialize();
        this.logger!.debug('Council manager initialized');
      } catch (councilError) {
        this.logger!.warn('Council manager initialization failed (non-fatal)', {
          error: councilError instanceof Error ? councilError.message : 'Unknown error',
        });
      }

      // Workflow manager (requires subAgentManager + swarmManager)
      try {
        if (!this.workflowStorage) {
          this.workflowStorage = new WorkflowStorage();
        }
        const subMgr2 = this.subAgentManager;

        // Workflow version tracking (Phase 114)
        this.workflowVersionStorage = new WorkflowVersionStorage();
        this.workflowVersionManager = new WorkflowVersionManager({
          versionStorage: this.workflowVersionStorage,
          workflowStorage: this.workflowStorage,
        });

        this.workflowManager = new WorkflowManager({
          storage: this.workflowStorage,
          subAgentManager: subMgr2,
          swarmManager: this.swarmManager,
          logger: this.logger!.child({ component: 'WorkflowManager' }),
          dataCurationManager: this.dataCurationManager,
          distillationManager: this.distillationManager,
          finetuneManager: this.finetuneManager,
          evaluationManager: this.evaluationManager,
          approvalManager: this.pipelineApprovalManager,
          lineageStorage: this.pipelineLineageStorage,
          alertManager: this.alertManager,
          workflowVersionManager: this.workflowVersionManager,
          councilManager: this.councilManager,
        });
        await this.workflowManager.initialize();
        this.logger!.debug('Workflow manager initialized');

        // Wire workflow + swarm + council managers into marketplace so community sync works
        this.marketplaceManager?.setDelegationManagers({
          workflowManager: this.workflowManager,
          swarmManager: this.swarmManager ?? undefined,
          councilManager: this.councilManager ?? undefined,
          soulManager: this.soulManager ?? undefined,
        });
      } catch (workflowError) {
        this.logger!.warn('Workflow manager initialization failed (non-fatal)', {
          error: workflowError instanceof Error ? workflowError.message : 'Unknown error',
        });
      }
    } catch (error) {
      this.logger!.warn('Sub-agent delegation initialization failed (non-fatal)', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Update security policy toggles at runtime.
   * Boolean toggles are persisted to the security.policy DB table and reloaded on startup.
   */
  updateSecurityPolicy(updates: {
    allowSubAgents?: boolean;
    allowA2A?: boolean;
    allowSwarms?: boolean;
    allowExtensions?: boolean;
    allowExecution?: boolean;
    allowProactive?: boolean;
    allowWorkflows?: boolean;
    allowExperiments?: boolean;
    allowStorybook?: boolean;
    allowMultimodal?: boolean;
    allowDesktopControl?: boolean;
    allowCamera?: boolean;
    allowDynamicTools?: boolean;
    sandboxDynamicTools?: boolean;
    allowAnomalyDetection?: boolean;
    sandboxGvisor?: boolean;
    sandboxWasm?: boolean;
    sandboxCredentialProxy?: boolean;
    allowCommunityGitFetch?: boolean;
    communityGitUrl?: string;
    allowNetworkTools?: boolean;
    allowNetBoxWrite?: boolean;
    allowTwingate?: boolean;
    allowOrgIntent?: boolean;
    allowIntentEditor?: boolean;
    allowCodeEditor?: boolean;
    allowAdvancedEditor?: boolean;
    allowTrainingExport?: boolean;
    promptGuardMode?: 'block' | 'warn' | 'disabled';
    responseGuardMode?: 'block' | 'warn' | 'disabled';
    jailbreakThreshold?: number;
    jailbreakAction?: 'block' | 'warn' | 'audit_only';
    strictSystemPromptConfidentiality?: boolean;
    abuseDetectionEnabled?: boolean;
    contentGuardrailsEnabled?: boolean;
    contentGuardrailsPiiMode?: 'disabled' | 'detect_only' | 'redact';
    contentGuardrailsToxicityEnabled?: boolean;
    contentGuardrailsToxicityMode?: 'block' | 'warn' | 'audit_only';
    contentGuardrailsToxicityClassifierUrl?: string;
    contentGuardrailsToxicityThreshold?: number;
    contentGuardrailsBlockList?: string[];
    contentGuardrailsBlockedTopics?: string[];
    contentGuardrailsGroundingEnabled?: boolean;
    contentGuardrailsGroundingMode?: 'flag' | 'block';
  }): void {
    this.ensureInitialized();

    if (updates.allowSubAgents !== undefined) {
      this.config!.security.allowSubAgents = updates.allowSubAgents;
      // Keep delegation.enabled in sync — enabling the security policy toggle
      // should be sufficient to activate delegation without requiring a separate
      // YAML config edit. Disabling does not turn off config (security policy
      // kill-switch in the manager handles that independently).
      if (updates.allowSubAgents && this.config!.delegation) {
        this.config!.delegation.enabled = true;
      }
      // Lazy-boot the delegation chain when toggled ON at runtime if it was
      // not initialized at startup (because allowSubAgents was false at boot).
      if (updates.allowSubAgents && !this.subAgentManager) {
        void this.bootDelegationChain();
      }
    }
    if (updates.allowA2A !== undefined) {
      this.config!.security.allowA2A = updates.allowA2A;
    }
    if (updates.allowSwarms !== undefined) {
      this.config!.security.allowSwarms = updates.allowSwarms;
    }
    if (updates.allowExtensions !== undefined) {
      this.config!.security.allowExtensions = updates.allowExtensions;
    }
    if (updates.allowExecution !== undefined) {
      this.config!.security.allowExecution = updates.allowExecution;
    }
    if (updates.allowProactive !== undefined) {
      this.config!.security.allowProactive = updates.allowProactive;
    }
    if (updates.allowWorkflows !== undefined) {
      this.config!.security.allowWorkflows = updates.allowWorkflows;
    }
    if (updates.allowExperiments !== undefined) {
      this.config!.security.allowExperiments = updates.allowExperiments;
    }
    if (updates.allowStorybook !== undefined) {
      this.config!.security.allowStorybook = updates.allowStorybook;
    }
    if (updates.allowMultimodal !== undefined) {
      this.config!.security.allowMultimodal = updates.allowMultimodal;
    }
    if (updates.allowDesktopControl !== undefined) {
      this.config!.security.allowDesktopControl = updates.allowDesktopControl;
    }
    if (updates.allowCamera !== undefined) {
      this.config!.security.allowCamera = updates.allowCamera;
    }
    if (updates.allowDynamicTools !== undefined) {
      this.config!.security.allowDynamicTools = updates.allowDynamicTools;
    }
    if (updates.sandboxDynamicTools !== undefined) {
      this.config!.security.sandboxDynamicTools = updates.sandboxDynamicTools;
    }
    if (updates.allowAnomalyDetection !== undefined) {
      this.config!.security.allowAnomalyDetection = updates.allowAnomalyDetection;
    }
    if (updates.sandboxGvisor !== undefined) {
      this.config!.security.sandboxGvisor = updates.sandboxGvisor;
    }
    if (updates.sandboxWasm !== undefined) {
      this.config!.security.sandboxWasm = updates.sandboxWasm;
    }
    if (updates.sandboxCredentialProxy !== undefined) {
      this.config!.security.sandboxCredentialProxy = updates.sandboxCredentialProxy;
    }
    if (updates.allowCommunityGitFetch !== undefined) {
      this.config!.security.allowCommunityGitFetch = updates.allowCommunityGitFetch;
      this.marketplaceManager?.updatePolicy({
        allowCommunityGitFetch: updates.allowCommunityGitFetch,
      });
    }
    if (updates.communityGitUrl !== undefined) {
      this.config!.security.communityGitUrl = updates.communityGitUrl;
      this.marketplaceManager?.updatePolicy({ communityGitUrl: updates.communityGitUrl });
    }
    if (updates.allowNetworkTools !== undefined) {
      this.config!.security.allowNetworkTools = updates.allowNetworkTools;
    }
    if (updates.allowNetBoxWrite !== undefined) {
      this.config!.security.allowNetBoxWrite = updates.allowNetBoxWrite;
    }
    if (updates.allowTwingate !== undefined) {
      this.config!.security.allowTwingate = updates.allowTwingate;
    }
    if (updates.allowOrgIntent !== undefined) {
      this.config!.security.allowOrgIntent = updates.allowOrgIntent;
    }
    if (updates.allowIntentEditor !== undefined) {
      this.config!.security.allowIntentEditor = updates.allowIntentEditor;
    }
    if (updates.allowCodeEditor !== undefined) {
      this.config!.security.allowCodeEditor = updates.allowCodeEditor;
    }
    if (updates.allowAdvancedEditor !== undefined) {
      this.config!.security.allowAdvancedEditor = updates.allowAdvancedEditor;
    }
    if (updates.allowTrainingExport !== undefined) {
      this.config!.security.allowTrainingExport = updates.allowTrainingExport;
    }
    if (updates.promptGuardMode !== undefined) {
      this.config!.security.promptGuard.mode = updates.promptGuardMode;
    }
    if (updates.responseGuardMode !== undefined) {
      this.config!.security.responseGuard.mode = updates.responseGuardMode;
    }
    if (updates.jailbreakThreshold !== undefined) {
      this.config!.security.inputValidation.jailbreakThreshold = updates.jailbreakThreshold;
    }
    if (updates.jailbreakAction !== undefined) {
      this.config!.security.inputValidation.jailbreakAction = updates.jailbreakAction;
    }
    if (updates.strictSystemPromptConfidentiality !== undefined) {
      this.config!.security.strictSystemPromptConfidentiality =
        updates.strictSystemPromptConfidentiality;
    }
    if (updates.abuseDetectionEnabled !== undefined) {
      this.config!.security.abuseDetection.enabled = updates.abuseDetectionEnabled;
    }
    if (updates.contentGuardrailsEnabled !== undefined) {
      this.config!.security.contentGuardrails.enabled = updates.contentGuardrailsEnabled;
    }
    if (updates.contentGuardrailsPiiMode !== undefined) {
      this.config!.security.contentGuardrails.piiMode = updates.contentGuardrailsPiiMode;
    }
    if (updates.contentGuardrailsToxicityEnabled !== undefined) {
      this.config!.security.contentGuardrails.toxicityEnabled =
        updates.contentGuardrailsToxicityEnabled;
    }
    if (updates.contentGuardrailsToxicityMode !== undefined) {
      this.config!.security.contentGuardrails.toxicityMode = updates.contentGuardrailsToxicityMode;
    }
    if (updates.contentGuardrailsToxicityClassifierUrl !== undefined) {
      this.config!.security.contentGuardrails.toxicityClassifierUrl =
        updates.contentGuardrailsToxicityClassifierUrl;
    }
    if (updates.contentGuardrailsToxicityThreshold !== undefined) {
      this.config!.security.contentGuardrails.toxicityThreshold =
        updates.contentGuardrailsToxicityThreshold;
    }
    if (updates.contentGuardrailsBlockList !== undefined) {
      this.config!.security.contentGuardrails.blockList = updates.contentGuardrailsBlockList;
    }
    if (updates.contentGuardrailsBlockedTopics !== undefined) {
      this.config!.security.contentGuardrails.blockedTopics =
        updates.contentGuardrailsBlockedTopics;
    }
    if (updates.contentGuardrailsGroundingEnabled !== undefined) {
      this.config!.security.contentGuardrails.groundingEnabled =
        updates.contentGuardrailsGroundingEnabled;
    }
    if (updates.contentGuardrailsGroundingMode !== undefined) {
      this.config!.security.contentGuardrails.groundingMode =
        updates.contentGuardrailsGroundingMode;
    }

    this.logger?.info('Security policy updated', updates);

    // Persist toggles to database (string fields like communityGitUrl are excluded)
    const { communityGitUrl: _url, ...persistableUpdates } = updates;
    void this.persistSecurityPolicyToDb(persistableUpdates as Record<string, unknown>);

    void this.auditChain?.record({
      event: 'security_policy_changed',
      level: 'info',
      message: `Security policy updated: ${JSON.stringify(updates)}`,
      metadata: updates,
    });
  }

  /** Persist security policy settings to the database. */
  private async persistSecurityPolicyToDb(updates: Record<string, unknown>): Promise<void> {
    try {
      const pool = getPool();
      const now = Date.now();
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined) continue;
        await pool.query(
          `INSERT INTO security.policy (key, value, updated_at) VALUES ($1, $2, $3)
           ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = $3`,
          [key, JSON.stringify(value), now]
        );
      }
    } catch (err) {
      this.logger?.error('Failed to persist security policy to DB', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** Load persisted security policy from DB and merge into config. */
  private async loadSecurityPolicyFromDb(): Promise<void> {
    try {
      const pool = getPool();
      const result = await pool.query('SELECT key, value FROM security.policy');
      const policyKeys = [
        'allowSubAgents',
        'allowA2A',
        'allowSwarms',
        'allowExtensions',
        'allowExecution',
        'allowProactive',
        'allowWorkflows',
        'allowExperiments',
        'allowStorybook',
        'allowMultimodal',
        'allowDesktopControl',
        'allowCamera',
        'allowDynamicTools',
        'sandboxDynamicTools',
        'allowAnomalyDetection',
        'sandboxGvisor',
        'sandboxWasm',
        'sandboxCredentialProxy',
        'allowCommunityGitFetch',
        'allowNetworkTools',
        'allowNetBoxWrite',
        'allowTwingate',
        'allowOrgIntent',
        'allowIntentEditor',
        'allowCodeEditor',
        'allowAdvancedEditor',
        'allowTrainingExport',
        'strictSystemPromptConfidentiality',
      ] as const;
      // Special handling for nested config fields
      const nestedPolicyHandlers: Record<string, (val: unknown) => void> = {
        promptGuardMode: (v) => {
          this.config!.security.promptGuard.mode = v as 'block' | 'warn' | 'disabled';
        },
        responseGuardMode: (v) => {
          this.config!.security.responseGuard.mode = v as 'block' | 'warn' | 'disabled';
        },
        jailbreakThreshold: (v) => {
          this.config!.security.inputValidation.jailbreakThreshold = v as number;
        },
        jailbreakAction: (v) => {
          this.config!.security.inputValidation.jailbreakAction = v as
            | 'block'
            | 'warn'
            | 'audit_only';
        },
        abuseDetectionEnabled: (v) => {
          this.config!.security.abuseDetection.enabled = v as boolean;
        },
      };
      for (const row of result.rows) {
        const val = JSON.parse(row.value);
        if (Object.prototype.hasOwnProperty.call(nestedPolicyHandlers, row.key)) {
          nestedPolicyHandlers[row.key]!(val);
        } else if (policyKeys.includes(row.key as (typeof policyKeys)[number])) {
          (this.config!.security as Record<string, unknown>)[row.key] = val;
        }
      }
      if (result.rows.length > 0) {
        this.logger?.debug('Loaded persisted security policy from DB', {
          keys: result.rows.map((r: { key: string }) => r.key),
        });
      }
    } catch (err) {
      this.logger?.warn('Failed to load security policy from DB (table may not exist yet)', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Get configuration
   */
  getConfig(): Config {
    this.ensureInitialized();
    return this.config!;
  }

  /**
   * Get the gateway server instance
   */
  getGateway(): GatewayServer | null {
    return this.gateway;
  }

  /**
   * Start the gateway server
   */
  async startGateway(): Promise<void> {
    this.ensureInitialized();

    if (this.gateway) {
      throw new Error('Gateway is already running');
    }

    // Resolve TLS cert paths (auto-generates dev certs when configured to do so)
    let gatewayConfig = this.config!.gateway;
    if (this.tlsManager) {
      const certPaths = await this.tlsManager.ensureCerts();
      if (certPaths) {
        gatewayConfig = {
          ...gatewayConfig,
          tls: {
            ...gatewayConfig.tls,
            certPath: certPaths.certPath,
            keyPath: certPaths.keyPath,
            caPath: certPaths.caPath,
          },
        };
      }
    }

    this.gateway = createGatewayServer({
      config: gatewayConfig,
      secureYeoman: this,
      authService: this.authService ?? undefined,
      dashboardDist: this.options.dashboardDist,
    });

    await this.gateway.start();

    this.logger!.info('Gateway server started', {
      host: this.config!.gateway.host,
      port: this.config!.gateway.port,
    });

    await this.auditChain!.record({
      event: 'gateway_started',
      level: 'info',
      message: 'Gateway server started',
      metadata: {
        host: this.config!.gateway.host,
        port: this.config!.gateway.port,
      },
    });
  }

  /**
   * Stop the gateway server
   */
  async stopGateway(): Promise<void> {
    if (!this.gateway) {
      return;
    }

    await this.gateway.stop();
    this.gateway = null;

    this.logger?.info('Gateway server stopped');
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }

    this.shutdownPromise = this.performShutdown();
    return this.shutdownPromise;
  }

  /**
   * Perform the actual shutdown
   */
  private async performShutdown(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    this.logger?.info('SecureYeoman shutting down');

    try {
      // Record shutdown in audit log
      if (this.auditChain) {
        await this.auditChain.record({
          event: 'system_shutdown',
          level: 'info',
          message: 'SecureYeoman shutdown initiated',
          metadata: {
            uptime: this.startedAt ? Date.now() - this.startedAt : 0,
          },
        });
      }

      // Clean up components
      await this.cleanup();

      this.logger?.info('SecureYeoman shutdown complete');
    } catch (error) {
      this.logger?.error('Error during shutdown', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      this.initialized = false;
    }
  }

  /**
   * Clean up resources
   */
  private async cleanup(): Promise<void> {
    // Stop gateway server
    if (this.gateway) {
      await this.gateway.stop();
      this.gateway = null;
    }

    // Stop rate limiter cleanup
    if (this.rateLimiter) {
      this.rateLimiter.stop();
    }

    // Clear RBAC cache and close persistent storage
    if (this.rbac) {
      this.rbac.clearCache();
    }
    if (this.rbacStorage) {
      this.rbacStorage.close();
      this.rbacStorage = null;
    }

    // Stop rotation manager
    if (this.rotationManager) {
      this.rotationManager.stop();
      this.rotationManager = null;
    }
    if (this.rotationStorage) {
      this.rotationStorage.close();
      this.rotationStorage = null;
    }

    // Close task storage
    if (this.taskStorage) {
      this.taskStorage.close();
      this.taskStorage = null;
    }

    // Stop external brain sync
    if (this.externalBrainSync) {
      this.externalBrainSync.stop();
      this.externalBrainSync = null;
    }

    // Stop conversation quality scorer (Phase 92)
    if (this.conversationQualityScorer) {
      this.conversationQualityScorer.stop();
      this.conversationQualityScorer = null;
    }

    // Stop conversation analytics (Phase 96)
    if (this.sentimentAnalyzer) {
      this.sentimentAnalyzer.stop();
      this.sentimentAnalyzer = null;
    }
    if (this.conversationSummarizer) {
      this.conversationSummarizer.stop();
      this.conversationSummarizer = null;
    }
    if (this.entityExtractor) {
      this.entityExtractor.stop();
      this.entityExtractor = null;
    }

    // Stop heartbeat
    if (this.heartbeatManager) {
      this.heartbeatManager.stop();
      this.heartbeatManager = null;
    }

    // Stop daily usage prune timer
    if (this.usagePruneTimer) {
      clearInterval(this.usagePruneTimer);
      this.usagePruneTimer = null;
    }

    // Stop risk assessment scheduler
    if (this.riskScheduleTimer) {
      clearInterval(this.riskScheduleTimer);
      this.riskScheduleTimer = null;
    }

    // Close conversation manager
    if (this.conversationManager) {
      this.conversationManager.close();
      this.conversationManager = null;
    }

    // Close integration manager + storage
    if (this.integrationManager) {
      await this.integrationManager.close();
      this.integrationManager = null;
      this.messageRouter = null;
    } else if (this.integrationStorage) {
      this.integrationStorage.close();
    }
    this.integrationStorage = null;

    // Close agent comms
    if (this.agentComms) {
      this.agentComms.close();
      this.agentComms = null;
    }

    // Close soul storage
    if (this.soulStorage) {
      this.soulStorage.close();
      this.soulStorage = null;
      this.soulManager = null;
      this.approvalManager = null;
    }

    // Close spirit storage
    if (this.spiritStorage) {
      this.spiritStorage.close();
      this.spiritStorage = null;
      this.spiritManager = null;
    }

    // Stop memory audit scheduler (Phase 118)
    if (this.memoryAuditScheduler) {
      this.memoryAuditScheduler.stop();
      this.memoryAuditScheduler = null;
    }
    if (this.memoryAuditStorage) {
      this.memoryAuditStorage.close();
      this.memoryAuditStorage = null;
    }

    // Close brain storage
    if (this.brainStorage) {
      this.brainStorage.close();
      this.brainStorage = null;
      this.brainManager = null;
      this.documentManager = null;
    }

    // Close v1.2 module storage
    if (this.mcpStorage) {
      this.mcpStorage.close();
      this.mcpStorage = null;
      this.mcpClientManager = null;
      this.mcpServer = null;
    }
    if (this.dashboardStorage) {
      this.dashboardStorage.close();
      this.dashboardStorage = null;
      this.dashboardManager = null;
    }
    if (this.workspaceStorage) {
      this.workspaceStorage.close();
      this.workspaceStorage = null;
      this.workspaceManager = null;
    }
    if (this.ssoStorage) {
      this.ssoStorage.close();
      this.ssoStorage = null;
      this.ssoManager = null;
    }
    if (this.experimentStorage) {
      this.experimentStorage.close();
      this.experimentStorage = null;
      this.experimentManager = null;
    }
    if (this.marketplaceStorage) {
      this.marketplaceStorage.close();
      this.marketplaceStorage = null;
      this.marketplaceManager = null;
    }
    if (this.chatConversationStorage) {
      this.chatConversationStorage.close();
      this.chatConversationStorage = null;
    }
    if (this.subAgentStorage) {
      this.subAgentStorage.close();
      this.subAgentStorage = null;
      this.subAgentManager = null;
    }
    if (this.swarmStorage) {
      this.swarmStorage.close();
      this.swarmStorage = null;
      this.swarmManager = null;
    }
    if (this.teamStorage) {
      this.teamStorage.close();
      this.teamStorage = null;
      this.teamManager = null;
    }
    if (this.councilStorage) {
      this.councilStorage.close();
      this.councilStorage = null;
      this.councilManager = null;
    }
    if (this.workflowStorage) {
      this.workflowStorage.close();
      this.workflowStorage = null;
      this.workflowManager = null;
    }
    if (this.intentManager) {
      this.intentManager.destroy();
      this.intentManager = null;
      this.intentStorage = null;
    }
    if (this.extensionStorage) {
      this.extensionStorage.close();
      this.extensionStorage = null;
      this.extensionManager = null;
    }
    if (this.executionManager) {
      await this.executionManager.cleanup();
      this.executionManager = null;
    }
    if (this.executionStorage) {
      this.executionStorage.close();
      this.executionStorage = null;
    }
    if (this.a2aManager) {
      await this.a2aManager.cleanup();
      this.a2aManager = null;
    }
    if (this.proactiveManager) {
      this.proactiveManager.close();
      this.proactiveManager = null;
    }
    if (this.multimodalManager) {
      this.multimodalManager.close();
      this.multimodalManager = null;
    }
    if (this.browserSessionStorage) {
      this.browserSessionStorage.close();
      this.browserSessionStorage = null;
    }
    if (this.a2aStorage) {
      this.a2aStorage.close();
      this.a2aStorage = null;
    }
    this.reportGenerator = null;
    this.costOptimizer = null;

    // Stop federation health cycle (Phase 79)
    if (this.federationManager) {
      this.federationManager.stopHealthCycle();
      this.federationManager = null;
    }
    if (this.federationStorage) {
      this.federationStorage.close();
      this.federationStorage = null;
    }

    // Close auth storage
    if (this.authStorage) {
      this.authStorage.close();
      this.authStorage = null;
      this.authService = null;
    }

    // Close audit storage if it supports closing
    if (
      this.auditStorage &&
      'close' in this.auditStorage &&
      typeof (this.auditStorage as Record<string, unknown>).close === 'function'
    ) {
      (this.auditStorage as { close(): void }).close();
      this.auditStorage = null;
    }

    // Close PostgreSQL pool
    await closePool();
  }

  /**
   * Ensure SecureYeoman is initialized before operations
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('SecureYeoman is not initialized. Call initialize() first.');
    }
  }
}

/**
 * Create and initialize a SecureYeoman instance
 */
export async function createSecureYeoman(options?: SecureYeomanOptions): Promise<SecureYeoman> {
  const secureYeoman = new SecureYeoman(options);
  await secureYeoman.initialize();
  return secureYeoman;
}
