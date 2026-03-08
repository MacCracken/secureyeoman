/**
 * SecurityModule — owns keyring, secrets, TLS, rotation, RBAC, validator,
 * rateLimiter, SSO, ATHI, SRA, scanning, and autonomy audit fields.
 *
 * Extracted from SecureYeoman Steps 2.5–2.13, 4, 5.55, 5.6, 5.85, 6e.3, 6e.4.
 *
 * Multi-phase init:
 *   1. initEarly()  — keyring, secrets, TLS (before DB)
 *   2. initCore()   — storages + RBAC/validator/rateLimiter (after DB migrations)
 *   3. initPostAuth() — rotation, SSO (after audit+auth ready)
 *   4. initLate()   — externalizationGate, athiManager, sraManager
 */

import { type ModuleContext } from './types.js';
import type { SecureLogger } from '../logging/logger.js';
import type { Config } from '@secureyeoman/shared';
import {
  loadConfig,
  initializeKeyring,
  requireSecret,
  type LoadConfigOptions,
} from '../config/loader.js';
import type { KeyringManager } from '../security/keyring/manager.js';
import { SecretsManager, type SecretsManagerConfig } from '../security/secrets-manager.js';
import { TlsManager } from '../security/tls-manager.js';
import { SecretRotationManager } from '../security/rotation/manager.js';
import { RotationStorage } from '../security/rotation/rotation-storage.js';
import type { SecretMetadata } from '../security/rotation/types.js';
import { RBACStorage } from '../security/rbac-storage.js';
import { initializeRBAC, type RBAC } from '../security/rbac.js';
import { createValidator, type InputValidator } from '../security/input-validator.js';
import { createRateLimiter, type RateLimiterLike } from '../security/rate-limiter.js';
import { SsoStorage } from '../security/sso-storage.js';
import { SsoManager } from '../security/sso-manager.js';
import { AthiStorage } from '../security/athi-storage.js';
import { AthiManager } from '../security/athi-manager.js';
import { SraStorage } from '../security/sra-storage.js';
import { SraManager } from '../security/sra-manager.js';
import { AutonomyAuditStorage, AutonomyAuditManager } from '../security/autonomy-audit.js';
import {
  CodeScanner,
  SecretsScanner,
  DataScanner,
  ScannerPipeline,
  ExternalizationGate,
  QuarantineStorage,
  ScanHistoryStore,
} from '../sandbox/scanning/index.js';
import { ClassificationEngine } from '../security/dlp/classification-engine.js';
import { ClassificationStore } from '../security/dlp/classification-store.js';
import { DlpPolicyStore } from '../security/dlp/dlp-policy-store.js';
import { EgressStore } from '../security/dlp/egress-store.js';
import { DlpScanner } from '../security/dlp/dlp-scanner.js';
import { DlpManager } from '../security/dlp/dlp-manager.js';
import { WatermarkEngine } from '../security/dlp/watermark-engine.js';
import { WatermarkStore } from '../security/dlp/watermark-store.js';
import { RetentionStore } from '../security/dlp/retention-store.js';
import { RetentionManager } from '../security/dlp/retention-manager.js';
import { getPool } from '../storage/pg-pool.js';
import type { AuditChain } from '../logging/audit-chain.js';
import type { AuthService } from '../security/auth.js';
import type { AlertManager } from '../telemetry/alert-manager.js';
import type { SoulManager } from '../soul/manager.js';
import type { WorkflowManager } from '../workflow/workflow-manager.js';
import type { AppModule } from './types.js';

// ------------------------------------------------------------------
// Dependency interfaces for each init phase
// ------------------------------------------------------------------

export interface SecurityPostAuthDeps {
  authService: AuthService;
  auditChain: AuditChain;
}

export interface SecurityLateDeps {
  auditChain: AuditChain;
  getAlertManager: () => AlertManager | null;
}

// ------------------------------------------------------------------
// SecurityModule
// ------------------------------------------------------------------

export class SecurityModule implements AppModule {
  private config!: Config;
  private logger!: SecureLogger;

