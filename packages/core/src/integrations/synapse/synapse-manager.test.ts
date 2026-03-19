import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SynapseManager } from './synapse-manager.js';
import type { SynapseConfig, SynapseInstance } from './types.js';
import type { SynapseStore } from './synapse-store.js';

function createMockLogger() {
  const logger = {
    child: () => logger,
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  return logger as unknown as import('../../logging/logger.js').SecureLogger;
}

function createMockStore() {
  return {
    upsertInstance: vi.fn(),
    updateHeartbeat: vi.fn(),
    markDisconnected: vi.fn(),
    createDelegatedJob: vi.fn().mockResolvedValue({
      id: 'dj-1',
      synapseInstanceId: 'syn-1',
      synapseJobId: 'sj-1',
      status: 'pending',
    }),
    getDelegatedJob: vi.fn(),
    getDelegatedJobBySynapseId: vi.fn(),
    updateDelegatedJobStatus: vi.fn(),
    registerModel: vi.fn(),
    listInstances: vi.fn().mockResolvedValue([]),
    recordCapabilityAnnouncement: vi.fn(),
  } as unknown as SynapseStore;
}

const defaultConfig: SynapseConfig = {
  apiUrl: 'http://localhost:8420',
  grpcUrl: 'http://localhost:8421',
  enabled: true,
  heartbeatIntervalMs: 60_000,
  connectionTimeoutMs: 5_000,
};

function makeInstance(overrides: Partial<SynapseInstance> = {}): SynapseInstance {
  return {
    id: 'syn-1',
    endpoint: 'http://localhost:8420',
    version: '1.0',
    capabilities: {
      gpuCount: 1,
      totalGpuMemoryMb: 24000,
      supportedMethods: ['sft'],
      loadedModels: [],
    },
    status: 'connected',
    lastHeartbeat: Date.now(),
    ...overrides,
  };
}

describe('SynapseManager', () => {
  let manager: SynapseManager;
  let mockStore: ReturnType<typeof createMockStore>;

  beforeEach(() => {
    mockStore = createMockStore();
    manager = new SynapseManager(defaultConfig, createMockLogger(), mockStore);
  });

  describe('constructor', () => {
    it('should create manager with store', () => {
      expect(manager.getStore()).toBe(mockStore);
      expect(manager.getRegistry()).toBeDefined();
      expect(manager.isAvailable()).toBe(false);
    });

    it('should create manager without store', () => {
      const noStoreManager = new SynapseManager(defaultConfig, createMockLogger());
      expect(noStoreManager.getStore()).toBeNull();
    });
  });

  describe('init', () => {
    it('should skip when disabled', async () => {
      const disabledManager = new SynapseManager(
        { ...defaultConfig, enabled: false },
        createMockLogger(),
        mockStore
      );
      await disabledManager.init();
      expect(mockStore.upsertInstance).not.toHaveBeenCalled();
    });
  });

  describe('delegateTrainingJob', () => {
    it('should throw when no healthy instance available', async () => {
      await expect(
        manager.delegateTrainingJob({
          baseModel: 'llama-7b',
          datasetPath: '/data/train.jsonl',
          method: 'sft',
        })
      ).rejects.toThrow('No healthy Synapse instance available');
    });

    it('should delegate when a healthy instance exists', async () => {
      manager.getRegistry().register(makeInstance());
      const mockClient = manager.getClient();
      vi.spyOn(mockClient, 'submitTrainingJob').mockResolvedValue({ jobId: 'sj-1' });

      const result = await manager.delegateTrainingJob({
        baseModel: 'llama-7b',
        datasetPath: '/data/train.jsonl',
        method: 'sft',
      });

      expect(result.response.jobId).toBe('sj-1');
      expect(result.delegatedJob).toBeDefined();
      expect(mockStore.createDelegatedJob).toHaveBeenCalledWith(
        'syn-1',
        'sj-1',
        expect.objectContaining({ baseModel: 'llama-7b' }),
        undefined,
        'finetune'
      );
    });

    it('should pass syJobId and syJobType when provided', async () => {
      manager.getRegistry().register(makeInstance());
      vi.spyOn(manager.getClient(), 'submitTrainingJob').mockResolvedValue({ jobId: 'sj-2' });

      await manager.delegateTrainingJob(
        { baseModel: 'llama-7b', datasetPath: '/data/train.jsonl', method: 'sft' },
        { syJobId: 'fj-1', syJobType: 'pretrain' }
      );

      expect(mockStore.createDelegatedJob).toHaveBeenCalledWith(
        'syn-1',
        'sj-2',
        expect.anything(),
        'fj-1',
        'pretrain'
      );
    });

    it('should not create delegation record when no store', async () => {
      const noStoreManager = new SynapseManager(defaultConfig, createMockLogger());
      noStoreManager.getRegistry().register(makeInstance());
      vi.spyOn(noStoreManager.getClient(), 'submitTrainingJob').mockResolvedValue({
        jobId: 'sj-3',
      });

      const result = await noStoreManager.delegateTrainingJob({
        baseModel: 'llama',
        datasetPath: '/data',
        method: 'sft',
      });

      expect(result.response.jobId).toBe('sj-3');
      expect(result.delegatedJob).toBeUndefined();
    });

    it('should include error message in exception from client', async () => {
      manager.getRegistry().register(makeInstance());
      vi.spyOn(manager.getClient(), 'submitTrainingJob').mockRejectedValue(
        new Error('Synapse POST /training/jobs returned 400: bad config')
      );

      await expect(
        manager.delegateTrainingJob({
          baseModel: 'llama',
          datasetPath: '/data',
          method: 'sft',
        })
      ).rejects.toThrow('returned 400');
    });
  });

  describe('syncDelegatedJobStatus', () => {
    it('should return null when no store', async () => {
      const managerNoStore = new SynapseManager(defaultConfig, createMockLogger());
      const result = await managerNoStore.syncDelegatedJobStatus('dj-1');
      expect(result).toBeNull();
    });

    it('should return null when delegated job not found', async () => {
      (mockStore.getDelegatedJob as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await manager.syncDelegatedJobStatus('dj-nonexistent');
      expect(result).toBeNull();
    });

    it('should sync status from Synapse and update store', async () => {
      (mockStore.getDelegatedJob as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'dj-1',
        synapseJobId: 'sj-1',
      });
      (mockStore.updateDelegatedJobStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'dj-1',
        status: 'running',
        currentStep: 50,
      });

      vi.spyOn(manager.getClient(), 'getJobStatus').mockResolvedValue({
        status: 'running',
        step: 50,
        totalSteps: 1000,
        loss: 0.3,
        epoch: 1,
        progressPercent: 5.0,
        error: null,
        createdAt: '2026-03-18T00:00:00Z',
        startedAt: '2026-03-18T00:01:00Z',
        completedAt: null,
      });

      const result = await manager.syncDelegatedJobStatus('dj-1');
      expect(result).toBeDefined();
      expect(mockStore.updateDelegatedJobStatus).toHaveBeenCalledWith('dj-1', {
        status: 'running',
        currentStep: 50,
        currentLoss: 0.3,
        currentEpoch: 1,
      });
    });

    it('should handle null loss by converting to undefined for store', async () => {
      (mockStore.getDelegatedJob as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'dj-2',
        synapseJobId: 'sj-2',
      });
      (mockStore.updateDelegatedJobStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'dj-2',
        status: 'running',
      });

      vi.spyOn(manager.getClient(), 'getJobStatus').mockResolvedValue({
        status: 'running',
        step: 0,
        totalSteps: 1000,
        loss: null,
        epoch: 0,
        progressPercent: 0,
        error: null,
        createdAt: null,
        startedAt: null,
        completedAt: null,
      });

      await manager.syncDelegatedJobStatus('dj-2');
      expect(mockStore.updateDelegatedJobStatus).toHaveBeenCalledWith('dj-2', {
        status: 'running',
        currentStep: 0,
        currentLoss: undefined,
        currentEpoch: 0,
      });
    });

    it('should return stale job record when getJobStatus throws', async () => {
      const staleJob = { id: 'dj-3', synapseJobId: 'sj-3', status: 'running' };
      (mockStore.getDelegatedJob as ReturnType<typeof vi.fn>).mockResolvedValue(staleJob);

      vi.spyOn(manager.getClient(), 'getJobStatus').mockRejectedValue(
        new Error('Synapse unreachable')
      );

      const result = await manager.syncDelegatedJobStatus('dj-3');
      expect(result).toBe(staleJob);
      expect(mockStore.updateDelegatedJobStatus).not.toHaveBeenCalled();
    });
  });

  describe('registerModel', () => {
    it('should register model via store', async () => {
      await manager.registerModel(
        'syn-1',
        {
          modelName: 'my-model',
          modelPath: '/models/my-model',
          baseModel: 'llama-7b',
          trainingMethod: 'sft',
        },
        'dj-1'
      );

      expect(mockStore.registerModel).toHaveBeenCalledWith(
        'syn-1',
        expect.objectContaining({ modelName: 'my-model' }),
        'dj-1'
      );
    });

    it('should warn and skip when no store configured', async () => {
      const noStoreManager = new SynapseManager(defaultConfig, createMockLogger());
      // Should not throw
      await noStoreManager.registerModel('syn-1', {
        modelName: 'test',
        modelPath: '/m/test',
        baseModel: 'llama',
        trainingMethod: 'lora',
      });
    });
  });

  describe('getStatus', () => {
    it('should return empty status when no instances', () => {
      const status = manager.getStatus();
      expect(status.instances).toEqual([]);
      expect(status.healthy).toBe(0);
      expect(status.total).toBe(0);
    });

    it('should count healthy vs total correctly', () => {
      manager.getRegistry().register(makeInstance({ id: 'syn-1', status: 'connected' }));
      manager.getRegistry().register(makeInstance({ id: 'syn-2', status: 'disconnected' }));

      const status = manager.getStatus();
      expect(status.total).toBe(2);
      expect(status.healthy).toBe(1);
      expect(status.instances).toHaveLength(2);
    });
  });

  describe('isAvailable', () => {
    it('should return false when no instances', () => {
      expect(manager.isAvailable()).toBe(false);
    });

    it('should return true when healthy instance exists', () => {
      manager.getRegistry().register(makeInstance({ status: 'connected' }));
      expect(manager.isAvailable()).toBe(true);
    });

    it('should return false when only disconnected instances', () => {
      manager.getRegistry().register(makeInstance({ status: 'disconnected' }));
      expect(manager.isAvailable()).toBe(false);
    });
  });

  describe('shutdown', () => {
    it('should not throw when called multiple times', () => {
      manager.shutdown();
      manager.shutdown();
    });
  });

  describe('getClient', () => {
    it('should return same client instance on repeated calls', () => {
      const c1 = manager.getClient();
      const c2 = manager.getClient();
      expect(c1).toBe(c2);
    });
  });
});
