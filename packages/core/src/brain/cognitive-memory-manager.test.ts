import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CognitiveMemoryManager } from './cognitive-memory-manager.js';
import type { CognitiveMemoryStorage } from './cognitive-memory-store.js';
import type { SecureLogger } from '../logging/logger.js';

function createMockStorage(): CognitiveMemoryStorage {
  return {
    decayAssociations: vi.fn().mockResolvedValue(5),
    getCognitiveStats: vi.fn().mockResolvedValue({
      topMemories: [{ id: 'm1', activation: 2.0 }],
      topDocuments: [{ id: 'd1', activation: 1.5 }],
      associationCount: 10,
      avgAssociationWeight: 0.5,
      accessTrend: [{ day: '2026-03-01', count: 3 }],
    }),
  } as unknown as CognitiveMemoryStorage;
}

function createMockLogger(): SecureLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as SecureLogger;
}

describe('CognitiveMemoryManager', () => {
  let manager: CognitiveMemoryManager;
  let storage: CognitiveMemoryStorage;
  let logger: SecureLogger;

  beforeEach(() => {
    storage = createMockStorage();
    logger = createMockLogger();
    manager = new CognitiveMemoryManager({
      storage,
      logger,
      hebbianDecayFactor: 0.9,
      maintenanceIntervalMs: 100_000,
    });
  });

  afterEach(() => {
    manager.stop();
  });

  describe('start/stop', () => {
    it('starts and stops without error', () => {
      manager.start();
      manager.stop();
    });

    it('idempotent start', () => {
      manager.start();
      manager.start(); // should not create duplicate timers
      manager.stop();
    });
  });

  describe('runMaintenance', () => {
    it('calls decayAssociations and returns deleted count', async () => {
      const result = await manager.runMaintenance();
      expect(result.decayed).toBe(5);
      expect(storage.decayAssociations).toHaveBeenCalledWith(0.9);
    });

    it('logs result', async () => {
      await manager.runMaintenance();
      expect(logger.info).toHaveBeenCalledWith(
        'Cognitive maintenance done',
        expect.objectContaining({ deleted: 5, decayFactor: 0.9 })
      );
    });
  });

  describe('getCognitiveStats', () => {
    it('returns stats from storage', async () => {
      const stats = await manager.getCognitiveStats();
      expect(stats.topMemories).toHaveLength(1);
      expect(stats.associationCount).toBe(10);
    });

    it('passes personalityId through', async () => {
      await manager.getCognitiveStats('pid-1');
      expect(storage.getCognitiveStats).toHaveBeenCalledWith('pid-1');
    });
  });
});