  // --- Phase 1: early (pre-DB) ---
  private keyringManager: KeyringManager | null = null;
  private secretsManager: SecretsManager | null = null;
  private tlsManager: TlsManager | null = null;

  // --- Phase 2: core (post-DB) ---
  private rbacStorage: RBACStorage | null = null;
  private rbac: RBAC | null = null;
  private validator: InputValidator | null = null;
  private rateLimiter: RateLimiterLike | null = null;
  private autonomyAuditStorage: AutonomyAuditStorage | null = null;
  private autonomyAuditManager: AutonomyAuditManager | null = null;
  private athiStorage: AthiStorage | null = null;
  private athiManager: AthiManager | null = null;
  private sraStorage: SraStorage | null = null;
  private sraManager: SraManager | null = null;
  private scanHistoryStore: ScanHistoryStore | null = null;
  private quarantineStorage: QuarantineStorage | null = null;

  // --- Phase 3: post-auth ---
  private rotationStorage: RotationStorage | null = null;
  private rotationManager: SecretRotationManager | null = null;
  private ssoStorage: SsoStorage | null = null;
  private ssoManager: SsoManager | null = null;

  // --- DLP (Phase 136) ---
  private classificationEngine: ClassificationEngine | null = null;
  private classificationStore: ClassificationStore | null = null;
  private dlpPolicyStore: DlpPolicyStore | null = null;
  private egressStore: EgressStore | null = null;
  private dlpScanner: DlpScanner | null = null;
  private dlpManager: DlpManager | null = null;
  private watermarkEngine: WatermarkEngine | null = null;
  private watermarkStore: WatermarkStore | null = null;
  private retentionStore: RetentionStore | null = null;
  private retentionManager: RetentionManager | null = null;

  // --- Phase 4: late ---
  private externalizationGate: ExternalizationGate | null = null;

  // ------------------------------------------------------------------
  // Multi-phase init
  // ------------------------------------------------------------------

  /** Phase 0 — store context (required by AppModule). Actual init is multi-phase. */
  async init(ctx: ModuleContext): Promise<void> {
    this.config = ctx.config;
    this.logger = ctx.logger;
    // Callers must invoke initEarly(), initCore(), initPostAuth(), initLate() explicitly.
  }

