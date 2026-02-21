/**
 * Migrate Command — Run database migrations and exit.
 *
 * Designed to be used as a Kubernetes pre-install / pre-upgrade Helm hook Job
 * so that migrations complete before the core Deployment rolls out, eliminating
 * the multi-replica race condition. Can also be run manually.
 *
 * Usage:
 *   secureyeoman migrate
 *   secureyeoman migrate --help
 */

import { loadConfig } from '../../config/loader.js';
import { initPoolFromConfig } from '../../storage/pg-pool.js';
import { runMigrations } from '../../storage/migrations/runner.js';
import { closePool } from '../../storage/pg-pool.js';
import { initializeLogger, createNoopLogger } from '../../logging/logger.js';
import type { Command, CommandContext } from '../router.js';
import { extractBoolFlag } from '../utils.js';

export const migrateCommand: Command = {
  name: 'migrate',
  description: 'Run database migrations and exit (for CI / Helm pre-upgrade hooks)',
  usage: 'secureyeoman migrate [--help]',

  async run(ctx: CommandContext): Promise<number> {
    const helpResult = extractBoolFlag(ctx.argv, 'help', 'h');
    if (helpResult.value) {
      ctx.stdout.write(`
Usage: ${this.usage}

Applies all pending database migrations and exits with code 0 on success.
Exits with code 1 on failure.

Use as a Kubernetes Job with helm.sh/hook: pre-install,pre-upgrade to run
migrations before the core Deployment rolls out.
\n`);
      return 0;
    }

    // Minimal logger — migrations run before full system init
    let logger;
    try {
      const config = await loadConfig();
      logger = initializeLogger(config.logging);
      initPoolFromConfig(config.core.database);
    } catch (err) {
      // Fall back to noop logger if config fails; let the DB error surface below
      logger = createNoopLogger();
      ctx.stderr.write(`Failed to load config: ${err instanceof Error ? err.message : String(err)}\n`);
      return 1;
    }

    try {
      logger.info('Running database migrations');
      await runMigrations();
      logger.info('Database migrations complete');
      ctx.stdout.write('Migrations complete.\n');
      return 0;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Database migration failed', { error: msg });
      ctx.stderr.write(`Migration failed: ${msg}\n`);
      return 1;
    } finally {
      await closePool();
    }
  },
};
