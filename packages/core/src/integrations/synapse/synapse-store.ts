/**
 * SynapseStore — Persistent storage for Synapse bridge state.
 *
 * CRUD for synapse.instances, synapse.delegated_jobs, and synapse.registered_models.
 * Backs the in-memory SynapseRegistry with durable Postgres state so bridge
 * state survives restarts.
 */

import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { SecureLogger } from '../../logging/logger.js';
import type {
  SynapseInstance,
  SynapseHeartbeat,
  SynapseTrainingJobRequest,
  SynapseModelRegistration,
  SynapseInboundJobRequest,
  SynapseCapabilities,
} from './types.js';

// ── Row mappers ──────────────────────────────────────────────────────────────

export interface DelegatedJobRow {
  id: string;
  synapseInstanceId: string;
  synapseJobId: string;
  syJobId: string | null;
  syJobType: string;
  baseModel: string;
  datasetPath: string | null;
  method: string;
  configJson: Record<string, unknown>;
  status: string;
  currentStep: number;
  totalSteps: number;
  currentLoss: number | null;
  currentEpoch: number | null;
  errorMessage: string | null;
  modelOutputPath: string | null;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
}

export interface RegisteredModelRow {
  id: string;
  synapseInstanceId: string;
  modelName: string;
  modelPath: string;
  baseModel: string | null;
  trainingMethod: string | null;
  jobId: string | null;
  registeredAt: number;
  metadata: Record<string, unknown>;
}

function rowToDelegatedJob(row: Record<string, unknown>): DelegatedJobRow {
  return {
    id: row.id as string,
    synapseInstanceId: row.synapse_instance_id as string,
    synapseJobId: row.synapse_job_id as string,
    syJobId: (row.sy_job_id as string | null) ?? null,
    syJobType: (row.sy_job_type as string) ?? 'finetune',
    baseModel: row.base_model as string,
    datasetPath: (row.dataset_path as string | null) ?? null,
    method: row.method as string,
    configJson: (row.config_json as Record<string, unknown>) ?? {},
    status: (row.status as string) ?? 'pending',
    currentStep: Number(row.current_step ?? 0),
    totalSteps: Number(row.total_steps ?? 0),
    currentLoss: row.current_loss != null ? Number(row.current_loss) : null,
    currentEpoch: row.current_epoch != null ? Number(row.current_epoch) : null,
    errorMessage: (row.error_message as string | null) ?? null,
    modelOutputPath: (row.model_output_path as string | null) ?? null,
    createdAt: Number(row.created_at ?? 0),
    startedAt: row.started_at != null ? Number(row.started_at) : null,
    completedAt: row.completed_at != null ? Number(row.completed_at) : null,
  };
}

export interface InboundJobRow {
  id: string;
  synapseInstanceId: string;
  synapseSourceJobId: string | null;
  jobType: string;
  description: string | null;
  payload: Record<string, unknown>;
  status: string;
  result: Record<string, unknown> | null;
  errorMessage: string | null;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
}

function rowToInboundJob(row: Record<string, unknown>): InboundJobRow {
  return {
    id: row.id as string,
    synapseInstanceId: row.synapse_instance_id as string,
    synapseSourceJobId: (row.synapse_source_job_id as string | null) ?? null,
    jobType: (row.job_type as string) ?? 'custom',
    description: (row.description as string | null) ?? null,
    payload: (row.payload as Record<string, unknown>) ?? {},
    status: (row.status as string) ?? 'pending',
    result: (row.result as Record<string, unknown> | null) ?? null,
    errorMessage: (row.error_message as string | null) ?? null,
    createdAt: Number(row.created_at ?? 0),
    startedAt: row.started_at != null ? Number(row.started_at) : null,
    completedAt: row.completed_at != null ? Number(row.completed_at) : null,
  };
}

function rowToRegisteredModel(row: Record<string, unknown>): RegisteredModelRow {
  return {
    id: row.id as string,
    synapseInstanceId: row.synapse_instance_id as string,
    modelName: row.model_name as string,
    modelPath: row.model_path as string,
    baseModel: (row.base_model as string | null) ?? null,
    trainingMethod: (row.training_method as string | null) ?? null,
    jobId: (row.job_id as string | null) ?? null,
    registeredAt: Number(row.registered_at ?? 0),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  };
}

