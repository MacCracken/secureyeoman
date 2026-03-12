import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SynapseStore } from './synapse-store.js';

function createMockPool() {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  } as unknown as import('pg').Pool;
}

function createMockLogger() {
  return {
    child: () => createMockLogger(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as import('../../logging/logger.js').SecureLogger;
}

describe('SynapseStore', () => {
  let store: SynapseStore;
  let mockPool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    mockPool = createMockPool();
    store = new SynapseStore(mockPool, createMockLogger());
  });

  describe('upsertInstance', () => {
    it('should insert or update an instance', async () => {
      await store.upsertInstance({
        id: 'syn-1',
        endpoint: 'http://localhost:8420',
        version: '1.0.0',
        capabilities: {
          gpuCount: 2,
          totalGpuMemoryMb: 48000,
          supportedMethods: ['sft', 'dpo'],
          loadedModels: ['llama-7b'],
        },
        status: 'connected',
        lastHeartbeat: Date.now(),
      });

      expect(mockPool.query).toHaveBeenCalledTimes(1);
      const [sql, params] = (mockPool.query as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(sql).toContain('INSERT INTO synapse.instances');
      expect(sql).toContain('ON CONFLICT');
      expect(params[0]).toBe('syn-1');
      expect(params[3]).toBe(2); // gpuCount
    });
  });

  describe('updateHeartbeat', () => {
    it('should update heartbeat fields', async () => {
      await store.updateHeartbeat('syn-1', {
        instanceId: 'syn-1',
        timestamp: Date.now(),
        loadedModels: ['llama-7b', 'mistral-7b'],
        gpuMemoryFreeMb: 30000,
        activeTrainingJobs: 1,
      });

      expect(mockPool.query).toHaveBeenCalledTimes(1);
      const [sql] = (mockPool.query as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(sql).toContain('UPDATE synapse.instances');
      expect(sql).toContain('gpu_memory_free_mb');
    });
  });

  describe('markDisconnected', () => {
    it('should set status to disconnected', async () => {
      await store.markDisconnected('syn-1');
      const [sql, params] = (mockPool.query as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(sql).toContain("status = 'disconnected'");
      expect(params[0]).toBe('syn-1');
    });
  });

  describe('createDelegatedJob', () => {
    it('should insert a delegated job record', async () => {
      (mockPool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [
          {
            id: 'test-uuid',
            synapse_instance_id: 'syn-1',
            synapse_job_id: 'sj-1',
            sy_job_id: 'fj-1',
            sy_job_type: 'finetune',
            base_model: 'llama-7b',
            dataset_path: '/data/train.jsonl',
            method: 'sft',
            config_json: {},
            status: 'pending',
            current_step: 0,
            total_steps: 0,
            current_loss: null,
            current_epoch: null,
            error_message: null,
            model_output_path: null,
            created_at: Date.now(),
            started_at: null,
            completed_at: null,
          },
        ],
      });

      const result = await store.createDelegatedJob(
        'syn-1',
        'sj-1',
        { baseModel: 'llama-7b', datasetPath: '/data/train.jsonl', method: 'sft' },
        'fj-1',
        'finetune'
      );

      expect(result.synapseInstanceId).toBe('syn-1');
      expect(result.synapseJobId).toBe('sj-1');
      expect(result.syJobId).toBe('fj-1');
      expect(result.status).toBe('pending');
    });
  });

  describe('updateDelegatedJobStatus', () => {
    it('should update status and timestamps', async () => {
      (mockPool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [
          {
            id: 'dj-1',
            synapse_instance_id: 'syn-1',
            synapse_job_id: 'sj-1',
            sy_job_id: null,
            sy_job_type: 'finetune',
            base_model: 'llama-7b',
            dataset_path: null,
            method: 'sft',
            config_json: {},
            status: 'running',
            current_step: 100,
            total_steps: 1000,
            current_loss: 0.5,
            current_epoch: null,
            error_message: null,
            model_output_path: null,
            created_at: Date.now(),
            started_at: Date.now(),
            completed_at: null,
          },
        ],
      });

      const result = await store.updateDelegatedJobStatus('dj-1', {
        status: 'running',
        currentStep: 100,
        totalSteps: 1000,
        currentLoss: 0.5,
      });

      expect(result).not.toBeNull();
      expect(result!.status).toBe('running');
      expect(result!.currentStep).toBe(100);
    });

    it('should set completed_at when status is completed', async () => {
      (mockPool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [
          {
            id: 'dj-1',
            synapse_instance_id: 'syn-1',
            synapse_job_id: 'sj-1',
            sy_job_id: null,
            sy_job_type: 'finetune',
            base_model: 'llama-7b',
            dataset_path: null,
            method: 'sft',
            config_json: {},
            status: 'completed',
            current_step: 1000,
            total_steps: 1000,
            current_loss: 0.1,
            current_epoch: null,
            error_message: null,
            model_output_path: '/models/out',
            created_at: Date.now(),
            started_at: Date.now(),
            completed_at: Date.now(),
          },
        ],
      });

      await store.updateDelegatedJobStatus('dj-1', { status: 'completed' });
      const [sql] = (mockPool.query as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(sql).toContain('completed_at');
    });
  });

  describe('createInboundJob', () => {
    it('should create an inbound job from Synapse', async () => {
      (mockPool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [
          {
            id: 'ij-1',
            synapse_instance_id: 'syn-1',
            synapse_source_job_id: 'ssj-1',
            job_type: 'evaluation',
            description: 'evaluate model X',
            payload: { model: 'llama-7b' },
            status: 'pending',
            result: null,
            error_message: null,
            created_at: Date.now(),
            started_at: null,
            completed_at: null,
          },
        ],
      });

      const result = await store.createInboundJob('syn-1', {
        synapseSourceJobId: 'ssj-1',
        jobType: 'evaluation',
        description: 'evaluate model X',
        payload: { model: 'llama-7b' },
      });

      expect(result.synapseInstanceId).toBe('syn-1');
      expect(result.jobType).toBe('evaluation');
      expect(result.status).toBe('pending');
    });
  });

  describe('updateInboundJob', () => {
    it('should update status and result', async () => {
      (mockPool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [
          {
            id: 'ij-1',
            synapse_instance_id: 'syn-1',
            synapse_source_job_id: null,
            job_type: 'evaluation',
            description: null,
            payload: {},
            status: 'completed',
            result: { score: 0.95 },
            error_message: null,
            created_at: Date.now(),
            started_at: Date.now(),
            completed_at: Date.now(),
          },
        ],
      });

      const result = await store.updateInboundJob('ij-1', {
        status: 'completed',
        result: { score: 0.95 },
      });

      expect(result).not.toBeNull();
      expect(result!.status).toBe('completed');
    });
  });

  describe('recordCapabilityAnnouncement', () => {
    it('should insert a capability record', async () => {
      await store.recordCapabilityAnnouncement('syn-1', {
        gpuCount: 4,
        totalGpuMemoryMb: 96000,
        supportedMethods: ['sft', 'dpo', 'rlhf'],
        loadedModels: [],
      });

      const [sql] = (mockPool.query as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(sql).toContain('INSERT INTO synapse.capability_announcements');
    });
  });

  describe('registerModel', () => {
    it('should insert a registered model', async () => {
      (mockPool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [
          {
            id: 'rm-1',
            synapse_instance_id: 'syn-1',
            model_name: 'my-finetune',
            model_path: '/models/my-finetune',
            base_model: 'llama-7b',
            training_method: 'sft',
            job_id: 'dj-1',
            registered_at: Date.now(),
            metadata: {},
          },
        ],
      });

      const result = await store.registerModel(
        'syn-1',
        {
          modelName: 'my-finetune',
          modelPath: '/models/my-finetune',
          baseModel: 'llama-7b',
          trainingMethod: 'sft',
        },
        'dj-1'
      );

      expect(result.modelName).toBe('my-finetune');
      expect(result.jobId).toBe('dj-1');
    });
  });

  describe('listDelegatedJobs', () => {
    it('should apply filters', async () => {
      (mockPool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] });
      await store.listDelegatedJobs({ status: 'running', instanceId: 'syn-1', limit: 50 });

      const [sql, params] = (mockPool.query as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(sql).toContain('WHERE');
      expect(params).toContain('running');
      expect(params).toContain('syn-1');
      expect(params).toContain(50);
    });
  });

  describe('listInboundJobs', () => {
    it('should list with no filters', async () => {
      (mockPool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] });
      await store.listInboundJobs();

      const [sql] = (mockPool.query as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(sql).toContain('synapse.inbound_jobs');
      expect(sql).not.toContain('WHERE');
    });
  });
});
