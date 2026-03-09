/**
 * HyperparamSearchManager — creates grid/random searches, spawns child finetune jobs,
 * tracks completion, selects best trial by metric.
 */

import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { SecureLogger } from '../logging/logger.js';
import type { FinetuneManager } from './finetune-manager.js';
import type { HyperparamSearch, HyperparamSearchCreate } from '@secureyeoman/shared';
import { errorToString } from '../utils/errors.js';

function rowToSearch(row: Record<string, unknown>): HyperparamSearch {
  return {
    id: row.id as string,
    name: row.name as string,
    baseConfig: (row.base_config as Record<string, unknown>) ?? {},
    searchStrategy: row.search_strategy as 'grid' | 'random',
    paramSpace: (row.param_space as Record<string, unknown>) ?? {},
    maxTrials: (row.max_trials as number) ?? 10,
    metricToOptimize: (row.metric_to_optimize as string) ?? 'eval_loss',
    status: row.status as HyperparamSearch['status'],
    bestJobId: (row.best_job_id as string) ?? null,
    bestMetricValue: (row.best_metric_value as number) ?? null,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at ?? ''),
    completedAt: row.completed_at instanceof Date ? row.completed_at.toISOString() : null,
  };
}

export interface HyperparamSearchManagerDeps {
  pool: Pool;
  logger: SecureLogger;
  finetuneManager: FinetuneManager;
}

export class HyperparamSearchManager {
  constructor(private readonly deps: HyperparamSearchManagerDeps) {}

