/**
 * ModelVersionManager — model deployment registry.
 *
 * Manages versioned deployments of fine-tuned models to personalities,
 * including Ollama alias creation and rollback support.
 */

import type { Pool } from 'pg';
import type { SecureLogger } from '../logging/logger.js';
import type { ModelVersion } from '@secureyeoman/shared';
import type { SoulStorage } from '../soul/storage.js';

export interface ModelVersionManagerDeps {
  pool: Pool;
  logger: SecureLogger;
  soulStorage: SoulStorage;
}

export interface DeployModelOpts {
  personalityId: string;
  modelName: string;
  experimentId?: string;
  finetuneJobId?: string;
  ollamaBaseUrl?: string;
}

export class ModelVersionManager {
  constructor(private readonly deps: ModelVersionManagerDeps) {}

  async deployModel(opts: DeployModelOpts): Promise<ModelVersion> {
    const { pool, soulStorage, logger } = this.deps;

    // Read personality's current default model before changing it
    const personality = await soulStorage.getPersonality(opts.personalityId);
    const previousModel = personality?.defaultModel
      ? typeof personality.defaultModel === 'string'
        ? personality.defaultModel
        : ((personality.defaultModel as Record<string, unknown>).model as string)
      : null;

    // Optionally create Ollama alias
    if (opts.ollamaBaseUrl) {
      try {
        const response = await fetch(`${opts.ollamaBaseUrl}/api/copy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: opts.modelName,
            destination: `${opts.modelName}-${Date.now()}`,
          }),
        });
        if (!response.ok) {
          logger.warn(`Ollama copy returned non-200: ${response.status}`);
        }
      } catch (err) {
        logger.warn(
          'Ollama copy failed (non-fatal): ' + (err instanceof Error ? err.message : String(err))
        );
      }
    }

    // Transaction: deactivate old, insert new, update personality
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Deactivate current active version
      await client.query(
        `UPDATE training.model_versions SET is_active = false
         WHERE personality_id = $1 AND is_active = true`,
        [opts.personalityId]
      );

      // Insert new version
      const { rows } = await client.query<Record<string, unknown>>(
        `INSERT INTO training.model_versions
           (personality_id, model_name, experiment_id, finetune_job_id, previous_model, is_active)
         VALUES ($1, $2, $3, $4, $5, true)
         RETURNING *`,
        [
          opts.personalityId,
          opts.modelName,
          opts.experimentId ?? null,
          opts.finetuneJobId ?? null,
          previousModel,
        ]
      );

      // Update personality defaultModel
      await soulStorage.updatePersonality(opts.personalityId, {
        defaultModel: { provider: 'ollama', model: opts.modelName },
      });

      await client.query('COMMIT');
      return this.mapRow(rows[0]!);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async rollback(personalityId: string): Promise<ModelVersion | null> {
    const active = await this.getActiveVersion(personalityId);
    if (!active?.previousModel) return null;

    // Mark current as rolled back
    await this.deps.pool.query(
      `UPDATE training.model_versions SET rolled_back_at = now() WHERE id = $1`,
      [active.id]
    );

    // Deploy the previous model
    return this.deployModel({
      personalityId,
      modelName: active.previousModel,
    });
  }

  async listVersions(personalityId: string): Promise<ModelVersion[]> {
    const { rows } = await this.deps.pool.query<Record<string, unknown>>(
      `SELECT * FROM training.model_versions WHERE personality_id = $1
       ORDER BY deployed_at DESC`,
      [personalityId]
    );
    return rows.map((r) => this.mapRow(r));
  }

  async getActiveVersion(personalityId: string): Promise<ModelVersion | null> {
    const { rows } = await this.deps.pool.query<Record<string, unknown>>(
      `SELECT * FROM training.model_versions
       WHERE personality_id = $1 AND is_active = true
       LIMIT 1`,
      [personalityId]
    );
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  async getVersion(id: string): Promise<ModelVersion | null> {
    const { rows } = await this.deps.pool.query<Record<string, unknown>>(
      `SELECT * FROM training.model_versions WHERE id = $1`,
      [id]
    );
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  private mapRow(r: Record<string, unknown>): ModelVersion {
    return {
      id: r.id as string,
      personalityId: r.personality_id as string,
      modelName: r.model_name as string,
      experimentId: (r.experiment_id as string) ?? null,
      finetuneJobId: (r.finetune_job_id as string) ?? null,
      previousModel: (r.previous_model as string) ?? null,
      isActive: r.is_active as boolean,
      deployedAt:
        r.deployed_at instanceof Date ? r.deployed_at.toISOString() : String(r.deployed_at ?? ''),
      rolledBackAt: r.rolled_back_at
        ? r.rolled_back_at instanceof Date
          ? r.rolled_back_at.toISOString()
          : String(r.rolled_back_at)
        : null,
    };
  }
}