  /** Phase 1: keyring, secrets, TLS — runs before DB init. */
  async initEarly(): Promise<void> {
    // Keyring
    const knownSecretKeys = [
      this.config.gateway.auth.tokenSecret,
      this.config.gateway.auth.adminPasswordEnv,
      this.config.logging.audit.signingKeyEnv,
      this.config.security.encryption.keyEnv,
      this.config.model.apiKeyEnv,
    ];
    this.keyringManager = initializeKeyring(this.config.security.secretBackend, knownSecretKeys);
    this.logger.debug(
      {
        backend: this.keyringManager.getProvider().name,
      },
      'Keyring initialized'
    );

    // SecretsManager
    const vaultCfg = this.config.security.vault;
    const smConfig: SecretsManagerConfig = {
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
    this.logger.debug(
      {
        backend: this.config.security.secretBackend,
      },
      'SecretsManager initialized'
    );

    // TlsManager
    const tlsCfg = this.config.gateway.tls;
    this.tlsManager = new TlsManager({
      enabled: tlsCfg.enabled,
      certPath: tlsCfg.certPath,
      keyPath: tlsCfg.keyPath,
      caPath: tlsCfg.caPath,
      autoGenerate: tlsCfg.autoGenerate,
      certDir: `${this.config.core.dataDir}/tls`,
    });
    this.logger.debug({ tlsEnabled: tlsCfg.enabled }, 'TlsManager initialized');
  }

  /** Phase 2: RBAC, validator, rateLimiter, all early storages — after DB migrations. */
  async initCore(): Promise<void> {
    // Storages (zero-arg constructors)
    this.autonomyAuditStorage = new AutonomyAuditStorage();
    this.athiStorage = new AthiStorage();
    this.logger.debug('AthiStorage initialized');
    this.sraStorage = new SraStorage();
    this.logger.debug('SraStorage initialized');
    this.scanHistoryStore = new ScanHistoryStore();
    const dataDir = this.config.core?.dataDir ?? '~/.secureyeoman/data';
    this.quarantineStorage = new QuarantineStorage(dataDir);
    this.logger.debug('ScanHistoryStore + QuarantineStorage initialized');

    // DLP Classification (Phase 136)
    this.classificationStore = new ClassificationStore();
    const dlpCfg = this.config.security.dlp;
    this.classificationEngine = new ClassificationEngine(dlpCfg?.classification ?? {}, {
      logger: this.logger.child({ component: 'ClassificationEngine' }),
    });
    this.logger.debug('DLP classification engine initialized');

    // DLP Outbound Scanning (Phase 136-B)
    this.dlpPolicyStore = new DlpPolicyStore();
    this.egressStore = new EgressStore();
    this.dlpScanner = new DlpScanner(this.classificationEngine, this.dlpPolicyStore);
    this.dlpManager = new DlpManager({
      scanner: this.dlpScanner,
      policyStore: this.dlpPolicyStore,
      egressStore: this.egressStore,
      classificationStore: this.classificationStore,
      logger: this.logger.child({ component: 'DlpManager' }),
    });
    this.logger.debug('DLP outbound scanning initialized');

    // DLP Watermarking (Phase 136-E)
    this.watermarkEngine = new WatermarkEngine();
    this.watermarkStore = new WatermarkStore();
    this.logger.debug('DLP watermark engine initialized');

    // DLP Retention (Phase 136-D)
    this.retentionStore = new RetentionStore();
    this.retentionManager = new RetentionManager({
      retentionStore: this.retentionStore,
      logger: this.logger.child({ component: 'RetentionManager' }),
    });
    this.logger.debug('DLP retention manager initialized');

    // RBAC
    this.rbacStorage = new RBACStorage();
    this.rbac = await initializeRBAC(undefined, this.rbacStorage);
    this.logger.debug('RBAC initialized with persistent storage');

    // Validator & rate limiter
    this.validator = createValidator(this.config.security);
    this.logger.debug('Input validator initialized');
    this.rateLimiter = createRateLimiter(this.config.security);
    this.logger.debug('Rate limiter initialized');
  }

  /** Phase 3: rotation + SSO — after audit chain and auth service are ready. */
  async initPostAuth(deps: SecurityPostAuthDeps): Promise<void> {
    // SSO
    this.ssoStorage = new SsoStorage();
    this.ssoManager = new SsoManager({
      storage: this.ssoStorage,
      authService: deps.authService,
      logger: this.logger.child({ component: 'SsoManager' }),
    });
    this.logger.debug('SSO manager initialized');

    // Secret rotation (conditional)
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
      const authSvc = deps.authService;
      const auditCh = deps.auditChain;
      const tokenSecretEnv = this.config.gateway.auth.tokenSecret;
      const signingKeyEnv = this.config.logging.audit.signingKeyEnv;
      const secretsMgr = this.secretsManager;

      this.rotationManager.setCallbacks({
        onRotate: async (name, newValue) => {
          await secretsMgr?.set(name, newValue);
          if (name === tokenSecretEnv) {
            authSvc.updateTokenSecret(newValue);
          } else if (name === signingKeyEnv) {
            await auditCh.updateSigningKey(newValue);
          }
        },
        onWarning: (name, daysLeft) => {
          this.logger?.warn({ name, daysLeft }, 'Secret expiring soon');
        },
      });

      this.rotationManager.start();
      this.logger.debug('Secret rotation manager started');
    }
  }

