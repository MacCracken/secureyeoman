/**
 * CLI Integration — Built-in command-line adapter.
 *
 * Represents the local CLI / REST API as a "connected" integration
 * so it appears in the dashboard alongside other messaging platforms.
 * sendMessage() is a no-op since CLI consumers read responses directly.
 */

import type { IntegrationConfig, Platform } from '@friday/shared';
import type { Integration, IntegrationDeps, PlatformRateLimit } from '../types.js';
import type { SecureLogger } from '../../logging/logger.js';

export class CliIntegration implements Integration {
  readonly platform: Platform = 'cli';
  readonly platformRateLimit: PlatformRateLimit = { maxPerSecond: 100 };

  private logger: SecureLogger | null = null;
  private running = false;

  async init(config: IntegrationConfig, deps: IntegrationDeps): Promise<void> {
    this.logger = deps.logger;
    this.logger?.info('CLI integration initialized', {
      displayName: config.displayName,
    });
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.logger?.info('CLI integration started');
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    this.logger?.info('CLI integration stopped');
  }

  async sendMessage(
    _chatId: string,
    _text: string,
    _metadata?: Record<string, unknown>,
  ): Promise<string> {
    // CLI consumers read responses via the REST API / task executor directly,
    // so sendMessage is a no-op. Return an empty platform message id.
    return '';
  }

  isHealthy(): boolean {
    return this.running;
  }
}
