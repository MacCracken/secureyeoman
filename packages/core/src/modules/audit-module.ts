/**
 * AuditModule — owns audit chain, audit storage, crypto pool, and report generator.
 *
 * Extracted from SecureYeoman Steps 5 and 6.9.
 */

import { BaseModule } from './types.js';
import {
  AuditChain,
  type AuditChainStorage,
  type AuditQueryOptions,
  type AuditQueryResult,
} from '../logging/audit-chain.js';
import { SQLiteAuditStorage } from '../logging/sqlite-storage.js';
import { CryptoPool } from '../utils/crypto-pool.js';
import {
  AuditReportGenerator,
  type AuditReportGeneratorDeps,
} from '../reporting/audit-report.js';
import { requireSecret } from '../config/loader.js';
import { getPool } from '../storage/pg-pool.js';
import type { AuditEntry } from '@secureyeoman/shared';

/** Default cap on audit entries returned by exportAuditLog. */
const AUDIT_EXPORT_DEFAULT_LIMIT = 100_000;

/** External deps needed at construction time. */
export interface AuditModuleDeps {
  /** User-provided audit storage override (from SecureYeomanOptions). */
  customAuditStorage?: AuditChainStorage;
}

/** Deps injected after other modules are ready, for report generator. */
export type AuditModuleLateDeps = Pick<AuditReportGeneratorDeps, 'queryTasks' | 'queryHeartbeatTasks'>;

export class AuditModule extends BaseModule {
  private auditStorage: AuditChainStorage | null = null;
  private auditChain: AuditChain | null = null;
  private cryptoPool: CryptoPool | null = null;
  private reportGenerator: AuditReportGenerator | null = null;

  constructor(private readonly deps: AuditModuleDeps) {
    super();
  }

  protected async doInit(): Promise<void> {
    const signingKey = requireSecret(this.config.logging.audit.signingKeyEnv);
    const storage = this.deps.customAuditStorage ?? new SQLiteAuditStorage();
    this.auditStorage = storage;

    this.cryptoPool = new CryptoPool({ poolSize: 2 });
    this.auditChain = new AuditChain({
      storage,
      signingKey,
      repairOnInit: true,
      cryptoPool: this.cryptoPool,
    });
    await this.auditChain.initialize();
    this.logger.debug('Audit chain initialized');
  }

  /** Initialize the report generator (called after other modules are wired). */
  initReportGenerator(lateDeps: AuditModuleLateDeps): void {
    this.reportGenerator = new AuditReportGenerator({
      logger: this.logger.child({ component: 'AuditReportGenerator' }),
      auditChain: this.auditChain!,
      queryAuditLog: (opts) => this.queryAuditLog(opts),
      queryTasks: lateDeps.queryTasks,
      queryHeartbeatTasks: lateDeps.queryHeartbeatTasks,
    });
    this.logger.debug('Audit report generator initialized');
  }

  async cleanup(): Promise<void> {
    if (this.cryptoPool) {
      await this.cryptoPool.close();
      this.cryptoPool = null;
    }
    this.reportGenerator = null;
    // Close audit storage if it supports closing
    if (
      this.auditStorage &&
      'close' in this.auditStorage &&
      typeof (this.auditStorage as Record<string, unknown>).close === 'function'
    ) {
      (this.auditStorage as { close(): void }).close();
      this.auditStorage = null;
    }
    this.auditChain = null;
  }

  // --- Public audit operations ---

  async queryAuditLog(options: AuditQueryOptions = {}): Promise<AuditQueryResult> {
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

  async verifyAuditChain(): Promise<{ valid: boolean; entriesChecked: number; error?: string }> {
    return this.auditChain!.verify();
  }

  async repairAuditChain(): Promise<{ repairedCount: number; entriesTotal: number }> {
    return this.auditChain!.repair();
  }

  async enforceAuditRetention(opts: { maxAgeDays?: number; maxEntries?: number }): Promise<number> {
    if (this.auditStorage && this.auditStorage instanceof SQLiteAuditStorage) {
      return await this.auditStorage.enforceRetention(opts);
    }
    return 0;
  }

  async exportAuditLog(opts?: {
    from?: number;
    to?: number;
    limit?: number;
  }): Promise<AuditEntry[]> {
    const result = await this.queryAuditLog({
      from: opts?.from,
      to: opts?.to,
      limit: opts?.limit ?? AUDIT_EXPORT_DEFAULT_LIMIT,
      offset: 0,
      order: 'asc' as const,
    });
    return result.entries;
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

  // --- Getters ---

  getAuditChain(): AuditChain | null {
    return this.auditChain;
  }

  getAuditStorage(): AuditChainStorage | null {
    return this.auditStorage;
  }

  getCryptoPool(): CryptoPool | null {
    return this.cryptoPool;
  }

  getReportGenerator(): AuditReportGenerator | null {
    return this.reportGenerator;
  }
}