  /** Phase 4: externalizationGate, athiManager, sraManager — after alertManager may exist. */
  async initLate(deps: SecurityLateDeps): Promise<void> {
    // ExternalizationGate (non-fatal)
    try {
      const scanPolicy = this.config.security.sandboxArtifactScanning ?? {};
      const pipeline = new ScannerPipeline(
        [new CodeScanner(), new SecretsScanner(), new DataScanner()],
        { policy: scanPolicy }
      );
      this.externalizationGate = new ExternalizationGate({
        pipeline,
        quarantineStorage: this.quarantineStorage,
        scanHistoryStore: this.scanHistoryStore,
        secretsScanner: new SecretsScanner(),
        policy: scanPolicy,
        getAlertManager: () =>
          deps.getAlertManager()
            ? {
                fire: (
                  type: string,
                  severity: string,
                  message: string,
                  meta?: Record<string, unknown>
                ) => {
                  void deps.getAlertManager()!.evaluate({ [type]: 1 });
                },
              }
            : null,
        auditChain: deps.auditChain
          ? {
              record: async (
                event: string,
                level: string,
                message: string,
                metadata?: Record<string, unknown>
              ): Promise<void> => {
                await deps.auditChain.record({
                  event,
                  level: level as 'info' | 'warn' | 'error' | 'security' | 'debug' | 'trace',
                  message,
                  metadata,
                });
              },
            }
          : null,
      });
      this.logger.debug('ExternalizationGate initialized');
    } catch (err) {
      this.logger.warn(
        {
          reason: err instanceof Error ? err.message : String(err),
        },
        'ExternalizationGate initialization failed'
      );
    }

    // AthiManager
    if (this.athiStorage) {
      try {
        const pool = getPool();
        this.athiManager = new AthiManager({
          storage: this.athiStorage,
          pool,
          auditChain: deps.auditChain,
          getAlertManager: deps.getAlertManager,
        });
        this.logger.debug('AthiManager initialized');
      } catch (error) {
        this.logger.warn(
          {
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          'AthiManager initialization failed (non-fatal)'
        );
      }
    }

    // SraManager
    if (this.sraStorage) {
      try {
        const pool = getPool();
        this.sraManager = new SraManager({
          storage: this.sraStorage,
          pool,
          auditChain: deps.auditChain,
          getAlertManager: deps.getAlertManager,
        });
        await this.sraManager.seedBuiltinBlueprints();
        await this.sraManager.seedComplianceMappings();
        this.logger.debug('SraManager initialized');
      } catch (error) {
        this.logger.warn(
          {
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          'SraManager initialization failed (non-fatal)'
        );
      }
    }

    // Start retention manager timer (Phase 136-D)
    if (this.retentionManager) {
      this.retentionManager.start();
    }
  }

  // ------------------------------------------------------------------
  // Lazy init helpers
  // ------------------------------------------------------------------

  /** Lazy-init the autonomy audit manager (depends on late-bound managers). */
  getOrCreateAutonomyAuditManager(
    soulManager: SoulManager | null,
    workflowManager: WorkflowManager | null,
    auditChain: AuditChain | null
  ): AutonomyAuditManager | null {
    if (!this.autonomyAuditManager && this.autonomyAuditStorage) {
      this.autonomyAuditManager = new AutonomyAuditManager(
        this.autonomyAuditStorage,
        soulManager,
        workflowManager,
        auditChain
      );
    }
    return this.autonomyAuditManager;
  }

  // ------------------------------------------------------------------
  // Cleanup
  // ------------------------------------------------------------------

  async cleanup(): Promise<void> {
    // Rate limiter
    if (this.rateLimiter) {
      this.rateLimiter.stop();
    }

    // RBAC cache
    if (this.rbac) {
      this.rbac.clearCache();
    }
    if (this.rbacStorage) {
      this.rbacStorage.close();
      this.rbacStorage = null;
    }

    // Rotation
    if (this.rotationManager) {
      this.rotationManager.stop();
      this.rotationManager = null;
    }
    if (this.rotationStorage) {
      this.rotationStorage.close();
      this.rotationStorage = null;
    }

    // SSO
    if (this.ssoStorage) {
      this.ssoStorage.close();
      this.ssoStorage = null;
      this.ssoManager = null;
    }

    // ATHI
    if (this.athiStorage) {
      this.athiStorage.close();
      this.athiStorage = null;
      this.athiManager = null;
    }

    // SRA
    if (this.sraStorage) {
      this.sraStorage.close();
      this.sraStorage = null;
      this.sraManager = null;
    }

    // Autonomy audit
    if (this.autonomyAuditStorage) {
      this.autonomyAuditStorage.close();
      this.autonomyAuditStorage = null;
      this.autonomyAuditManager = null;
    }

    // Scanning
    if (this.scanHistoryStore) {
      this.scanHistoryStore.close();
      this.scanHistoryStore = null;
    }
    if (this.quarantineStorage) {
      this.quarantineStorage.close();
      this.quarantineStorage = null;
    }
    this.externalizationGate = null;

    // DLP
    if (this.classificationStore) {
      this.classificationStore.close();
      this.classificationStore = null;
    }
    this.classificationEngine = null;

    if (this.dlpPolicyStore) {
      this.dlpPolicyStore.close();
      this.dlpPolicyStore = null;
    }
    if (this.egressStore) {
      this.egressStore.close();
      this.egressStore = null;
    }
    this.dlpScanner = null;
    this.dlpManager = null;

    if (this.watermarkStore) {
      this.watermarkStore.close();
      this.watermarkStore = null;
    }
    this.watermarkEngine = null;

    // Retention (Phase 136-D)
    if (this.retentionManager) {
      this.retentionManager.stop();
      this.retentionManager = null;
    }
    if (this.retentionStore) {
      this.retentionStore.close();
      this.retentionStore = null;
    }
  }

  // ------------------------------------------------------------------
  // Getters
  // ------------------------------------------------------------------

  getKeyringManager(): KeyringManager | null {
    return this.keyringManager;
  }
  getSecretsManager(): SecretsManager | null {
    return this.secretsManager;
  }
  getTlsManager(): TlsManager | null {
    return this.tlsManager;
  }
  getRotationManager(): SecretRotationManager | null {
    return this.rotationManager;
  }
  getRBAC(): RBAC | null {
    return this.rbac;
  }
  getRBACStorage(): RBACStorage | null {
    return this.rbacStorage;
  }
  getValidator(): InputValidator | null {
    return this.validator;
  }
  getRateLimiter(): RateLimiterLike | null {
    return this.rateLimiter;
  }
  getSsoStorage(): SsoStorage | null {
    return this.ssoStorage;
  }
  getSsoManager(): SsoManager | null {
    return this.ssoManager;
  }
  getAthiManager(): AthiManager | null {
    return this.athiManager;
  }
  getSraManager(): SraManager | null {
    return this.sraManager;
  }
  getAutonomyAuditStorage(): AutonomyAuditStorage | null {
    return this.autonomyAuditStorage;
  }
  getAutonomyAuditManager(): AutonomyAuditManager | null {
    return this.autonomyAuditManager;
  }
  getScanHistoryStore(): ScanHistoryStore | null {
    return this.scanHistoryStore;
  }
  getQuarantineStorage(): QuarantineStorage | null {
    return this.quarantineStorage;
  }
  getExternalizationGate(): ExternalizationGate | null {
    return this.externalizationGate;
  }
  getClassificationEngine(): ClassificationEngine | null {
    return this.classificationEngine;
  }
  getClassificationStore(): ClassificationStore | null {
    return this.classificationStore;
  }
  getDlpManager(): DlpManager | null {
    return this.dlpManager;
  }
  getDlpPolicyStore(): DlpPolicyStore | null {
    return this.dlpPolicyStore;
  }
  getWatermarkEngine(): WatermarkEngine | null {
    return this.watermarkEngine;
  }
  getWatermarkStore(): WatermarkStore | null {
    return this.watermarkStore;
  }
  getRetentionStore(): RetentionStore | null {
    return this.retentionStore;
  }
  getRetentionManager(): RetentionManager | null {
    return this.retentionManager;
  }
}
