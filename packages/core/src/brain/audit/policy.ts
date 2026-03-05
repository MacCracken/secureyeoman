/**
 * Memory Audit Policy — Reads audit configuration from BrainConfig.
 *
 * Phase 118: Memory Audits, Compression & Reorganization.
 */

import type {
  MemoryAuditPolicy as MemoryAuditPolicyConfig,
  MemoryAuditScope,
} from '@secureyeoman/shared';

export class MemoryAuditPolicy {
  private readonly config: MemoryAuditPolicyConfig;

  constructor(config: MemoryAuditPolicyConfig) {
    this.config = config;
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  isCompressionEnabled(): boolean {
    return this.config.compressionEnabled;
  }

  isReorganizationEnabled(): boolean {
    return this.config.reorganizationEnabled;
  }

  requiresApproval(): boolean {
    return this.config.requireApproval;
  }

  shouldRetainOriginals(): boolean {
    return this.config.retainOriginals;
  }

  getSchedule(scope: MemoryAuditScope): string {
    switch (scope) {
      case 'daily':
        return this.config.dailySchedule;
      case 'weekly':
        return this.config.weeklySchedule;
      case 'monthly':
        return this.config.monthlySchedule;
    }
  }

  getArchivalAgeDays(): number {
    return this.config.archivalAgeDays;
  }

  getCompressionThreshold(): number {
    return this.config.compressionThreshold;
  }

  getMaxMemoriesPerPersonality(): number {
    return this.config.maxMemoriesPerPersonality;
  }

  getModel(): string | null {
    return this.config.model;
  }

  getConfig(): MemoryAuditPolicyConfig {
    return { ...this.config };
  }
}
