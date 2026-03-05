/**
 * BrainModule — owns brain storage/manager, cognitive memory, document manager,
 * memory audit, external sync, and strategy storage.
 *
 * Extracted from SecureYeoman Steps 5.7–6.7.
 */

import { BaseModule } from './types.js';
import { BrainStorage } from '../brain/storage.js';
import { BrainManager } from '../brain/manager.js';
import { DocumentManager } from '../brain/document-manager.js';
import { CognitiveMemoryStorage } from '../brain/cognitive-memory-store.js';
import { CognitiveMemoryManager } from '../brain/cognitive-memory-manager.js';
import { ExternalBrainSync } from '../brain/external-sync.js';
import { StrategyStorage } from '../soul/strategy-storage.js';
import type { AuditChain } from '../logging/audit-chain.js';
import type { AuditChainStorage } from '../logging/audit-chain.js';
import type { AlertManager } from '../telemetry/alert-manager.js';

export interface BrainModuleDeps {
  auditChain?: AuditChain | null;
  auditStorage?: AuditChainStorage | null;
  getAlertManager: () => AlertManager | null;
}

export class BrainModule extends BaseModule {
  private brainStorage: BrainStorage | null = null;
  private brainManager: BrainManager | null = null;
  private cognitiveMemoryStorage: CognitiveMemoryStorage | null = null;
  private cognitiveMemoryManager: CognitiveMemoryManager | null = null;
  private documentManager: DocumentManager | null = null;
  private memoryAuditStorage: import('../brain/audit/audit-store.js').MemoryAuditStorage | null =
    null;
  private memoryAuditScheduler: import('../brain/audit/scheduler.js').MemoryAuditScheduler | null =
    null;
  private externalBrainSync: ExternalBrainSync | null = null;
  private strategyStorage: StrategyStorage | null = null;

  constructor(private readonly deps: BrainModuleDeps) {
    super();
  }

  protected async doInit(): Promise<void> {
    // Step 5.7: Brain storage
    this.brainStorage = new BrainStorage();

    // Step 5.7.0: Cognitive memory storage (before BrainManager)
    if (this.config.brain?.cognitiveMemory?.enabled) {
      this.cognitiveMemoryStorage = new CognitiveMemoryStorage();
      this.logger.debug('Cognitive memory storage initialized');
    }

    // BrainManager
    this.brainManager = new BrainManager(this.brainStorage, this.config.brain, {
      auditChain: this.deps.auditChain!,
      logger: this.logger.child({ component: 'BrainManager' }),
      auditStorage:
        this.deps.auditStorage &&
        'queryEntries' in this.deps.auditStorage &&
        'searchFullText' in this.deps.auditStorage
          ? (this.deps.auditStorage as unknown as import('../brain/types.js').AuditStorage)
          : undefined,
      cognitiveStorage: this.cognitiveMemoryStorage ?? undefined,
    });
    this.logger.debug('Brain manager initialized');

    // Step 5.7.0b: Cognitive memory manager
    if (this.cognitiveMemoryStorage) {
      this.cognitiveMemoryManager = new CognitiveMemoryManager({
        storage: this.cognitiveMemoryStorage,
        logger: this.logger.child({ component: 'CognitiveMemoryManager' }),
      });
      this.cognitiveMemoryManager.start();
      this.logger.debug('Cognitive memory manager started');
    }

    // Step 5.7.1: Document manager
    this.documentManager = new DocumentManager({
      brainManager: this.brainManager,
      storage: this.brainStorage,
      logger: this.logger.child({ component: 'DocumentManager' }),
    });
    this.logger.debug('Document manager initialized');

    // Step 5.7.2: Memory audit system (Phase 118)
    if (this.config.brain?.audit?.enabled) {
      try {
        const { MemoryAuditStorage } = await import('../brain/audit/audit-store.js');
        const { MemoryAuditPolicy } = await import('../brain/audit/policy.js');
        const { MemoryAuditEngine } = await import('../brain/audit/engine.js');
        const { MemoryAuditScheduler } = await import('../brain/audit/scheduler.js');
        const { MemoryCompressor } = await import('../brain/audit/compressor.js');
        const { MemoryReorganizer } = await import('../brain/audit/reorganizer.js');
        const { KnowledgeGraphCoherenceChecker } =
          await import('../brain/audit/coherence-checker.js');

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
          getAlertManager: this.deps.getAlertManager,
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

    // Strategy storage (initialized alongside brain)
    this.strategyStorage = new StrategyStorage();
    this.logger.debug('Strategy storage initialized');
  }

  /** Start late-bound background workers that depend on other modules. */
  startLateWorkers(): void {
    // Step 6.7: External brain sync
    if (this.config.externalBrain?.enabled && this.config.externalBrain.path && this.brainManager) {
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

    // Step 6.7.1: Start memory audit scheduler
    if (this.memoryAuditScheduler) {
      this.memoryAuditScheduler.start();
      this.logger.debug('Memory audit scheduler started');
    }
  }

  async cleanup(): Promise<void> {
    // Stop external brain sync
    if (this.externalBrainSync) {
      this.externalBrainSync.stop();
      this.externalBrainSync = null;
    }

    // Stop memory audit
    if (this.memoryAuditScheduler) {
      this.memoryAuditScheduler.stop();
      this.memoryAuditScheduler = null;
    }
    if (this.memoryAuditStorage) {
      this.memoryAuditStorage.close();
      this.memoryAuditStorage = null;
    }

    // Stop cognitive memory
    if (this.cognitiveMemoryManager) {
      this.cognitiveMemoryManager.stop();
      this.cognitiveMemoryManager = null;
    }
    if (this.cognitiveMemoryStorage) {
      this.cognitiveMemoryStorage.close();
      this.cognitiveMemoryStorage = null;
    }

    // Close brain storage
    if (this.brainStorage) {
      this.brainStorage.close();
      this.brainStorage = null;
      this.brainManager = null;
      this.documentManager = null;
    }

    // Close strategy storage
    if (this.strategyStorage) {
      this.strategyStorage.close();
      this.strategyStorage = null;
    }
  }

  // --- Getters ---
  getBrainStorage(): BrainStorage | null {
    return this.brainStorage;
  }
  getBrainManager(): BrainManager | null {
    return this.brainManager;
  }
  getCognitiveMemoryStorage(): CognitiveMemoryStorage | null {
    return this.cognitiveMemoryStorage;
  }
  getCognitiveMemoryManager(): CognitiveMemoryManager | null {
    return this.cognitiveMemoryManager;
  }
  getDocumentManager(): DocumentManager | null {
    return this.documentManager;
  }
  getMemoryAuditStorage(): import('../brain/audit/audit-store.js').MemoryAuditStorage | null {
    return this.memoryAuditStorage;
  }
  getMemoryAuditScheduler(): import('../brain/audit/scheduler.js').MemoryAuditScheduler | null {
    return this.memoryAuditScheduler;
  }
  getExternalBrainSync(): ExternalBrainSync | null {
    return this.externalBrainSync;
  }
  getStrategyStorage(): StrategyStorage | null {
    return this.strategyStorage;
  }
}
