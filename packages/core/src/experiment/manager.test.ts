import { describe, it, expect, vi } from 'vitest';
import { ExperimentManager } from './manager.js';
import type { Experiment } from '@secureyeoman/shared';

const makeLogger = () => ({
  info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(),
  trace: vi.fn(), fatal: vi.fn(), child: vi.fn().mockReturnThis(), level: 'info',
});

const EXPERIMENT: Experiment = {
  id: 'exp-1',
  name: 'Button Color Test',
  description: 'A/B test for button color',
  status: 'pending',
  variants: [
    { id: 'v1', name: 'control', trafficPercent: 50 },
    { id: 'v2', name: 'variant', trafficPercent: 50 },
  ],
  createdAt: 1000,
  updatedAt: 1000,
} as unknown as Experiment;

function makeStorage(overrides: any = {}) {
  return {
    create: vi.fn().mockResolvedValue(EXPERIMENT),
    get: vi.fn().mockResolvedValue(EXPERIMENT),
    list: vi.fn().mockResolvedValue({ experiments: [EXPERIMENT], total: 1 }),
    delete: vi.fn().mockResolvedValue(true),
    update: vi.fn().mockResolvedValue(EXPERIMENT),
    ...overrides,
  };
}

function makeManager(storageOverrides: any = {}) {
  const storage = makeStorage(storageOverrides);
  const logger = makeLogger();
  const manager = new ExperimentManager(storage as any, { logger: logger as any });
  return { manager, storage, logger };
}

describe('ExperimentManager', () => {
  describe('create', () => {
    it('creates and returns experiment', async () => {
      const { manager, storage, logger } = makeManager();
      const result = await manager.create({ name: 'Test', variants: [] } as any);
      expect(result.id).toBe('exp-1');
      expect(storage.create).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Experiment created', { id: 'exp-1' });
    });
  });

  describe('get', () => {
    it('returns experiment by id', async () => {
      const { manager } = makeManager();
      const exp = await manager.get('exp-1');
      expect(exp?.id).toBe('exp-1');
    });

    it('returns null when not found', async () => {
      const { manager } = makeManager({ get: vi.fn().mockResolvedValue(null) });
      const exp = await manager.get('missing');
      expect(exp).toBeNull();
    });
  });

  describe('list', () => {
    it('returns list with total', async () => {
      const { manager } = makeManager();
      const result = await manager.list({ limit: 10, offset: 0 });
      expect(result.experiments).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('delete', () => {
    it('deletes experiment and logs', async () => {
      const { manager, logger } = makeManager();
      const ok = await manager.delete('exp-1');
      expect(ok).toBe(true);
      expect(logger.info).toHaveBeenCalledWith('Experiment deleted', { id: 'exp-1' });
    });

    it('returns false and does not log when not found', async () => {
      const { manager, logger } = makeManager({ delete: vi.fn().mockResolvedValue(false) });
      const ok = await manager.delete('missing');
      expect(ok).toBe(false);
      expect(logger.info).not.toHaveBeenCalled();
    });
  });

  describe('start', () => {
    it('starts pending experiment', async () => {
      const { manager, storage } = makeManager();
      await manager.start('exp-1');
      expect(storage.update).toHaveBeenCalledWith('exp-1', expect.objectContaining({ status: 'running' }));
    });

    it('returns running experiment unchanged', async () => {
      const runningExp = { ...EXPERIMENT, status: 'running' };
      const { manager, storage } = makeManager({ get: vi.fn().mockResolvedValue(runningExp) });
      const result = await manager.start('exp-1');
      expect(result?.status).toBe('running');
      expect(storage.update).not.toHaveBeenCalled();
    });

    it('returns null when experiment not found', async () => {
      const { manager } = makeManager({ get: vi.fn().mockResolvedValue(null) });
      const result = await manager.start('missing');
      expect(result).toBeNull();
    });
  });

  describe('stop', () => {
    it('stops running experiment', async () => {
      const runningExp = { ...EXPERIMENT, status: 'running' };
      const { manager, storage } = makeManager({ get: vi.fn().mockResolvedValue(runningExp) });
      await manager.stop('exp-1');
      expect(storage.update).toHaveBeenCalledWith('exp-1', expect.objectContaining({ status: 'completed' }));
    });

    it('returns non-running experiment unchanged', async () => {
      const { manager, storage } = makeManager(); // status: 'pending'
      await manager.stop('exp-1');
      expect(storage.update).not.toHaveBeenCalled();
    });
  });

  describe('selectVariant', () => {
    it('returns null when experiment not running', async () => {
      const { manager } = makeManager(); // status: 'pending'
      const variant = await manager.selectVariant('exp-1');
      expect(variant).toBeNull();
    });

    it('returns null when no variants', async () => {
      const runningExp = { ...EXPERIMENT, status: 'running', variants: [] };
      const { manager } = makeManager({ get: vi.fn().mockResolvedValue(runningExp) });
      const variant = await manager.selectVariant('exp-1');
      expect(variant).toBeNull();
    });

    it('returns a variant id when experiment is running', async () => {
      const runningExp = { ...EXPERIMENT, status: 'running' };
      const { manager } = makeManager({ get: vi.fn().mockResolvedValue(runningExp) });
      const variant = await manager.selectVariant('exp-1');
      expect(['v1', 'v2']).toContain(variant);
    });
  });
});
