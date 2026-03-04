/**
 * Module system types for SecureYeoman god-object decomposition.
 *
 * Each domain module implements AppModule to own its storage/manager lifecycle.
 * SecureYeoman delegates init/cleanup to modules while keeping its public getter API.
 */

import type { Config } from '@secureyeoman/shared';
import type { SecureLogger } from '../logging/logger.js';

/** Shared context passed to every module during initialization. */
export interface ModuleContext {
  config: Config;
  logger: SecureLogger;
}

/** Lifecycle contract that every domain module must implement. */
export interface AppModule {
  /** Initialize storages, managers, and background workers. */
  init(ctx: ModuleContext): Promise<void>;
  /** Tear down resources in reverse-init order. */
  cleanup(): Promise<void>;
}

/**
 * Optional base class for modules that want a stored context reference
 * and the `initOptional` helper (mirrors SecureYeoman.initOptional).
 */
export abstract class BaseModule implements AppModule {
  protected config!: Config;
  protected logger!: SecureLogger;

  async init(ctx: ModuleContext): Promise<void> {
    this.config = ctx.config;
    this.logger = ctx.logger;
    await this.doInit();
  }

  /** Subclass hook — called after config/logger are set. */
  protected abstract doInit(): Promise<void>;

  abstract cleanup(): Promise<void>;

  /** Initialize an optional component, logging and swallowing failures. */
  protected async initOptional<T>(name: string, init: () => Promise<T> | T): Promise<T | null> {
    try {
      const result = await init();
      this.logger.debug(`${name} initialized`);
      return result;
    } catch (error) {
      this.logger.warn(`${name} initialization failed (non-fatal)`, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }
}
