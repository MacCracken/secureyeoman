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
  heartbeatIntervalMs: 60_000, // long interval so tests don't trigger heartbeat
  connectionTimeoutMs: 5_000,
};

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
  });

  describe('init (disabled)', () => {
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
      // Manually register a healthy instance
      const instance: SynapseInstance = {
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
      };
      manager.getRegistry().register(instance);

      // Mock the REST client
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
      const instance: SynapseInstance = {
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
      };
      manager.getRegistry().register(instance);

      const mockClient = manager.getClient();
      vi.spyOn(mockClient, 'submitTrainingJob').mockResolvedValue({ jobId: 'sj-2' });

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
  });

  describe('syncDelegatedJobStatus', () => {
    it('should return null when no store', async () => {
      const managerNoStore = new SynapseManager(defaultConfig, createMockLogger());
      const result = await managerNoStore.syncDelegatedJobStatus('dj-1');
      expect(result).toBeNull();
    });

    it('should sync status from Synapse', async () => {
      (mockStore.getDelegatedJob as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'dj-1',
        synapseJobId: 'sj-1',
      });
      (mockStore.updateDelegatedJobStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'dj-1',
        status: 'running',
        currentStep: 50,
      });

      const mockClient = manager.getClient();
      vi.spyOn(mockClient, 'getJobStatus').mockResolvedValue({
        status: 'running',
        step: 50,
        loss: 0.3,
        epoch: 1,
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
  });

  describe('registerModel', () => {
    it('should register model via store', async () => {
      await manager.registerModel('syn-1', {
        modelName: 'my-model',
        modelPath: '/models/my-model',
        baseModel: 'llama-7b',
        trainingMethod: 'sft',
      }, 'dj-1');

      expect(mockStore.registerModel).toHaveBeenCalledWith(
        'syn-1',
        expect.objectContaining({ modelName: 'my-model' }),
        'dj-1'
      );
    });
  });

  describe('getStatus', () => {
    it('should return empty status', () => {
      const status = manager.getStatus();
      expect(status.instances).toEqual([]);
      expect(status.healthy).toBe(0);
      expect(status.total).toBe(0);
    });
  });

  describe('shutdown', () => {
    it('should clear heartbeat timer', () => {
      manager.shutdown();
      // Should not throw
    });
  });
});