// ── Store ────────────────────────────────────────────────────────────────────

export class SynapseStore {
  constructor(
    private readonly pool: Pool,
    private readonly logger: SecureLogger
  ) {}

  // ── Instances ────────────────────────────────────────────────────────────

  async upsertInstance(instance: SynapseInstance): Promise<void> {
    await this.pool.query(
      `INSERT INTO synapse.instances
         (id, endpoint, version, gpu_count, total_gpu_memory_mb, gpu_memory_free_mb,
          supported_methods, loaded_models, status, last_heartbeat, registered_at, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO UPDATE SET
         endpoint = EXCLUDED.endpoint,
         version = EXCLUDED.version,
         gpu_count = EXCLUDED.gpu_count,
         total_gpu_memory_mb = EXCLUDED.total_gpu_memory_mb,
         supported_methods = EXCLUDED.supported_methods,
         loaded_models = EXCLUDED.loaded_models,
         status = EXCLUDED.status,
         last_heartbeat = EXCLUDED.last_heartbeat,
         metadata = EXCLUDED.metadata`,
      [
        instance.id,
        instance.endpoint,
        instance.version,
        instance.capabilities.gpuCount,
        instance.capabilities.totalGpuMemoryMb,
        instance.capabilities.totalGpuMemoryMb, // initial free = total
        instance.capabilities.supportedMethods,
        instance.capabilities.loadedModels.length,
        instance.status,
        instance.lastHeartbeat,
        Date.now(),
        JSON.stringify({ loadedModelNames: instance.capabilities.loadedModels }),
      ]
    );
  }

  async updateHeartbeat(instanceId: string, heartbeat: SynapseHeartbeat): Promise<void> {
    await this.pool.query(
      `UPDATE synapse.instances
       SET last_heartbeat = $1,
           gpu_memory_free_mb = $2,
           active_training_jobs = $3,
           loaded_models = $4,
           status = 'connected',
           metadata = jsonb_set(COALESCE(metadata, '{}'), '{loadedModelNames}', $5::jsonb)
       WHERE id = $6`,
      [
        heartbeat.timestamp,
        heartbeat.gpuMemoryFreeMb,
        heartbeat.activeTrainingJobs,
        heartbeat.loadedModels.length,
        JSON.stringify(heartbeat.loadedModels),
        instanceId,
      ]
    );
  }

  async markDisconnected(instanceId: string): Promise<void> {
    await this.pool.query(`UPDATE synapse.instances SET status = 'disconnected' WHERE id = $1`, [
      instanceId,
    ]);
  }

