import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SynapseRegistry } from './synapse-registry.js';
import type { SynapseInstance } from './types.js';

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

function makeInstance(overrides: Partial<SynapseInstance> = {}): SynapseInstance {
  return {
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
    ...overrides,
  };
}

describe('SynapseRegistry', () => {
  let registry: SynapseRegistry;

  beforeEach(() => {
    registry = new SynapseRegistry(createMockLogger());
  });

  it('should register and list instances', () => {
    registry.register(makeInstance({ id: 'syn-1' }));
    registry.register(makeInstance({ id: 'syn-2' }));
    expect(registry.size).toBe(2);
    expect(registry.list()).toHaveLength(2);
  });

  it('should unregister instances', () => {
    registry.register(makeInstance({ id: 'syn-1' }));
    registry.unregister('syn-1');
    expect(registry.size).toBe(0);
  });

  it('should get instance by id', () => {
    registry.register(makeInstance({ id: 'syn-1' }));
    expect(registry.get('syn-1')).toBeDefined();
    expect(registry.get('syn-unknown')).toBeUndefined();
  });

  it('should return only healthy instances', () => {
    registry.register(makeInstance({ id: 'syn-1', status: 'connected' }));
    registry.register(makeInstance({ id: 'syn-2', status: 'disconnected' }));
    const healthy = registry.getHealthy();
    expect(healthy).toHaveLength(1);
    expect(healthy[0]!.id).toBe('syn-1');
  });

  describe('getBestForTraining', () => {
    it('should return null when no candidates', () => {
      expect(registry.getBestForTraining('sft')).toBeNull();
    });

    it('should select instance supporting the requested method', () => {
      registry.register(
        makeInstance({
          id: 'syn-1',
          capabilities: {
            gpuCount: 1,
            totalGpuMemoryMb: 24000,
            supportedMethods: ['sft'],
            loadedModels: [],
          },
        })
      );
      registry.register(
        makeInstance({
          id: 'syn-2',
          capabilities: {
            gpuCount: 2,
            totalGpuMemoryMb: 48000,
            supportedMethods: ['dpo'],
            loadedModels: [],
          },
        })
      );

      const best = registry.getBestForTraining('sft');
      expect(best!.id).toBe('syn-1');

      const bestDpo = registry.getBestForTraining('dpo');
      expect(bestDpo!.id).toBe('syn-2');
    });

    it('should prefer the instance with the most GPU memory', () => {
      registry.register(
        makeInstance({
          id: 'syn-small',
          capabilities: {
            gpuCount: 1,
            totalGpuMemoryMb: 16000,
            supportedMethods: ['sft'],
            loadedModels: [],
          },
        })
      );
      registry.register(
        makeInstance({
          id: 'syn-large',
          capabilities: {
            gpuCount: 4,
            totalGpuMemoryMb: 96000,
            supportedMethods: ['sft'],
            loadedModels: [],
          },
        })
      );

      const best = registry.getBestForTraining('sft');
      expect(best!.id).toBe('syn-large');
    });

    it('should prefer the instance with more free GPU memory from heartbeats', () => {
      registry.register(
        makeInstance({
          id: 'syn-big-total',
          capabilities: {
            gpuCount: 4,
            totalGpuMemoryMb: 96000,
            supportedMethods: ['sft'],
            loadedModels: [],
          },
        })
      );
      registry.register(
        makeInstance({
          id: 'syn-small-total',
          capabilities: {
            gpuCount: 2,
            totalGpuMemoryMb: 48000,
            supportedMethods: ['sft'],
            loadedModels: [],
          },
        })
      );

      // Simulate heartbeats: big-total instance is nearly full, small-total has more free
      registry.updateHeartbeat('syn-big-total', {
        instanceId: 'syn-big-total',
        timestamp: Date.now(),
        loadedModels: [],
        gpuMemoryFreeMb: 5000,
        activeTrainingJobs: 3,
      });
      registry.updateHeartbeat('syn-small-total', {
        instanceId: 'syn-small-total',
        timestamp: Date.now(),
        loadedModels: [],
        gpuMemoryFreeMb: 40000,
        activeTrainingJobs: 0,
      });

      const best = registry.getBestForTraining('sft');
      expect(best!.id).toBe('syn-small-total');
    });

    it('should break ties by fewest active training jobs', () => {
      registry.register(
        makeInstance({
          id: 'syn-busy',
          capabilities: {
            gpuCount: 4,
            totalGpuMemoryMb: 48000,
            supportedMethods: ['sft'],
            loadedModels: [],
          },
        })
      );
      registry.register(
        makeInstance({
          id: 'syn-idle',
          capabilities: {
            gpuCount: 4,
            totalGpuMemoryMb: 48000,
            supportedMethods: ['sft'],
            loadedModels: [],
          },
        })
      );

      // Same free memory, different job counts
      registry.updateHeartbeat('syn-busy', {
        instanceId: 'syn-busy',
        timestamp: Date.now(),
        loadedModels: [],
        gpuMemoryFreeMb: 30000,
        activeTrainingJobs: 5,
      });
      registry.updateHeartbeat('syn-idle', {
        instanceId: 'syn-idle',
        timestamp: Date.now(),
        loadedModels: [],
        gpuMemoryFreeMb: 30000,
        activeTrainingJobs: 1,
      });

      const best = registry.getBestForTraining('sft');
      expect(best!.id).toBe('syn-idle');
    });

    it('should skip disconnected instances', () => {
      registry.register(
        makeInstance({
          id: 'syn-1',
          status: 'disconnected',
          capabilities: {
            gpuCount: 4,
            totalGpuMemoryMb: 96000,
            supportedMethods: ['sft'],
            loadedModels: [],
          },
        })
      );

      expect(registry.getBestForTraining('sft')).toBeNull();
    });
  });

  describe('updateHeartbeat', () => {
    it('should update loaded models and set connected', () => {
      const instance = makeInstance({ id: 'syn-1' });
      registry.register(instance);

      registry.updateHeartbeat('syn-1', {
        instanceId: 'syn-1',
        timestamp: Date.now(),
        loadedModels: ['llama-7b', 'mistral-7b'],
        gpuMemoryFreeMb: 30000,
        activeTrainingJobs: 2,
      });

      const updated = registry.get('syn-1')!;
      expect(updated.status).toBe('connected');
      expect(updated.capabilities.loadedModels).toEqual(['llama-7b', 'mistral-7b']);
    });

    it('should warn for unknown instance', () => {
      registry.updateHeartbeat('unknown', {
        instanceId: 'unknown',
        timestamp: Date.now(),
        loadedModels: [],
        gpuMemoryFreeMb: 0,
        activeTrainingJobs: 0,
      });
      // Should not throw
    });
  });

  describe('getGpuMemoryFreeMb', () => {
    it('should return undefined when no heartbeat recorded', () => {
      registry.register(makeInstance({ id: 'syn-1' }));
      expect(registry.getGpuMemoryFreeMb('syn-1')).toBeUndefined();
    });

    it('should return free memory after heartbeat update', () => {
      registry.register(makeInstance({ id: 'syn-1' }));
      registry.updateHeartbeat('syn-1', {
        instanceId: 'syn-1',
        timestamp: Date.now(),
        loadedModels: [],
        gpuMemoryFreeMb: 20000,
        activeTrainingJobs: 0,
      });
      expect(registry.getGpuMemoryFreeMb('syn-1')).toBe(20000);
    });

    it('should return undefined for unknown instance', () => {
      expect(registry.getGpuMemoryFreeMb('unknown')).toBeUndefined();
    });

    it('should clear free memory on unregister', () => {
      registry.register(makeInstance({ id: 'syn-1' }));
      registry.updateHeartbeat('syn-1', {
        instanceId: 'syn-1',
        timestamp: Date.now(),
        loadedModels: [],
        gpuMemoryFreeMb: 20000,
        activeTrainingJobs: 0,
      });
      registry.unregister('syn-1');
      expect(registry.getGpuMemoryFreeMb('syn-1')).toBeUndefined();
    });
  });

  describe('markDisconnected', () => {
    it('should set status to disconnected', () => {
      registry.register(makeInstance({ id: 'syn-1' }));
      registry.markDisconnected('syn-1');
      expect(registry.get('syn-1')!.status).toBe('disconnected');
    });
  });
});