  async create(data: HyperparamSearchCreate): Promise<HyperparamSearch> {
    const { rows } = await this.deps.pool.query<Record<string, unknown>>(
      `INSERT INTO training.hyperparam_searches
         (name, base_config, search_strategy, param_space, max_trials, metric_to_optimize)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        data.name,
        JSON.stringify(data.baseConfig),
        data.searchStrategy,
        JSON.stringify(data.paramSpace),
        data.maxTrials ?? 10,
        data.metricToOptimize ?? 'eval_loss',
      ]
    );
    return rowToSearch(rows[0]!);
  }

  async list(): Promise<HyperparamSearch[]> {
    const { rows } = await this.deps.pool.query<Record<string, unknown>>(
      `SELECT * FROM training.hyperparam_searches ORDER BY created_at DESC LIMIT 100`
    );
    return rows.map(rowToSearch);
  }

  async get(id: string): Promise<HyperparamSearch | null> {
    const { rows } = await this.deps.pool.query<Record<string, unknown>>(
      `SELECT * FROM training.hyperparam_searches WHERE id = $1`,
      [id]
    );
    return rows[0] ? rowToSearch(rows[0]) : null;
  }

  async cancel(id: string): Promise<boolean> {
    const { rowCount } = await this.deps.pool.query(
      `UPDATE training.hyperparam_searches SET status='cancelled', completed_at=NOW()
       WHERE id=$1 AND status IN ('pending','running')`,
      [id]
    );
    return (rowCount ?? 0) > 0;
  }

  /**
   * Generate trial configs from parameter space and spawn child finetune jobs.
   */
  async startSearch(id: string): Promise<void> {
    const search = await this.get(id);
    if (!search) throw new Error(`Search not found: ${id}`);
    if (search.status !== 'pending') throw new Error(`Search ${id} is not pending`);

    await this.deps.pool.query(
      `UPDATE training.hyperparam_searches SET status='running' WHERE id=$1`,
      [id]
    );

    const trialConfigs = this.generateTrialConfigs(search);

    for (const trialConfig of trialConfigs) {
      try {
        const job = await this.deps.finetuneManager.createJob({
          name: `${search.name}-trial-${trialConfig._trialIndex}`,
          baseModel:
            (trialConfig.baseModel as string) ??
            (search.baseConfig.baseModel as string) ??
            'unknown',
          adapterName: `${search.name}-trial-${trialConfig._trialIndex}`,
          datasetPath:
            (trialConfig.datasetPath as string) ?? (search.baseConfig.datasetPath as string) ?? '',
          loraRank: trialConfig.loraRank as number | undefined,
          loraAlpha: trialConfig.loraAlpha as number | undefined,
          batchSize: trialConfig.batchSize as number | undefined,
          epochs: trialConfig.epochs as number | undefined,
          learningRate: trialConfig.learningRate as number | undefined,
          warmupSteps: trialConfig.warmupSteps as number | undefined,
          checkpointSteps: trialConfig.checkpointSteps as number | undefined,
          searchId: id,
        });

        await this.deps.finetuneManager.startJob(job.id);
      } catch (err) {
        this.deps.logger.error(
          {
            error: errorToString(err),
          },
          'Failed to create trial job'
        );
      }
    }

    // Watch for completion in background
    this._watchCompletion(id).catch((err: unknown) => {
      this.deps.logger.error(
        {
          error: errorToString(err),
        },
        'Search completion watch error'
      );
    });
  }

  generateTrialConfigs(search: HyperparamSearch): Record<string, unknown>[] {
    const space = search.paramSpace as Record<string, unknown[]>;
    const maxTrials = search.maxTrials;

    if (search.searchStrategy === 'grid') {
      return this._gridSearch(space, search.baseConfig, maxTrials);
    }
    return this._randomSearch(space, search.baseConfig, maxTrials);
  }

  private _gridSearch(
    space: Record<string, unknown[]>,
    baseConfig: Record<string, unknown>,
    maxTrials: number
  ): Record<string, unknown>[] {
    const keys = Object.keys(space);
    if (keys.length === 0) return [{ ...baseConfig, _trialIndex: 0 }];

    const combinations: Record<string, unknown>[] = [];
    const values = keys.map((k) => (Array.isArray(space[k]) ? space[k] : [space[k]]));

    function* cartesian(
      arrays: unknown[][],
      idx = 0,
      current: unknown[] = []
    ): Generator<unknown[]> {
      if (idx === arrays.length) {
        yield [...current];
        return;
      }
      for (const val of arrays[idx]!) {
        current.push(val);
        yield* cartesian(arrays, idx + 1, current);
        current.pop();
      }
    }

    let trialIdx = 0;
    for (const combo of cartesian(values)) {
      if (trialIdx >= maxTrials) break;
      const config: Record<string, unknown> = { ...baseConfig, _trialIndex: trialIdx };
      keys.forEach((key, i) => {
        config[key] = combo[i];
      });
      combinations.push(config);
      trialIdx++;
    }

    return combinations;
  }

  private _randomSearch(
    space: Record<string, unknown[]>,
    baseConfig: Record<string, unknown>,
    maxTrials: number
  ): Record<string, unknown>[] {
    const keys = Object.keys(space);
    const configs: Record<string, unknown>[] = [];

    for (let i = 0; i < maxTrials; i++) {
      const config: Record<string, unknown> = { ...baseConfig, _trialIndex: i };
      for (const key of keys) {
        const values = Array.isArray(space[key]) ? space[key] : [space[key]];
        config[key] = values[Math.floor(Math.random() * values.length)];
      }
      configs.push(config);
    }

    return configs;
  }

  private async _watchCompletion(searchId: string): Promise<void> {
    // Poll child jobs every 30s until all complete
    const MAX_POLLS = 600; // 5 hours max
    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise((r) => setTimeout(r, 30_000));

      const search = await this.get(searchId);
      if (!search || search.status === 'cancelled') return;

      const { rows } = await this.deps.pool.query<{ total: string; done: string }>(
        `SELECT
           COUNT(*)::text AS total,
           COUNT(*) FILTER (WHERE status IN ('complete','failed','cancelled'))::text AS done
         FROM training.finetune_jobs WHERE search_id = $1`,
        [searchId]
      );

      const total = parseInt(rows[0]?.total ?? '0', 10);
      const done = parseInt(rows[0]?.done ?? '0', 10);

      if (total > 0 && done >= total) {
        await this._selectBest(searchId, search.metricToOptimize);
        return;
      }
    }
  }

  private async _selectBest(searchId: string, _metric: string): Promise<void> {
    // For now, select the completed job with the lowest eval_loss from experiments
    const { rows } = await this.deps.pool.query<{ id: string }>(
      `SELECT fj.id FROM training.finetune_jobs fj
       LEFT JOIN training.experiments ex ON ex.finetune_job_id = fj.id
       WHERE fj.search_id = $1 AND fj.status = 'complete'
       ORDER BY (ex.eval_metrics->>'eval_loss')::double precision ASC NULLS LAST
       LIMIT 1`,
      [searchId]
    );

    const bestJobId = rows[0]?.id ?? null;

    await this.deps.pool.query(
      `UPDATE training.hyperparam_searches
       SET status='completed', best_job_id=$1, completed_at=NOW()
       WHERE id=$2`,
      [bestJobId, searchId]
    );

    this.deps.logger.info({ searchId, bestJobId }, 'Hyperparameter search completed');
  }
}