  async listInstances(): Promise<SynapseInstance[]> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT * FROM synapse.instances ORDER BY registered_at DESC`
    );
    return rows.map((r) => {
      const meta = (r.metadata as Record<string, unknown>) ?? {};
      const loadedModelNames = (meta.loadedModelNames as string[]) ?? [];
      return {
        id: r.id as string,
        endpoint: r.endpoint as string,
        version: (r.version as string) ?? '',
        capabilities: {
          gpuCount: Number(r.gpu_count ?? 0),
          totalGpuMemoryMb: Number(r.total_gpu_memory_mb ?? 0),
          supportedMethods: (r.supported_methods as string[]) ?? [],
          loadedModels: loadedModelNames,
        },
        status: (r.status as SynapseInstance['status']) ?? 'disconnected',
        lastHeartbeat: Number(r.last_heartbeat ?? 0),
      };
    });
  }

  async deleteInstance(instanceId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(`DELETE FROM synapse.instances WHERE id = $1`, [
      instanceId,
    ]);
    return (rowCount ?? 0) > 0;
  }

  // ── Delegated Jobs ───────────────────────────────────────────────────────

  async createDelegatedJob(
    instanceId: string,
    synapseJobId: string,
    req: SynapseTrainingJobRequest,
    syJobId?: string,
    syJobType = 'finetune'
  ): Promise<DelegatedJobRow> {
    const id = randomUUID();
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `INSERT INTO synapse.delegated_jobs
         (id, synapse_instance_id, synapse_job_id, sy_job_id, sy_job_type,
          base_model, dataset_path, method, config_json, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10)
       RETURNING *`,
      [
        id,
        instanceId,
        synapseJobId,
        syJobId ?? null,
        syJobType,
        req.baseModel,
        req.datasetPath,
        req.method,
        req.configJson ? JSON.parse(req.configJson) : {},
        Date.now(),
      ]
    );
    this.logger.info(
      { delegatedJobId: id, synapseJobId, instanceId },
      'created delegated job record'
    );
    return rowToDelegatedJob(rows[0]!);
  }

  async updateDelegatedJobStatus(
    id: string,
    updates: {
      status?: string;
      currentStep?: number;
      totalSteps?: number;
      currentLoss?: number;
      currentEpoch?: number;
      errorMessage?: string;
      modelOutputPath?: string;
    }
  ): Promise<DelegatedJobRow | null> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (updates.status != null) {
      sets.push(`status = $${idx++}`);
      values.push(updates.status);
      if (updates.status === 'running') {
        sets.push(`started_at = $${idx++}`);
        values.push(Date.now());
      }
      if (['completed', 'failed', 'cancelled'].includes(updates.status)) {
        sets.push(`completed_at = $${idx++}`);
        values.push(Date.now());
      }
    }
    if (updates.currentStep != null) {
      sets.push(`current_step = $${idx++}`);
      values.push(updates.currentStep);
    }
    if (updates.totalSteps != null) {
      sets.push(`total_steps = $${idx++}`);
      values.push(updates.totalSteps);
    }
    if (updates.currentLoss != null) {
      sets.push(`current_loss = $${idx++}`);
      values.push(updates.currentLoss);
    }
    if (updates.currentEpoch != null) {
      sets.push(`current_epoch = $${idx++}`);
      values.push(updates.currentEpoch);
    }
    if (updates.errorMessage != null) {
      sets.push(`error_message = $${idx++}`);
      values.push(updates.errorMessage);
    }
    if (updates.modelOutputPath != null) {
      sets.push(`model_output_path = $${idx++}`);
      values.push(updates.modelOutputPath);
    }

    if (sets.length === 0) return this.getDelegatedJob(id);

    values.push(id);
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `UPDATE synapse.delegated_jobs SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return rows.length ? rowToDelegatedJob(rows[0]!) : null;
  }

  async getDelegatedJob(id: string): Promise<DelegatedJobRow | null> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT * FROM synapse.delegated_jobs WHERE id = $1`,
      [id]
    );
    return rows.length ? rowToDelegatedJob(rows[0]!) : null;
  }

  async getDelegatedJobBySynapseId(synapseJobId: string): Promise<DelegatedJobRow | null> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT * FROM synapse.delegated_jobs WHERE synapse_job_id = $1`,
      [synapseJobId]
    );
    return rows.length ? rowToDelegatedJob(rows[0]!) : null;
  }

  async getDelegatedJobBySyJobId(syJobId: string): Promise<DelegatedJobRow | null> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT * FROM synapse.delegated_jobs WHERE sy_job_id = $1`,
      [syJobId]
    );
    return rows.length ? rowToDelegatedJob(rows[0]!) : null;
  }

  async listDelegatedJobs(filters?: {
    status?: string;
    instanceId?: string;
    limit?: number;
  }): Promise<DelegatedJobRow[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (filters?.status) {
      conditions.push(`status = $${idx++}`);
      values.push(filters.status);
    }
    if (filters?.instanceId) {
      conditions.push(`synapse_instance_id = $${idx++}`);
      values.push(filters.instanceId);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters?.limit ?? 100;
    values.push(limit);

    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT * FROM synapse.delegated_jobs ${where} ORDER BY created_at DESC LIMIT $${idx}`,
      values
    );
    return rows.map(rowToDelegatedJob);
  }

  // ── Registered Models ────────────────────────────────────────────────────

  async registerModel(
    instanceId: string,
    reg: SynapseModelRegistration,
    jobId?: string
  ): Promise<RegisteredModelRow> {
    const id = randomUUID();
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `INSERT INTO synapse.registered_models
         (id, synapse_instance_id, model_name, model_path, base_model, training_method, job_id, registered_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        id,
        instanceId,
        reg.modelName,
        reg.modelPath,
        reg.baseModel,
        reg.trainingMethod,
        jobId ?? null,
        Date.now(),
      ]
    );
    this.logger.info(
      { modelId: id, modelName: reg.modelName, instanceId },
      'registered Synapse model'
    );
    return rowToRegisteredModel(rows[0]!);
  }

  async listRegisteredModels(instanceId?: string): Promise<RegisteredModelRow[]> {
    if (instanceId) {
      const { rows } = await this.pool.query<Record<string, unknown>>(
        `SELECT * FROM synapse.registered_models WHERE synapse_instance_id = $1 ORDER BY registered_at DESC`,
        [instanceId]
      );
      return rows.map(rowToRegisteredModel);
    }
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT * FROM synapse.registered_models ORDER BY registered_at DESC LIMIT 200`
    );
    return rows.map(rowToRegisteredModel);
  }

  async getRegisteredModel(id: string): Promise<RegisteredModelRow | null> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT * FROM synapse.registered_models WHERE id = $1`,
      [id]
    );
    return rows.length ? rowToRegisteredModel(rows[0]!) : null;
  }

  async deleteRegisteredModel(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `DELETE FROM synapse.registered_models WHERE id = $1`,
      [id]
    );
    return (rowCount ?? 0) > 0;
  }

  // ── Inbound Jobs (Synapse → SY) ─────────────────────────────────────

  async createInboundJob(
    instanceId: string,
    req: SynapseInboundJobRequest
  ): Promise<InboundJobRow> {
    const id = randomUUID();
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `INSERT INTO synapse.inbound_jobs
         (id, synapse_instance_id, synapse_source_job_id, job_type, description, payload, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,'pending',$7)
       RETURNING *`,
      [
        id,
        instanceId,
        req.synapseSourceJobId ?? null,
        req.jobType,
        req.description ?? null,
        JSON.stringify(req.payload),
        Date.now(),
      ]
    );
    this.logger.info(
      { inboundJobId: id, jobType: req.jobType, instanceId },
      'created inbound job from Synapse'
    );
    return rowToInboundJob(rows[0]!);
  }

  async getInboundJob(id: string): Promise<InboundJobRow | null> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT * FROM synapse.inbound_jobs WHERE id = $1`,
      [id]
    );
    return rows.length ? rowToInboundJob(rows[0]!) : null;
  }

  async updateInboundJob(
    id: string,
    updates: { status?: string; result?: Record<string, unknown>; errorMessage?: string }
  ): Promise<InboundJobRow | null> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (updates.status != null) {
      sets.push(`status = $${idx++}`);
      values.push(updates.status);
      if (updates.status === 'running') {
        sets.push(`started_at = $${idx++}`);
        values.push(Date.now());
      }
      if (['completed', 'failed', 'rejected'].includes(updates.status)) {
        sets.push(`completed_at = $${idx++}`);
        values.push(Date.now());
      }
    }
    if (updates.result != null) {
      sets.push(`result = $${idx++}`);
      values.push(JSON.stringify(updates.result));
    }
    if (updates.errorMessage != null) {
      sets.push(`error_message = $${idx++}`);
      values.push(updates.errorMessage);
    }

    if (sets.length === 0) return this.getInboundJob(id);

    values.push(id);
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `UPDATE synapse.inbound_jobs SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return rows.length ? rowToInboundJob(rows[0]!) : null;
  }

  async listInboundJobs(filters?: {
    status?: string;
    instanceId?: string;
    limit?: number;
  }): Promise<InboundJobRow[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (filters?.status) {
      conditions.push(`status = $${idx++}`);
      values.push(filters.status);
    }
    if (filters?.instanceId) {
      conditions.push(`synapse_instance_id = $${idx++}`);
      values.push(filters.instanceId);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters?.limit ?? 100;
    values.push(limit);

    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT * FROM synapse.inbound_jobs ${where} ORDER BY created_at DESC LIMIT $${idx}`,
      values
    );
    return rows.map(rowToInboundJob);
  }

  // ── Capability Announcements ─────────────────────────────────────────

  async recordCapabilityAnnouncement(
    instanceId: string,
    capabilities: SynapseCapabilities
  ): Promise<void> {
    const id = randomUUID();
    await this.pool.query(
      `INSERT INTO synapse.capability_announcements (id, synapse_instance_id, capabilities, announced_at)
       VALUES ($1, $2, $3, $4)`,
      [id, instanceId, JSON.stringify(capabilities), Date.now()]
    );
  }
}
