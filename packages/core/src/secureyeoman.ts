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

import { loadConfig, validateSecrets, getSecret, type LoadConfigOptions } from './config/loader.js';
import { initializeLogger, type SecureLogger } from './logging/logger.js';
import {
  AuditChain,
  type AuditChainStorage,
  type AuditQueryOptions,
  type AuditQueryResult,
} from './logging/audit-chain.js';
import type { InputValidator } from './security/input-validator.js';
import type { RateLimiterLike } from './security/rate-limiter.js';
import type { RBAC } from './security/rbac.js';
import {
  createTaskExecutor,
  type TaskExecutor,
  type TaskHandler,
  type ExecutionContext,
} from './task/executor.js';
import { SandboxManager, type SandboxManagerConfig } from './sandbox/manager.js';
import type { SandboxOptions } from './sandbox/types.js';
import { GatewayServer, createGatewayServer } from './gateway/server.js';
import type { AIClient } from './ai/client.js';
import type { UsageStorage } from './ai/usage-storage.js';
import type { AuthStorage } from './security/auth-storage.js';
import type { AuthService } from './security/auth.js';
import type { BrainStorage } from './brain/storage.js';
import type { BrainManager } from './brain/manager.js';
import type { DocumentManager } from './brain/document-manager.js';
import type { CognitiveMemoryStorage } from './brain/cognitive-memory-store.js';
import type { CognitiveMemoryManager } from './brain/cognitive-memory-manager.js';
import type { SpiritManager } from './spirit/manager.js';
import type { SoulManager } from './soul/manager.js';
import type { ApprovalManager } from './soul/approval-manager.js';
import type { IntegrationStorage } from './integrations/storage.js';
import type { IntegrationManager } from './integrations/manager.js';
import type { MessageRouter } from './integrations/message-router.js';
import { TaskStorage } from './task/task-storage.js';
import type { HeartbeatManager } from './body/heartbeat.js';
import type { HeartbeatLogStorage } from './body/heartbeat-log-storage.js';
import { BodyModule } from './modules/body-module.js';
import type { BrainModule } from './modules/brain-module.js';
import type { DelegationModule } from './modules/delegation-module.js';
import { AuditModule } from './modules/audit-module.js';
import { SecurityModule } from './modules/security-module.js';
import { AuthModule } from './modules/auth-module.js';
import type { AnalyticsModule } from './modules/analytics-module.js';
import type { TrainingModule } from './modules/training-module.js';
import { PlatformModule } from './modules/platform-module.js';
import { AIModule } from './modules/ai-module.js';
import { SoulModule } from './modules/soul-module.js';
import { IntegrationModule } from './modules/integration-module.js';
import type { ExternalBrainSync } from './brain/external-sync.js';
import { AuditReportGenerator } from './reporting/audit-report.js';
import type { SubAgentStorage } from './agents/storage.js';
import type { SubAgentManager } from './agents/manager.js';
import type { SwarmStorage } from './agents/swarm-storage.js';
import type { SwarmManager } from './agents/swarm-manager.js';
import type { TeamManager } from './agents/team-manager.js';
import type { CouncilManager } from './agents/council-manager.js';
import type { WorkflowManager } from './workflow/workflow-manager.js';
import type { WorkflowVersionManager } from './workflow/workflow-version-manager.js';
import type { ExtensionStorage } from './extensions/storage.js';
import type { ExtensionManager } from './extensions/manager.js';
import type { ExecutionStorage } from './execution/storage.js';
import type { CodeExecutionManager } from './execution/manager.js';
import type { A2AStorage } from './a2a/storage.js';
import type { A2AManager } from './a2a/manager.js';
import type { DistillationManager } from './training/distillation-manager.js';
import type { FinetuneManager } from './training/finetune-manager.js';
import type { DataCurationManager } from './training/data-curation.js';
import type { EvaluationManager } from './training/evaluation-manager.js';
import type { PipelineApprovalManager } from './training/approval-manager.js';
import type { PipelineLineageStorage } from './training/pipeline-lineage.js';
import type { ConversationQualityScorer } from './training/conversation-quality-scorer.js';
import type { ComputerUseManager } from './training/computer-use-manager.js';
import type { CaptureAuditLogger } from './body/capture-audit-logger.js';
import type { DesktopTrainingBridge } from './body/desktop-training-bridge.js';
import type { LlmJudgeManager } from './training/llm-judge-manager.js';
import type { PreferenceManager } from './training/preference-manager.js';
import type { DatasetCuratorManager } from './training/dataset-curator.js';
import type { ExperimentRegistryManager } from './training/experiment-registry.js';
import type { ModelVersionManager } from './training/model-version-manager.js';
import type { AbTestManager } from './training/ab-test-manager.js';
import type { ResponsibleAiManager } from './training/responsible-ai-manager.js';
import { initTracing } from './telemetry/otel.js';
import { LicenseManager } from './licensing/license-manager.js';
import type { StrategyStorage } from './soul/strategy-storage.js';
import { AutonomyAuditManager } from './security/autonomy-audit.js';
import { initPoolFromConfig, getPool } from './storage/pg-pool.js';
import { runMigrations } from './storage/migrations/runner.js';
import { closePool } from './storage/pg-pool.js';
import type { Config, TaskCreate, Task, MetricsSnapshot, AuditEntry } from '@secureyeoman/shared';
import { RemoteDelegationTransport } from './a2a/transport.js';

