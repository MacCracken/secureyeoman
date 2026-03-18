/**
 * DLP Manager — facade that ties scanner + stores + egress logging.
 *
 * Scans outbound content, logs egress events, returns scan results.
 */

import { createHash } from 'node:crypto';
import type { SecureLogger } from '../../logging/logger.js';
import type { DlpScanner } from './dlp-scanner.js';
import type { DlpPolicyStore } from './dlp-policy-store.js';
import type { EgressStore } from './egress-store.js';
import type { ClassificationStore } from './classification-store.js';
import type { DlpScanResult } from './types.js';

export interface DlpManagerDeps {
  scanner: DlpScanner;
  policyStore: DlpPolicyStore;
  egressStore: EgressStore;
  classificationStore: ClassificationStore;
  logger: SecureLogger;
}

export interface ScanOutboundMetadata {
  userId?: string;
  personalityId?: string;
  tenantId?: string;
  contentType?: string;
}

export class DlpManager {
  private readonly scanner: DlpScanner;
  private readonly policyStore: DlpPolicyStore;
  private readonly egressStore: EgressStore;
  private readonly classificationStore: ClassificationStore;
  private readonly logger: SecureLogger;

  constructor(deps: DlpManagerDeps) {
    this.scanner = deps.scanner;
    this.policyStore = deps.policyStore;
    this.egressStore = deps.egressStore;
    this.classificationStore = deps.classificationStore;
    this.logger = deps.logger;
  }

  /** Expose the classification engine for direct content classification (used by privacy router). */
  getClassificationEngine() {
    return this.scanner.getClassificationEngine();
  }

  /**
   * Scan outbound content against DLP policies and log the egress event.
   */
  async scanOutbound(
    content: string,
    destination: string,
    metadata?: ScanOutboundMetadata
  ): Promise<DlpScanResult> {
    const result = await this.scanner.scan(content, destination, metadata?.contentType);

    const contentHash = createHash('sha256').update(content).digest('hex');

    // Record egress event
    try {
      await this.egressStore.record({
        destinationType: destination,
        destinationId: null,
        contentHash,
        classificationLevel: result.classificationLevel,
        bytesSent: Buffer.byteLength(content, 'utf-8'),
        policyId: result.policyId,
        actionTaken: result.action === 'allowed' ? 'allowed' : result.action,
        scanFindings: result.findings,
        userId: metadata?.userId ?? null,
        personalityId: metadata?.personalityId ?? null,
        tenantId: metadata?.tenantId ?? 'default',
      });
    } catch (err) {
      this.logger.warn(
        {
          error: err instanceof Error ? err.message : String(err),
        },
        'Failed to record egress event'
      );
    }

    this.logger.info(
      {
        destination,
        action: result.action,
        findingsCount: result.findings.length,
        classificationLevel: result.classificationLevel,
      },
      'DLP outbound scan completed'
    );

    return result;
  }

  /** Expose the policy store for CRUD operations from routes. */
  getPolicyStore(): DlpPolicyStore {
    return this.policyStore;
  }

  /** Expose the egress store for querying from routes. */
  getEgressStore(): EgressStore {
    return this.egressStore;
  }
}