// Type-only re-exports needed for getters that return types from modules we don't directly import
import type { SecretsManager } from './security/secrets-manager.js';
import type { TlsManager } from './security/tls-manager.js';
import type { SecretRotationManager } from './security/rotation/manager.js';
import type { KeyringManager } from './security/keyring/manager.js';
import type { SsoStorage } from './security/sso-storage.js';
import type { SsoManager } from './security/sso-manager.js';
import type { AthiManager } from './security/athi-manager.js';
import type { SraManager } from './security/sra-manager.js';
import type {
  ExternalizationGate,
  QuarantineStorage,
  ScanHistoryStore,
} from './sandbox/scanning/index.js';
import type { McpStorage } from './mcp/storage.js';
import type { McpClientManager } from './mcp/client.js';
import type { McpServer } from './mcp/server.js';
import type { DashboardManager } from './dashboard/manager.js';
import type { WorkspaceManager } from './workspace/manager.js';
import type { ExperimentManager } from './experiment/manager.js';
import type { MarketplaceManager } from './marketplace/manager.js';
import type { ConversationStorage } from './chat/conversation-storage.js';
import type { BranchingManager } from './chat/branching-manager.js';
import type { PersonalityVersionManager } from './soul/personality-version-manager.js';
import type { NotificationManager } from './notifications/notification-manager.js';
import type { UserNotificationPrefsStorage } from './notifications/user-notification-prefs-storage.js';
import type { RiskAssessmentManager } from './risk-assessment/risk-assessment-manager.js';
import type { DepartmentRiskManager } from './risk-assessment/department-risk-manager.js';
import type { ProviderAccountManager } from './ai/provider-account-manager.js';
import type { ProviderHealthTracker } from './ai/provider-health.js';
import type { CostBudgetChecker } from './ai/cost-budget-checker.js';
import type { CostOptimizer } from './ai/cost-optimizer.js';
import type { BackupManager } from './backup/backup-manager.js';
import type { TenantManager } from './tenants/tenant-manager.js';
import type { FederationManager } from './federation/federation-manager.js';
import type { AlertManager } from './telemetry/alert-manager.js';
import type { AlertStorage } from './telemetry/alert-storage.js';
import type { DynamicToolManager } from './soul/dynamic-tool-manager.js';
import type { IntentManager } from './intent/manager.js';
import type { AgentComms } from './comms/agent-comms.js';
import type { GroupChatStorage } from './integrations/group-chat-storage.js';
import type { RoutingRulesStorage } from './integrations/routing-rules-storage.js';
import type { RoutingRulesManager } from './integrations/routing-rules-manager.js';
import type { SystemPreferencesStorage } from './config/system-preferences-storage.js';
import type { AnalyticsStorage } from './analytics/analytics-storage.js';
import type { SentimentAnalyzer } from './analytics/sentiment-analyzer.js';
import type { ConversationSummarizer } from './analytics/conversation-summarizer.js';
import type { EntityExtractor } from './analytics/entity-extractor.js';
import type { EngagementMetricsService } from './analytics/engagement-metrics.js';
import type { UsageAnomalyDetector } from './analytics/usage-anomaly-detector.js';

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

  // --- Domain modules ---
  private auditMod: AuditModule | null = null;
  private securityMod: SecurityModule | null = null;
  private authMod: AuthModule | null = null;
  private brainMod: BrainModule | null = null;
  private bodyMod: BodyModule | null = null;
  private trainingMod: TrainingModule | null = null;
  private analyticsMod: AnalyticsModule | null = null;
  private delegationMod: DelegationModule | null = null;
  private platformMod: PlatformModule | null = null;
  private aiMod: AIModule | null = null;
  private soulMod: SoulModule | null = null;
  private integrationMod: IntegrationModule | null = null;

  // --- Aliases (set from modules, used by many downstream references) ---
  private auditChain: AuditChain | null = null;
  private auditStorage: AuditChainStorage | null = null;
  private rbac: RBAC | null = null;
  private validator: InputValidator | null = null;
  private rateLimiter: RateLimiterLike | null = null;
  private authStorage: AuthStorage | null = null;
  private authService: AuthService | null = null;
  private brainStorage: BrainStorage | null = null;
  private brainManager: BrainManager | null = null;

  // --- Core infrastructure (not extracted to modules) ---
  private taskExecutor: TaskExecutor | null = null;
  private sandboxManager: SandboxManager | null = null;
  private taskStorage: TaskStorage | null = null;
  private gateway: GatewayServer | null = null;
  private licenseManager: LicenseManager = new LicenseManager();
  private initialized = false;
  private startedAt: number | null = null;
  private shutdownPromise: Promise<void> | null = null;

  // --- Standalone optional managers (config-gated, not worth a module) ---
  private proactiveManager: import('./proactive/manager.js').ProactiveManager | null = null;
  private multimodalManager: import('./multimodal/manager.js').MultimodalManager | null = null;
  private browserSessionStorage: import('./browser/storage.js').BrowserSessionStorage | null = null;
  private extensionStorage: ExtensionStorage | null = null;
  private extensionManager: ExtensionManager | null = null;
  private executionStorage: ExecutionStorage | null = null;
  private executionManager: CodeExecutionManager | null = null;
  private a2aStorage: A2AStorage | null = null;
  private a2aManager: A2AManager | null = null;

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

    const startupTimings: Array<{ step: string; ms: number }> = [];
    const mark = (step: string, startMs: number) => {
      startupTimings.push({ step, ms: Math.round(performance.now() - startMs) });
    };

    try {
      let stepStart = performance.now();

      // Step 1: Load and validate configuration
      this.config = loadConfig(this.options.config);
      mark('config', stepStart);

      // Step 1.5: Initialize OpenTelemetry tracing (before any I/O)
      stepStart = performance.now();
      await initTracing({});
      mark('otel', stepStart);

      // Step 2: Initialize logger first (needed for other components)
      this.logger = initializeLogger(this.config.logging);
      this.logger.info('SecureYeoman initializing', {
        environment: this.config.core.environment,
        version: this.config.version,
      });

      // Step 2.05b: Initialize LicenseManager
      const licenseKey = getSecret(this.config.licensing.licenseKeyEnv);
      this.licenseManager = new LicenseManager(licenseKey, this.config.licensing.enforcement);
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

      // Step 2.5–2.06: Initialize security early phase (keyring, secrets, TLS) via SecurityModule
      stepStart = performance.now();
      this.securityMod = new SecurityModule();
      await this.securityMod.init({ config: this.config, logger: this.logger });
      await this.securityMod.initEarly();
      mark('security-early', stepStart);

      // Step 2.1: Initialize PostgreSQL pool and run migrations
      stepStart = performance.now();
      initPoolFromConfig(this.config.core.database);
      await runMigrations();
      mark('db-pool+migrations', stepStart);
      this.logger.debug('PostgreSQL pool initialized and migrations applied');

      // Step 2.2: Load persisted security policy from DB (overrides YAML defaults)
      await this.loadSecurityPolicyFromDb();

      // Step 2.07: Initialize SoulModule early phase (IntentManager)
      this.soulMod = new SoulModule({
        getDepartmentRiskManager: () => this.platformMod?.getDepartmentRiskManager() ?? null,
      });
      await this.soulMod.init({ config: this.config, logger: this.logger });
      await this.soulMod.initEarly();

      // Step 2.08–4: Initialize security core phase (storages, RBAC, validator, rateLimiter)
      await this.securityMod.initCore();
      this.rbac = this.securityMod.getRBAC()!;
      this.validator = this.securityMod.getValidator()!;
      this.rateLimiter = this.securityMod.getRateLimiter()!;

      // Step 2.09–2.11: Initialize PlatformModule early phase (notification, risk storages)
      this.platformMod = new PlatformModule();
      await this.platformMod.init({ config: this.config, logger: this.logger });
      await this.platformMod.initEarly();

      // Step 3: Validate secrets are available
      validateSecrets(this.config);
      this.logger.debug('Secrets validated');

      // Step 5: Initialize audit chain (AuditModule)
      this.auditMod = new AuditModule({ customAuditStorage: this.options.auditStorage });
      await this.auditMod.init({ config: this.config, logger: this.logger });
      this.auditChain = this.auditMod.getAuditChain()!;
      this.auditStorage = this.auditMod.getAuditStorage()!;

      // Step 5.5: Initialize auth service (AuthModule)
      this.authMod = new AuthModule({
        auditChain: this.auditChain,
        rbac: this.rbac,
        rateLimiter: this.rateLimiter,
      });
      await this.authMod.init({ config: this.config, logger: this.logger });
      this.authStorage = this.authMod.getAuthStorage()!;
      this.authService = this.authMod.getAuthService()!;

      // Step 5.5b: Initialize SSO + rotation via SecurityModule
      await this.securityMod.initPostAuth({
        authService: this.authService,
        auditChain: this.auditChain,
      });

      // Step 5.6: Initialize AIModule (system preferences, usage, AI client, model defaults)
      this.aiMod = new AIModule({
        auditChain: this.auditChain,
        getAlertManager: () => this.platformMod?.getAlertManager() ?? null,
        onConfigUpdate: (updater) => {
          if (this.config) {
            this.config = updater(this.config);
          }
        },
      });
      await this.aiMod.init({ config: this.config, logger: this.logger });

      // Steps 5.7–5.7.2: BrainModule (brain storage, cognitive memory, document manager, memory audit, strategy)
      stepStart = performance.now();
      {
        const { BrainModule } = await import('./modules/brain-module.js');
        this.brainMod = new BrainModule({
          auditChain: this.auditChain,
          auditStorage: this.auditStorage,
          getAlertManager: () => this.platformMod?.getAlertManager() ?? null,
        });
        await this.brainMod.init({ config: this.config, logger: this.logger! });
        this.brainStorage = this.brainMod.getBrainStorage();
        this.brainManager = this.brainMod.getBrainManager();
      }
      mark('brain-module', stepStart);

      // Step 5.7.0a: Load persisted license key from brain.meta if env var not set
      if (!getSecret(this.config.licensing.licenseKeyEnv)) {
        try {
          const persistedKey = await this.brainStorage!.getMeta('license:key');
          if (persistedKey) {
            process.env[this.config.licensing.licenseKeyEnv] = persistedKey;
            this.licenseManager = new LicenseManager(
              persistedKey,
              this.config.licensing.enforcement
            );
            this.logger.info('License key loaded from brain.meta', {
              tier: this.licenseManager.getTier(),
            });
          }
        } catch {
          // Non-fatal: license remains at community tier
        }
      }

      // Step 5.7a–5.7b2: SoulModule core phase (spirit, soul, approval, personality version)
      await this.soulMod.initCore({
        auditChain: this.auditChain,
        brainManager: this.brainManager!,
      });

      // Wire SoulManager into AIClient for personality_id tracking
      const soulManager = this.soulMod.getSoulManager();
      if (this.aiMod.getAIClient() && soulManager) {
        this.aiMod.setSoulManager(soulManager);
      }

      // Step 5.7c–5.76: IntegrationModule early phase (storages, agent comms)
      this.integrationMod = new IntegrationModule({
        getAuditChain: () => this.auditChain,
      });
      await this.integrationMod.init({ config: this.config, logger: this.logger });
      await this.integrationMod.initEarly();

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

      // Step 6.5: IntegrationModule core phase (managers, 31 adapters, routing, plugins)
      await this.integrationMod.initCore({
        taskExecutor: this.taskExecutor,
        notificationManager: this.platformMod.getNotificationManager(),
      });

      // Step 6.6: Initialize heartbeat + heart system (BodyModule)
      this.bodyMod = new BodyModule({
        brainManager: this.brainManager!,
        auditChain: this.auditChain!,
        integrationManager: this.integrationMod.getIntegrationManager()!,
        notificationManager: this.platformMod.getNotificationManager(),
        soulManager: soulManager!,
      });
      await this.bodyMod.init({ config: this.config, logger: this.logger });

      // Steps 6.7–6.7.1: Start brain late workers (external sync, memory audit scheduler)
      this.brainMod?.startLateWorkers();

      // Step 6.9: Initialize reporting via AuditModule
      this.auditMod!.initReportGenerator({
        queryTasks: this.taskStorage ? (filter) => this.taskStorage!.listTasks(filter) : undefined,
        queryHeartbeatTasks: this.bodyMod?.getHeartbeatManager()
          ? () => this.bodyMod!.getHeartbeatManager()!.getStatus().tasks
          : undefined,
      });

      // Step 6.9b: Initialize compliance report generator (cross-references audit + DLP)
      const egressStore = this.securityMod?.getDlpManager()?.getEgressStore();
      const classificationStore = this.securityMod?.getClassificationStore();
      if (egressStore && classificationStore) {
        this.auditMod!.initComplianceReportGenerator({ egressStore, classificationStore });
      }

      // Steps 6.9–6.10b: PlatformModule core phase (MCP, dashboard, workspace, experiment, marketplace, chat, branching, dynamic tool)
      const pool = this.getPool();
      await this.platformMod.initCore({
        brainManager: this.brainManager,
        soulManager: soulManager,
        aiClient: this.aiMod.getAIClient(),
        pool,
        strategyStorage: this.brainMod?.getStrategyStorage() ?? null,
      });

      // Step 6.11: Initialize DelegationModule
      {
        const { DelegationModule } = await import('./modules/delegation-module.js');
        this.delegationMod = new DelegationModule({
          getAuditChain: () => this.auditChain,
          getBrainManager: () => this.brainManager,
          getMcpClientManager: () => this.platformMod?.getMcpClientManager() ?? null,
          getAlertManager: () => this.platformMod?.getAlertManager() ?? null,
          getTrainingMod: () => this.trainingMod,
          getMarketplaceManager: () => this.platformMod?.getMarketplaceManager() ?? null,
          getSoulManager: () => this.soulMod?.getSoulManager() ?? null,
        });
        await this.delegationMod.init({ config: this.config, logger: this.logger! });

        const delegationNeeded =
          this.config.delegation?.enabled ||
          this.config.security?.allowSubAgents ||
          this.config.security?.allowSwarms ||
          this.config.security?.allowWorkflows;
        if (delegationNeeded) {
          await this.delegationMod.boot();
        }
      }

      // Step 6.11b: Always seed workflow/swarm templates
      await this.initOptional('Template seeding', async () => {
        await this.delegationMod!.seedTemplates();

        // Wire managers into marketplace for community sync
        const wm = this.delegationMod?.getWorkflowManager();
        const sm = this.delegationMod?.getSwarmManager();
        const mkMgr = this.platformMod?.getMarketplaceManager();
        if (mkMgr && (wm || sm || soulManager)) {
          mkMgr.setDelegationManagers({
            workflowManager: wm ?? undefined,
            swarmManager: sm ?? undefined,
            soulManager: soulManager ?? undefined,
          });
        }
      });

      // Steps 6.12–6.14: Initialize independent config-gated managers in parallel
      {
        const parallelInits: Promise<unknown>[] = [];

        // Step 6.12: Initialize extension hooks (if enabled)
        if (this.config.extensions?.enabled) {
          parallelInits.push(
            this.initOptional('Extension manager', async () => {
              const { ExtensionStorage } = await import('./extensions/storage.js');
              const { ExtensionManager } = await import('./extensions/manager.js');
              this.extensionStorage = new ExtensionStorage();
              this.extensionManager = new ExtensionManager(this.config!.extensions!, {
                storage: this.extensionStorage,
                logger: this.logger!.child({ component: 'ExtensionManager' }),
                auditChain: this.auditChain!,
              });
              await this.extensionManager.initialize();
            })
          );
        }

        // Step 6.13: Initialize code execution (if enabled)
        if (this.config.execution?.enabled) {
          parallelInits.push(
            this.initOptional('Code execution manager', async () => {
              const { ExecutionStorage } = await import('./execution/storage.js');
              const { CodeExecutionManager } = await import('./execution/manager.js');
              this.executionStorage = new ExecutionStorage();
              this.executionManager = new CodeExecutionManager(this.config!.execution!, {
                storage: this.executionStorage,
                logger: this.logger!.child({ component: 'CodeExecutionManager' }),
                auditChain: this.auditChain!,
              });
              await this.executionManager.initialize();
            })
          );
        }

        // Step 6.14: Initialize A2A protocol (if enabled)
        if (this.config.a2a?.enabled) {
          parallelInits.push(
            this.initOptional('A2A manager', async () => {
              const { A2AStorage } = await import('./a2a/storage.js');
              const { A2AManager } = await import('./a2a/manager.js');
              this.a2aStorage = new A2AStorage();
              const transport = new RemoteDelegationTransport({
                logger: this.logger!.child({ component: 'A2ATransport' }),
              });
              this.a2aManager = new A2AManager(this.config!.a2a!, {
                storage: this.a2aStorage,
                transport,
                logger: this.logger!.child({ component: 'A2AManager' }),
                auditChain: this.auditChain!,
              });
              await this.a2aManager.initialize();
            })
          );
        }

        await Promise.allSettled(parallelInits);
      }

      // Step 5.85 + 6e.3 + 6e.4: ExternalizationGate, ATHI, SRA via SecurityModule
      await this.securityMod.initLate({
        auditChain: this.auditChain,
        getAlertManager: () => this.platformMod?.getAlertManager() ?? null,
      });

      // Step 6e.2b: AIModule late phase (providerAccountManager, costOptimizer)
      await this.aiMod.initLate({
        secretsManager: this.securityMod.getSecretsManager(),
        auditChain: this.auditChain,
        getAlertManager: () => this.platformMod?.getAlertManager() ?? null,
      });

      // Steps 6e–6l: PlatformModule late phase (risk/dept managers, backup, tenant, federation, alert)
      await this.platformMod.initLate({
        auditChain: this.auditChain,
        brainManager: this.brainManager,
        soulManager: soulManager,
        getTlsManager: () => this.securityMod?.getTlsManager() ?? null,
        getAlertManager: () => this.platformMod?.getAlertManager() ?? null,
        sandboxManager: this.sandboxManager,
      });

      // Steps 6h–6j-3: TrainingModule (distillation, finetune, ML pipeline, LLM judge, lifecycle)
      stepStart = performance.now();
      if (this.config.training?.enabled !== false) {
        const { TrainingModule } = await import('./modules/training-module.js');
        this.trainingMod = new TrainingModule({
          getAlertManager: () => this.platformMod?.getAlertManager() ?? null,
          aiClient: this.aiMod.getAIClient(),
          notificationManager: this.platformMod.getNotificationManager(),
          chatConversationStorage: this.platformMod.getConversationStorage(),
          soulStorage: null, // SoulStorage is internal to SoulModule
        });
        await this.trainingMod.init({ config: this.config, logger: this.logger! });
        this.logger.debug('TrainingModule initialized');
      } else {
        this.logger.info('TrainingModule skipped (training.enabled=false)');
      }
      mark('training-module', stepStart);

      // Step 6m: Initialize Conversation Analytics (AnalyticsModule)
      stepStart = performance.now();
      if (this.config.analytics?.enabled !== false) {
        const { AnalyticsModule } = await import('./modules/analytics-module.js');
        this.analyticsMod = new AnalyticsModule({ aiClient: this.aiMod.getAIClient() });
        await this.analyticsMod.init({ config: this.config, logger: this.logger });
      } else {
        this.logger.info('AnalyticsModule skipped (analytics.enabled=false)');
      }
      mark('analytics-module', stepStart);

      // Step 6b: Initialize Proactive Manager
      if (this.config.security.allowProactive || this.config.proactive?.enabled) {
        await this.initOptional('Proactive manager', async () => {
          const { ProactiveStorage } = await import('./proactive/storage.js');
          const { ProactiveManager } = await import('./proactive/manager.js');
          const { PatternLearner } = await import('./proactive/pattern-learner.js');
          const proactiveStorage = new ProactiveStorage();
          const patternLearner = new PatternLearner(
            this.brainManager!,
            this.logger!.child({ component: 'PatternLearner' })
          );
          this.proactiveManager = new ProactiveManager(
            proactiveStorage,
            {
              logger: this.logger!.child({ component: 'ProactiveManager' }),
              brainManager: this.brainManager!,
              integrationManager: this.integrationMod?.getIntegrationManager() ?? undefined,
            },
            this.config!.proactive ?? {},
            patternLearner
          );
          await this.proactiveManager.initialize();
        });
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
            aiClient: this.aiMod.getAIClient()!,
            extensionManager: this.extensionManager ?? undefined,
          };
          this.multimodalManager = new MultimodalManager(
            multimodalStorage,
            mmDeps,
            this.config.multimodal ?? {}
          );
          await this.multimodalManager.initialize();
          this.logger.debug('Multimodal manager initialized');
        } catch (error) {
          this.logger.warn('Multimodal manager initialization failed (non-fatal)', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Step 6c.2: Wire multimodal/soul into IntegrationModule
      this.integrationMod.initLateWiring({
        multimodalManager: this.multimodalManager,
        soulManager: soulManager,
      });

      // Step 6d: Initialize Browser Session Storage
      {
        let browserEnabled = false;
        const mcpStorage = this.platformMod.getMcpStorage();
        if (mcpStorage) {
          try {
            const mcpCfg = await mcpStorage.getConfig();
            browserEnabled = mcpCfg.exposeBrowser;
          } catch {
            // ignore — default to false
          }
        }
        if (browserEnabled) {
          await this.initOptional('Browser session storage', async () => {
            const { BrowserSessionStorage } = await import('./browser/storage.js');
            this.browserSessionStorage = new BrowserSessionStorage();
            await this.browserSessionStorage.ensureTables();
          });
        }
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
      stepStart = performance.now();
      if (this.options.enableGateway) {
        await this.startGateway();
      }
      mark('gateway', stepStart);

      // Log startup timing table
      const totalMs = startupTimings.reduce((sum, t) => sum + t.ms, 0);
      this.logger.info('Startup profiling complete', {
        totalMs,
        steps: startupTimings,
        top5: startupTimings
          .sort((a, b) => b.ms - a.ms)
          .slice(0, 5)
          .map((t) => `${t.step}: ${t.ms}ms`),
      });

      this.logger.info('SecureYeoman initialized successfully', {
        environment: this.config.core.environment,
        gatewayEnabled: this.options.enableGateway ?? false,
      });
    } catch (error) {
      if (this.logger) {
        this.logger.fatal('SecureYeoman initialization failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
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

    const auditStats = await this.auditChain!.getStats();
    const rateLimitStats = this.rateLimiter!.getStats();
    const aiClient = this.aiMod?.getAIClient();
    const aiStats = aiClient?.getUsageStats();
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
        cpuPercent: (() => {
          const now = Date.now();
          const elapsedMs = now - this._lastCpuSampleAt;
          const delta = process.cpuUsage(this._lastCpuUsage);
          this._lastCpuUsage = process.cpuUsage();
          this._lastCpuSampleAt = now;
          if (elapsedMs <= 0) return 0;
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
        apiLatencyP50Ms: aiStats?.apiLatencyPercentiles?.p50 ?? 0,
        apiLatencyP95Ms: aiStats?.apiLatencyPercentiles?.p95 ?? 0,
        apiLatencyP99Ms: aiStats?.apiLatencyPercentiles?.p99 ?? 0,
      },
      security: {
        authAttemptsTotal: authStats.authAttemptsTotal,
        authSuccessTotal: authStats.authSuccessTotal,
        authFailuresTotal: authStats.authFailuresTotal,
        activeSessions: 0,
        permissionChecksTotal: 0,
        permissionDenialsTotal: 0,
        blockedRequestsTotal: rateLimitStats.totalHits,
        rateLimitHitsTotal: rateLimitStats.totalHits,
        injectionAttemptsTotal: 0,
        eventsBySeverity: {},
        eventsByType: {},
        auditEntriesTotal: auditStats.entriesCount,
        auditChainValid: auditStats.chainValid,
        lastAuditVerification: auditStats.lastVerification,
      },
      // Sandbox scanning metrics (Phase 116)
      ...(this.securityMod?.getScanHistoryStore()
        ? await (async () => {
            try {
              const stats = await this.securityMod!.getScanHistoryStore()!.getStats();
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
            } catch (err) {
              this.logger?.debug('getMetrics: scan history stats unavailable', {
                error: err instanceof Error ? err.message : String(err),
              });
              return {};
            }
          })()
        : {}),
      // Per-personality activity heatmap (Phase 83)
      ...(aiStats?.byPersonality && aiStats.byPersonality.length > 0
        ? { personalityActivity: aiStats.byPersonality }
        : {}),
      // Departmental risk metrics (Phase 111)
      ...(this.platformMod?.getDepartmentRiskManager()
        ? await (async () => {
            try {
              const summary =
                await this.platformMod!.getDepartmentRiskManager()!.getExecutiveSummary();
              return {
                departmentalRisk: {
                  departmentCount: summary.totalDepartments,
                  openRegisterEntries: summary.totalOpenRisks,
                  overdueEntries: summary.totalOverdueRisks,
                  appetiteBreaches: summary.appetiteBreaches,
                },
              };
            } catch (err) {
              this.logger?.debug('getMetrics: department risk summary unavailable', {
                error: err instanceof Error ? err.message : String(err),
              });
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
    return this.aiMod?.getAIClient()?.getUsageStats();
  }

  /**
   * Reset a usage stat counter to zero.
   */
  async resetUsageStat(stat: 'errors' | 'latency'): Promise<void> {
    this.ensureInitialized();
    const tracker = this.aiMod?.getAIClient()?.getUsageTracker();
    if (!tracker) throw new Error('Usage tracker not available');
    if (stat === 'errors') {
      await tracker.resetErrors();
    } else {
      await tracker.resetLatency();
    }
  }

  // ------------------------------------------------------------------
  // Audit delegations
  // ------------------------------------------------------------------

  async queryAuditLog(options: AuditQueryOptions = {}): Promise<AuditQueryResult> {
    this.ensureInitialized();
    return this.auditMod!.queryAuditLog(options);
  }

  async verifyAuditChain(): Promise<{ valid: boolean; entriesChecked: number; error?: string }> {
    this.ensureInitialized();
    return this.auditMod!.verifyAuditChain();
  }

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
    return this.auditMod!.getAuditStats();
  }

  async repairAuditChain(): Promise<{ repairedCount: number; entriesTotal: number }> {
    this.ensureInitialized();
    return this.auditMod!.repairAuditChain();
  }

  async enforceAuditRetention(opts: { maxAgeDays?: number; maxEntries?: number }): Promise<number> {
    this.ensureInitialized();
    return this.auditMod!.enforceAuditRetention(opts);
  }

  async exportAuditLog(opts?: {
    from?: number;
    to?: number;
    limit?: number;
  }): Promise<AuditEntry[]> {
    this.ensureInitialized();
    return this.auditMod!.exportAuditLog(opts);
  }

  // ------------------------------------------------------------------
  // Getters — core infrastructure
  // ------------------------------------------------------------------

  getLogger(): SecureLogger {
    this.ensureInitialized();
    return this.logger!;
  }
  getRBAC(): RBAC {
    this.ensureInitialized();
    return this.rbac!;
  }
  getAuditChain(): AuditChain {
    this.ensureInitialized();
    return this.auditChain!;
  }
  getValidator(): InputValidator {
    this.ensureInitialized();
    return this.validator!;
  }
  getRateLimiter(): RateLimiterLike {
    this.ensureInitialized();
    return this.rateLimiter!;
  }
  getConfig(): Config {
    this.ensureInitialized();
    return this.config!;
  }
  getGateway(): GatewayServer | null {
    return this.gateway;
  }
  getTaskExecutor(): TaskExecutor | null {
    return this.taskExecutor;
  }
  getLicenseManager(): LicenseManager {
    return this.licenseManager;
  }

  getDataDir(): string {
    this.ensureInitialized();
    return this.config!.core.dataDir;
  }

  getPool(): import('pg').Pool | null {
    try {
      return getPool();
    } catch {
      return null;
    }
  }

  getAuditStorage(): AuditChainStorage | null {
    return this.auditStorage;
  }
  getReportGenerator(): AuditReportGenerator | null {
    this.ensureInitialized();
    return this.auditMod?.getReportGenerator() ?? null;
  }
  getComplianceReportGenerator() {
    this.ensureInitialized();
    return this.auditMod?.getComplianceReportGenerator() ?? null;
  }

  // ------------------------------------------------------------------
  // Getters — SecurityModule delegations
  // ------------------------------------------------------------------

  getSecretsManager(): SecretsManager | null {
    return this.securityMod?.getSecretsManager() ?? null;
  }
  getTlsManager(): TlsManager | null {
    return this.securityMod?.getTlsManager() ?? null;
  }
  getRotationManager(): SecretRotationManager | null {
    return this.securityMod?.getRotationManager() ?? null;
  }
  getKeyringManager(): KeyringManager | null {
    return this.securityMod?.getKeyringManager() ?? null;
  }
  getSsoStorage(): SsoStorage | null {
    this.ensureInitialized();
    return this.securityMod?.getSsoStorage() ?? null;
  }
  getSsoManager(): SsoManager | null {
    this.ensureInitialized();
    return this.securityMod?.getSsoManager() ?? null;
  }
  getAthiManager(): AthiManager | null {
    this.ensureInitialized();
    return this.securityMod?.getAthiManager() ?? null;
  }
  getSraManager(): SraManager | null {
    this.ensureInitialized();
    return this.securityMod?.getSraManager() ?? null;
  }
  getClassificationEngine() {
    this.ensureInitialized();
    return this.securityMod?.getClassificationEngine() ?? null;
  }
  getClassificationStore() {
    this.ensureInitialized();
    return this.securityMod?.getClassificationStore() ?? null;
  }
  getDlpManager() {
    this.ensureInitialized();
    return this.securityMod?.getDlpManager() ?? null;
  }
  getDlpPolicyStore() {
    this.ensureInitialized();
    return this.securityMod?.getDlpPolicyStore() ?? null;
  }
  getWatermarkEngine() {
    this.ensureInitialized();
    return this.securityMod?.getWatermarkEngine() ?? null;
  }
  getWatermarkStore() {
    this.ensureInitialized();
    return this.securityMod?.getWatermarkStore() ?? null;
  }
  getRetentionStore() {
    this.ensureInitialized();
    return this.securityMod?.getRetentionStore() ?? null;
  }
  getRetentionManager() {
    this.ensureInitialized();
    return this.securityMod?.getRetentionManager() ?? null;
  }
  getExternalizationGate(): ExternalizationGate | null {
    this.ensureInitialized();
    return this.securityMod?.getExternalizationGate() ?? null;
  }
  getQuarantineStorage(): QuarantineStorage | null {
    this.ensureInitialized();
    return this.securityMod?.getQuarantineStorage() ?? null;
  }
  getScanHistoryStore(): ScanHistoryStore | null {
    this.ensureInitialized();
    return this.securityMod?.getScanHistoryStore() ?? null;
  }

  getAutonomyAuditManager(): AutonomyAuditManager | null {
    this.ensureInitialized();
    return (
      this.securityMod?.getOrCreateAutonomyAuditManager(
        this.soulMod?.getSoulManager() ?? null,
        this.delegationMod?.getWorkflowManager() ?? null,
        this.auditChain
      ) ?? null
    );
  }

  // ------------------------------------------------------------------
  // Getters — AuthModule delegations
  // ------------------------------------------------------------------

  getAuthService(): AuthService {
    this.ensureInitialized();
    if (!this.authService) throw new Error('Auth service is not available');
    return this.authService;
  }

  getAuthStorage(): AuthStorage {
    this.ensureInitialized();
    if (!this.authStorage) throw new Error('Auth storage not available');
    return this.authStorage;
  }

  // ------------------------------------------------------------------
  // Getters — AIModule delegations
  // ------------------------------------------------------------------

  getAIClient(): AIClient {
    this.ensureInitialized();
    const client = this.aiMod?.getAIClient();
    if (!client)
      throw new Error('AI client is not available. Check provider configuration and API keys.');
    return client;
  }

  getUsageStorage(): UsageStorage | null {
    return this.aiMod?.getUsageStorage() ?? null;
  }
  getCostOptimizer(): CostOptimizer | null {
    this.ensureInitialized();
    return this.aiMod?.getCostOptimizer() ?? null;
  }
  getCostCalculator() {
    this.ensureInitialized();
    return this.aiMod?.getAIClient()?.getCostCalculator() ?? null;
  }
  getProviderAccountManager(): ProviderAccountManager | null {
    this.ensureInitialized();
    return this.aiMod?.getProviderAccountManager() ?? null;
  }
  getProviderHealthTracker(): ProviderHealthTracker {
    return this.aiMod!.getProviderHealthTracker();
  }
  getCostBudgetChecker(): CostBudgetChecker | null {
    return this.aiMod?.getCostBudgetChecker() ?? null;
  }
  getSystemPreferences(): SystemPreferencesStorage | null {
    return this.aiMod?.getSystemPreferences() ?? null;
  }

  switchModel(provider: string, model: string): void {
    this.ensureInitialized();
    this.aiMod!.switchModel(provider, model);
  }

  async setModelDefault(provider: string, model: string): Promise<void> {
    this.ensureInitialized();
    await this.aiMod!.setModelDefault(provider, model);
  }

  async clearModelDefault(): Promise<void> {
    this.ensureInitialized();
    await this.aiMod!.clearModelDefault();
  }

  getModelDefault(): { provider: string; model: string } | null {
    return this.aiMod?.getModelDefault() ?? null;
  }

  async setLocalFirst(enabled: boolean): Promise<void> {
    this.ensureInitialized();
    await this.aiMod!.setLocalFirst(enabled);
  }

  getLocalFirst(): boolean {
    return this.aiMod?.getLocalFirst() ?? false;
  }

  // ------------------------------------------------------------------
  // Getters — BrainModule delegations
  // ------------------------------------------------------------------

  getBrainManager(): BrainManager {
    this.ensureInitialized();
    if (!this.brainManager) throw new Error('Brain manager is not available');
    return this.brainManager;
  }

  getBrainStorage(): BrainStorage | null {
    return this.brainStorage;
  }
  getCognitiveMemoryManager(): CognitiveMemoryManager | null {
    return this.brainMod?.getCognitiveMemoryManager() ?? null;
  }
  getCognitiveMemoryStorage(): CognitiveMemoryStorage | null {
    return this.brainMod?.getCognitiveMemoryStorage() ?? null;
  }
  getDocumentManager(): DocumentManager {
    this.ensureInitialized();
    const dm = this.brainMod?.getDocumentManager();
    if (!dm) throw new Error('Document manager is not available');
    return dm;
  }
  getMemoryAuditScheduler(): import('./brain/audit/scheduler.js').MemoryAuditScheduler | null {
    return this.brainMod?.getMemoryAuditScheduler() ?? null;
  }
  getMemoryAuditStorage(): import('./brain/audit/audit-store.js').MemoryAuditStorage | null {
    return this.brainMod?.getMemoryAuditStorage() ?? null;
  }
  getExternalBrainSync(): ExternalBrainSync | null {
    this.ensureInitialized();
    return this.brainMod?.getExternalBrainSync() ?? null;
  }
  getStrategyStorage(): StrategyStorage {
    this.ensureInitialized();
    const ss = this.brainMod?.getStrategyStorage();
    if (!ss) throw new Error('Strategy storage not initialized');
    return ss;
  }

  // ------------------------------------------------------------------
  // Getters — SoulModule delegations
  // ------------------------------------------------------------------

  getSpiritManager(): SpiritManager {
    this.ensureInitialized();
    const sm = this.soulMod?.getSpiritManager();
    if (!sm) throw new Error('Spirit manager is not available');
    return sm;
  }

  getSoulManager(): SoulManager {
    this.ensureInitialized();
    const sm = this.soulMod?.getSoulManager();
    if (!sm) throw new Error('Soul manager is not available');
    return sm;
  }

  getApprovalManager(): ApprovalManager {
    this.ensureInitialized();
    const am = this.soulMod?.getApprovalManager();
    if (!am) throw new Error('Approval manager is not available');
    return am;
  }

  getPersonalityVersionManager(): PersonalityVersionManager | null {
    this.ensureInitialized();
    return this.soulMod?.getPersonalityVersionManager() ?? null;
  }

  getIntentManager(): IntentManager | null {
    this.ensureInitialized();
    return this.soulMod?.getIntentManager() ?? null;
  }

  // ------------------------------------------------------------------
  // Getters — IntegrationModule delegations
  // ------------------------------------------------------------------

  getIntegrationManager(): IntegrationManager {
    this.ensureInitialized();
    const im = this.integrationMod?.getIntegrationManager();
    if (!im) throw new Error('Integration manager is not available');
    return im;
  }

  getIntegrationStorage(): IntegrationStorage {
    this.ensureInitialized();
    const is = this.integrationMod?.getIntegrationStorage();
    if (!is) throw new Error('Integration storage is not available');
    return is;
  }

  getMessageRouter(): MessageRouter | null {
    return this.integrationMod?.getMessageRouter() ?? null;
  }
  getGroupChatStorage(): GroupChatStorage | null {
    return this.integrationMod?.getGroupChatStorage() ?? null;
  }
  getRoutingRulesStorage(): RoutingRulesStorage | null {
    return this.integrationMod?.getRoutingRulesStorage() ?? null;
  }
  getRoutingRulesManager(): RoutingRulesManager | null {
    return this.integrationMod?.getRoutingRulesManager() ?? null;
  }
  getAgentComms(): AgentComms | null {
    this.ensureInitialized();
    return this.integrationMod?.getAgentComms() ?? null;
  }

  // ------------------------------------------------------------------
  // Getters — PlatformModule delegations
  // ------------------------------------------------------------------

  getMcpStorage(): McpStorage | null {
    this.ensureInitialized();
    return this.platformMod?.getMcpStorage() ?? null;
  }
  getMcpClientManager(): McpClientManager | null {
    this.ensureInitialized();
    return this.platformMod?.getMcpClientManager() ?? null;
  }
  getMcpServer(): McpServer | null {
    this.ensureInitialized();
    return this.platformMod?.getMcpServer() ?? null;
  }
  getDashboardManager(): DashboardManager | null {
    this.ensureInitialized();
    return this.platformMod?.getDashboardManager() ?? null;
  }
  getWorkspaceManager(): WorkspaceManager | null {
    this.ensureInitialized();
    return this.platformMod?.getWorkspaceManager() ?? null;
  }
  getExperimentManager(): ExperimentManager | null {
    this.ensureInitialized();
    return this.platformMod?.getExperimentManager() ?? null;
  }
  getMarketplaceManager(): MarketplaceManager | null {
    this.ensureInitialized();
    return this.platformMod?.getMarketplaceManager() ?? null;
  }
  getConversationStorage(): ConversationStorage | null {
    this.ensureInitialized();
    return this.platformMod?.getConversationStorage() ?? null;
  }
  getBranchingManager(): BranchingManager | null {
    this.ensureInitialized();
    return this.platformMod?.getBranchingManager() ?? null;
  }
  getNotificationManager(): NotificationManager | null {
    this.ensureInitialized();
    return this.platformMod?.getNotificationManager() ?? null;
  }
  getUserNotificationPrefsStorage(): UserNotificationPrefsStorage | null {
    this.ensureInitialized();
    return this.platformMod?.getUserNotificationPrefsStorage() ?? null;
  }
  getRiskAssessmentManager(): RiskAssessmentManager | null {
    this.ensureInitialized();
    return this.platformMod?.getRiskAssessmentManager() ?? null;
  }
  getDepartmentRiskManager(): DepartmentRiskManager | null {
    this.ensureInitialized();
    return this.platformMod?.getDepartmentRiskManager() ?? null;
  }
  getBackupManager(): BackupManager | null {
    this.ensureInitialized();
    return this.platformMod?.getBackupManager() ?? null;
  }
  getTenantManager(): TenantManager | null {
    this.ensureInitialized();
    return this.platformMod?.getTenantManager() ?? null;
  }
  getFederationManager(): FederationManager | null {
    return this.platformMod?.getFederationManager() ?? null;
  }
  getAlertManager(): AlertManager | null {
    return this.platformMod?.getAlertManager() ?? null;
  }
  getAlertStorage(): AlertStorage | null {
    return this.platformMod?.getAlertStorage() ?? null;
  }
  getDynamicToolManager(): DynamicToolManager | null {
    this.ensureInitialized();
    return this.platformMod?.getDynamicToolManager() ?? null;
  }
  getEventDispatcher(): import('./events/event-dispatcher.js').EventDispatcher | null {
    this.ensureInitialized();
    return this.platformMod?.getEventDispatcher() ?? null;
  }
  getEventSubscriptionStore(): import('./events/event-subscription-store.js').EventSubscriptionStore | null {
    this.ensureInitialized();
    return this.platformMod?.getEventSubscriptionStore() ?? null;
  }

  // ------------------------------------------------------------------
  // Getters — DelegationModule delegations
  // ------------------------------------------------------------------

  getSubAgentManager(): SubAgentManager | null {
    this.ensureInitialized();
    return this.delegationMod?.getSubAgentManager() ?? null;
  }
  getSwarmManager(): SwarmManager | null {
    this.ensureInitialized();
    return this.delegationMod?.getSwarmManager() ?? null;
  }
  getSwarmStorage(): SwarmStorage | null {
    this.ensureInitialized();
    return this.delegationMod?.getSwarmStorage() ?? null;
  }
  getSubAgentStorage(): SubAgentStorage | null {
    this.ensureInitialized();
    return this.delegationMod?.getSubAgentStorage() ?? null;
  }
  getTeamManager(): TeamManager | null {
    this.ensureInitialized();
    return this.delegationMod?.getTeamManager() ?? null;
  }
  getCouncilManager(): CouncilManager | null {
    this.ensureInitialized();
    return this.delegationMod?.getCouncilManager() ?? null;
  }
  getWorkflowManager(): WorkflowManager | null {
    this.ensureInitialized();
    return this.delegationMod?.getWorkflowManager() ?? null;
  }
  getWorkflowVersionManager(): WorkflowVersionManager | null {
    this.ensureInitialized();
    return this.delegationMod?.getWorkflowVersionManager() ?? null;
  }

  // ------------------------------------------------------------------
  // Getters — TrainingModule delegations
  // ------------------------------------------------------------------

  getDistillationManager(): DistillationManager | null {
    this.ensureInitialized();
    return this.trainingMod?.getDistillationManager() ?? null;
  }
  getFinetuneManager(): FinetuneManager | null {
    this.ensureInitialized();
    return this.trainingMod?.getFinetuneManager() ?? null;
  }
  getDataCurationManager(): DataCurationManager | null {
    this.ensureInitialized();
    return this.trainingMod?.getDataCurationManager() ?? null;
  }
  getEvaluationManager(): EvaluationManager | null {
    this.ensureInitialized();
    return this.trainingMod?.getEvaluationManager() ?? null;
  }
  getPipelineApprovalManager(): PipelineApprovalManager | null {
    this.ensureInitialized();
    return this.trainingMod?.getPipelineApprovalManager() ?? null;
  }
  getPipelineLineageStorage(): PipelineLineageStorage | null {
    this.ensureInitialized();
    return this.trainingMod?.getPipelineLineageStorage() ?? null;
  }
  getLlmJudgeManager(): LlmJudgeManager | null {
    this.ensureInitialized();
    return this.trainingMod?.getLlmJudgeManager() ?? null;
  }
  getPreferenceManager(): PreferenceManager | null {
    this.ensureInitialized();
    return this.trainingMod?.getPreferenceManager() ?? null;
  }
  getDatasetCuratorManager(): DatasetCuratorManager | null {
    this.ensureInitialized();
    return this.trainingMod?.getDatasetCuratorManager() ?? null;
  }
  getExperimentRegistryManager(): ExperimentRegistryManager | null {
    this.ensureInitialized();
    return this.trainingMod?.getExperimentRegistryManager() ?? null;
  }
  getModelVersionManager(): ModelVersionManager | null {
    this.ensureInitialized();
    return this.trainingMod?.getModelVersionManager() ?? null;
  }
  getAbTestManager(): AbTestManager | null {
    this.ensureInitialized();
    return this.trainingMod?.getAbTestManager() ?? null;
  }
  getResponsibleAiManager(): ResponsibleAiManager | null {
    this.ensureInitialized();
    return this.trainingMod?.getResponsibleAiManager() ?? null;
  }
  getConversationQualityScorer(): ConversationQualityScorer | null {
    this.ensureInitialized();
    return this.trainingMod?.getConversationQualityScorer() ?? null;
  }
  getComputerUseManager(): ComputerUseManager | null {
    this.ensureInitialized();
    return this.trainingMod?.getComputerUseManager() ?? null;
  }
  getCaptureAuditLogger(): CaptureAuditLogger | null {
    return this.trainingMod?.getCaptureAuditLogger() ?? null;
  }
  getDesktopTrainingBridge(): DesktopTrainingBridge | null {
    return this.trainingMod?.getDesktopTrainingBridge() ?? null;
  }
  getCheckpointStore() {
    this.ensureInitialized();
    return this.trainingMod?.getCheckpointStore() ?? null;
  }
  getHyperparamSearchManager() {
    this.ensureInitialized();
    return this.trainingMod?.getHyperparamSearchManager() ?? null;
  }
  getDatasetRefreshManager() {
    this.ensureInitialized();
    return this.trainingMod?.getDatasetRefreshManager() ?? null;
  }
  getDriftDetectionManager() {
    this.ensureInitialized();
    return this.trainingMod?.getDriftDetectionManager() ?? null;
  }
  getOnlineUpdateManager() {
    this.ensureInitialized();
    return this.trainingMod?.getOnlineUpdateManager() ?? null;
  }
  getBatchInferenceManager() {
    this.ensureInitialized();
    return this.aiMod?.getBatchInferenceManager() ?? null;
  }
  getSemanticCache() {
    this.ensureInitialized();
    return this.aiMod?.getSemanticCache() ?? null;
  }
  getKvCacheWarmer() {
    this.ensureInitialized();
    return this.aiMod?.getKvCacheWarmer() ?? null;
  }

  // ------------------------------------------------------------------
  // Getters — AnalyticsModule delegations
  // ------------------------------------------------------------------

  getAnalyticsStorage(): AnalyticsStorage | null {
    this.ensureInitialized();
    return this.analyticsMod?.getAnalyticsStorage() ?? null;
  }
  getSentimentAnalyzer(): SentimentAnalyzer | null {
    this.ensureInitialized();
    return this.analyticsMod?.getSentimentAnalyzer() ?? null;
  }
  getConversationSummarizer(): ConversationSummarizer | null {
    this.ensureInitialized();
    return this.analyticsMod?.getConversationSummarizer() ?? null;
  }
  getEntityExtractor(): EntityExtractor | null {
    this.ensureInitialized();
    return this.analyticsMod?.getEntityExtractor() ?? null;
  }
  getEngagementMetricsService(): EngagementMetricsService | null {
    this.ensureInitialized();
    return this.analyticsMod?.getEngagementMetricsService() ?? null;
  }
  getUsageAnomalyDetector(): UsageAnomalyDetector | null {
    this.ensureInitialized();
    return this.analyticsMod?.getUsageAnomalyDetector() ?? null;
  }

  // ------------------------------------------------------------------
  // Getters — BodyModule delegations
  // ------------------------------------------------------------------

  getHeartbeatManager(): HeartbeatManager | null {
    this.ensureInitialized();
    return this.bodyMod?.getHeartbeatManager() ?? null;
  }
  getHeartbeatLogStorage(): HeartbeatLogStorage | null {
    this.ensureInitialized();
    return this.bodyMod?.getHeartbeatLogStorage() ?? null;
  }

  // ------------------------------------------------------------------
  // Getters — standalone optional managers
  // ------------------------------------------------------------------

  getSandboxManager(): SandboxManager {
    this.ensureInitialized();
    if (!this.sandboxManager) throw new Error('Sandbox manager is not available');
    return this.sandboxManager;
  }

  getTaskStorage(): TaskStorage {
    this.ensureInitialized();
    if (!this.taskStorage) throw new Error('Task storage is not available');
    return this.taskStorage;
  }

  getExtensionManager(): ExtensionManager | null {
    this.ensureInitialized();
    return this.extensionManager;
  }
  getExecutionManager(): CodeExecutionManager | null {
    this.ensureInitialized();
    return this.executionManager;
  }
  getA2AManager(): A2AManager | null {
    this.ensureInitialized();
    return this.a2aManager;
  }
  getProactiveManager(): import('./proactive/manager.js').ProactiveManager | null {
    this.ensureInitialized();
    return this.proactiveManager;
  }
  getMultimodalManager(): import('./multimodal/manager.js').MultimodalManager | null {
    this.ensureInitialized();
    return this.multimodalManager;
  }
  getBrowserSessionStorage(): import('./browser/storage.js').BrowserSessionStorage | null {
    this.ensureInitialized();
    return this.browserSessionStorage;
  }

  // ------------------------------------------------------------------
  // License management
  // ------------------------------------------------------------------

  reloadLicenseKey(key: string): void {
    this.ensureInitialized();
    this.licenseManager = new LicenseManager(key, this.config!.licensing.enforcement);
    this.logger?.info('License key reloaded', { tier: this.licenseManager.getTier() });
  }

  // ------------------------------------------------------------------
  // Delegation boot
  // ------------------------------------------------------------------

  async ensureDelegationReady(): Promise<void> {
    if (this.delegationMod && !this.delegationMod.isBooted()) {
      await this.delegationMod.boot();
    }
  }

  // ------------------------------------------------------------------
  // Security policy (stays in secureyeoman.ts — mutates shared config)
  // ------------------------------------------------------------------

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
      if (updates.allowSubAgents && this.config!.delegation) {
        this.config!.delegation.enabled = true;
      }
      if (updates.allowSubAgents && this.delegationMod && !this.delegationMod.isBooted()) {
        void this.ensureDelegationReady();
      }
    }
    if (updates.allowA2A !== undefined) this.config!.security.allowA2A = updates.allowA2A;
    if (updates.allowSwarms !== undefined) this.config!.security.allowSwarms = updates.allowSwarms;
    if (updates.allowExtensions !== undefined)
      this.config!.security.allowExtensions = updates.allowExtensions;
    if (updates.allowExecution !== undefined)
      this.config!.security.allowExecution = updates.allowExecution;
    if (updates.allowProactive !== undefined)
      this.config!.security.allowProactive = updates.allowProactive;
    if (updates.allowWorkflows !== undefined)
      this.config!.security.allowWorkflows = updates.allowWorkflows;
    if (updates.allowExperiments !== undefined)
      this.config!.security.allowExperiments = updates.allowExperiments;
    if (updates.allowStorybook !== undefined)
      this.config!.security.allowStorybook = updates.allowStorybook;
    if (updates.allowMultimodal !== undefined)
      this.config!.security.allowMultimodal = updates.allowMultimodal;
    if (updates.allowDesktopControl !== undefined)
      this.config!.security.allowDesktopControl = updates.allowDesktopControl;
    if (updates.allowCamera !== undefined) this.config!.security.allowCamera = updates.allowCamera;
    if (updates.allowDynamicTools !== undefined)
      this.config!.security.allowDynamicTools = updates.allowDynamicTools;
    if (updates.sandboxDynamicTools !== undefined)
      this.config!.security.sandboxDynamicTools = updates.sandboxDynamicTools;
    if (updates.allowAnomalyDetection !== undefined)
      this.config!.security.allowAnomalyDetection = updates.allowAnomalyDetection;
    if (updates.sandboxGvisor !== undefined)
      this.config!.security.sandboxGvisor = updates.sandboxGvisor;
    if (updates.sandboxWasm !== undefined) this.config!.security.sandboxWasm = updates.sandboxWasm;
    if (updates.sandboxCredentialProxy !== undefined)
      this.config!.security.sandboxCredentialProxy = updates.sandboxCredentialProxy;
    if (updates.allowCommunityGitFetch !== undefined) {
      this.config!.security.allowCommunityGitFetch = updates.allowCommunityGitFetch;
      this.platformMod?.getMarketplaceManager()?.updatePolicy({
        allowCommunityGitFetch: updates.allowCommunityGitFetch,
      });
    }
    if (updates.communityGitUrl !== undefined) {
      this.config!.security.communityGitUrl = updates.communityGitUrl;
      this.platformMod
        ?.getMarketplaceManager()
        ?.updatePolicy({ communityGitUrl: updates.communityGitUrl });
    }
    if (updates.allowNetworkTools !== undefined)
      this.config!.security.allowNetworkTools = updates.allowNetworkTools;
    if (updates.allowNetBoxWrite !== undefined)
      this.config!.security.allowNetBoxWrite = updates.allowNetBoxWrite;
    if (updates.allowTwingate !== undefined)
      this.config!.security.allowTwingate = updates.allowTwingate;
    if (updates.allowOrgIntent !== undefined)
      this.config!.security.allowOrgIntent = updates.allowOrgIntent;
    if (updates.allowIntentEditor !== undefined)
      this.config!.security.allowIntentEditor = updates.allowIntentEditor;
    if (updates.allowCodeEditor !== undefined)
      this.config!.security.allowCodeEditor = updates.allowCodeEditor;
    if (updates.allowAdvancedEditor !== undefined)
      this.config!.security.allowAdvancedEditor = updates.allowAdvancedEditor;
    if (updates.allowTrainingExport !== undefined)
      this.config!.security.allowTrainingExport = updates.allowTrainingExport;
    if (updates.promptGuardMode !== undefined)
      this.config!.security.promptGuard.mode = updates.promptGuardMode;
    if (updates.responseGuardMode !== undefined)
      this.config!.security.responseGuard.mode = updates.responseGuardMode;
    if (updates.jailbreakThreshold !== undefined)
      this.config!.security.inputValidation.jailbreakThreshold = updates.jailbreakThreshold;
    if (updates.jailbreakAction !== undefined)
      this.config!.security.inputValidation.jailbreakAction = updates.jailbreakAction;
    if (updates.strictSystemPromptConfidentiality !== undefined)
      this.config!.security.strictSystemPromptConfidentiality =
        updates.strictSystemPromptConfidentiality;
    if (updates.abuseDetectionEnabled !== undefined)
      this.config!.security.abuseDetection.enabled = updates.abuseDetectionEnabled;
    if (updates.contentGuardrailsEnabled !== undefined)
      this.config!.security.contentGuardrails.enabled = updates.contentGuardrailsEnabled;
    if (updates.contentGuardrailsPiiMode !== undefined)
      this.config!.security.contentGuardrails.piiMode = updates.contentGuardrailsPiiMode;
    if (updates.contentGuardrailsToxicityEnabled !== undefined)
      this.config!.security.contentGuardrails.toxicityEnabled =
        updates.contentGuardrailsToxicityEnabled;
    if (updates.contentGuardrailsToxicityMode !== undefined)
      this.config!.security.contentGuardrails.toxicityMode = updates.contentGuardrailsToxicityMode;
    if (updates.contentGuardrailsToxicityClassifierUrl !== undefined)
      this.config!.security.contentGuardrails.toxicityClassifierUrl =
        updates.contentGuardrailsToxicityClassifierUrl;
    if (updates.contentGuardrailsToxicityThreshold !== undefined)
      this.config!.security.contentGuardrails.toxicityThreshold =
        updates.contentGuardrailsToxicityThreshold;
    if (updates.contentGuardrailsBlockList !== undefined)
      this.config!.security.contentGuardrails.blockList = updates.contentGuardrailsBlockList;
    if (updates.contentGuardrailsBlockedTopics !== undefined)
      this.config!.security.contentGuardrails.blockedTopics =
        updates.contentGuardrailsBlockedTopics;
    if (updates.contentGuardrailsGroundingEnabled !== undefined)
      this.config!.security.contentGuardrails.groundingEnabled =
        updates.contentGuardrailsGroundingEnabled;
    if (updates.contentGuardrailsGroundingMode !== undefined)
      this.config!.security.contentGuardrails.groundingMode =
        updates.contentGuardrailsGroundingMode;

    this.logger?.info('Security policy updated', updates);

    const { communityGitUrl: _url, ...persistableUpdates } = updates;
    void this.persistSecurityPolicyToDb(persistableUpdates as Record<string, unknown>);

    void this.auditChain?.record({
      event: 'security_policy_changed',
      level: 'info',
      message: `Security policy updated: ${JSON.stringify(updates)}`,
      metadata: updates,
    });
  }

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
        let val: unknown;
        try { val = JSON.parse(row.value); } catch { continue; }
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

  // ------------------------------------------------------------------
  // Gateway
  // ------------------------------------------------------------------

  async startGateway(): Promise<void> {
    this.ensureInitialized();
    if (this.gateway) throw new Error('Gateway is already running');

    let gatewayConfig = this.config!.gateway;
    const tlsMgr = this.securityMod?.getTlsManager();
    if (tlsMgr) {
      const certPaths = await tlsMgr.ensureCerts();
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

  async stopGateway(): Promise<void> {
    if (!this.gateway) return;
    await this.gateway.stop();
    this.gateway = null;
    this.logger?.info('Gateway server stopped');
  }

  // ------------------------------------------------------------------
  // Shutdown
  // ------------------------------------------------------------------

  async shutdown(): Promise<void> {
    if (this.shutdownPromise) return this.shutdownPromise;
    this.shutdownPromise = this.performShutdown();
    return this.shutdownPromise;
  }

  private async performShutdown(): Promise<void> {
    if (!this.initialized) return;
    this.logger?.info('SecureYeoman shutting down');
    try {
      if (this.auditChain) {
        await this.auditChain.record({
          event: 'system_shutdown',
          level: 'info',
          message: 'SecureYeoman shutdown initiated',
          metadata: { uptime: this.startedAt ? Date.now() - this.startedAt : 0 },
        });
      }
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

  // ------------------------------------------------------------------
  // Cleanup
  // ------------------------------------------------------------------

  private async cleanup(): Promise<void> {
    // Stop gateway first (stops accepting requests)
    if (this.gateway) {
      await this.gateway.stop();
      this.gateway = null;
    }

    // Clean up independent modules in parallel
    const independentCleanups: Promise<void>[] = [];

    const cleanupModule = async (mod: { cleanup(): Promise<void> } | null): Promise<void> => {
      if (mod) await mod.cleanup();
    };

    independentCleanups.push(cleanupModule(this.securityMod));
    independentCleanups.push(cleanupModule(this.trainingMod));
    independentCleanups.push(cleanupModule(this.analyticsMod));
    independentCleanups.push(cleanupModule(this.bodyMod));
    independentCleanups.push(cleanupModule(this.aiMod));
    independentCleanups.push(cleanupModule(this.soulMod));
    independentCleanups.push(cleanupModule(this.integrationMod));
    independentCleanups.push(cleanupModule(this.platformMod));
    independentCleanups.push(cleanupModule(this.delegationMod));
    independentCleanups.push(cleanupModule(this.brainMod));
    independentCleanups.push(cleanupModule(this.executionManager));
    independentCleanups.push(cleanupModule(this.a2aManager));
    independentCleanups.push(cleanupModule(this.authMod));
    independentCleanups.push(cleanupModule(this.auditMod));

    await Promise.all(independentCleanups);

    // Null out module refs
    this.securityMod = null;
    this.rbac = null;
    this.validator = null;
    this.rateLimiter = null;
    this.trainingMod = null;
    this.analyticsMod = null;
    this.bodyMod = null;
    this.aiMod = null;
    this.soulMod = null;
    this.integrationMod = null;
    this.platformMod = null;
    this.delegationMod = null;
    this.brainMod = null;
    this.brainStorage = null;
    this.brainManager = null;
    this.executionManager = null;
    this.a2aManager = null;
    this.authMod = null;
    this.authStorage = null;
    this.authService = null;
    this.auditMod = null;
    this.auditChain = null;
    this.auditStorage = null;

    // Synchronous closes for storages and standalone managers
    if (this.taskStorage) { this.taskStorage.close(); this.taskStorage = null; }
    if (this.extensionStorage) { this.extensionStorage.close(); this.extensionStorage = null; this.extensionManager = null; }
    if (this.executionStorage) { this.executionStorage.close(); this.executionStorage = null; }
    if (this.a2aStorage) { this.a2aStorage.close(); this.a2aStorage = null; }
    if (this.proactiveManager) { this.proactiveManager.close(); this.proactiveManager = null; }
    if (this.multimodalManager) { this.multimodalManager.close(); this.multimodalManager = null; }
    if (this.browserSessionStorage) { this.browserSessionStorage.close(); this.browserSessionStorage = null; }

    // Close PostgreSQL pool last
    await closePool();
  }

  private async initOptional<T>(name: string, init: () => Promise<T> | T): Promise<T | null> {
    try {
      const result = await init();
      this.logger!.debug(`${name} initialized`);
      return result;
    } catch (error) {
      this.logger!.warn(`${name} initialization failed (non-fatal)`, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

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
