import { describe, it, expect, vi } from 'vitest';
import { SpiritManager } from './manager.js';

const makeLogger = () => ({
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn().mockReturnThis(),
  level: 'info',
});

const PASSION = {
  id: 'pass-1',
  name: 'Security',
  description: 'Keeping things secure',
  intensity: 1,
  isActive: true,
  createdAt: 1000,
  updatedAt: 1000,
};
const INSPIRATION = {
  id: 'insp-1',
  source: 'Clean Code',
  description: 'Writing clean code',
  impact: 0.9,
  isActive: true,
  createdAt: 1000,
  updatedAt: 1000,
};
const PAIN = {
  id: 'pain-1',
  trigger: 'Security Breaches',
  description: 'Systems compromised',
  severity: 1,
  isActive: true,
  createdAt: 1000,
  updatedAt: 1000,
};

function makeStorage(overrides: any = {}) {
  return {
    createPassion: vi.fn().mockResolvedValue(PASSION),
    getPassion: vi.fn().mockResolvedValue(PASSION),
    updatePassion: vi.fn().mockResolvedValue(PASSION),
    deletePassion: vi.fn().mockResolvedValue(true),
    listPassions: vi.fn().mockResolvedValue({ passions: [PASSION], total: 1 }),
    getActivePassions: vi.fn().mockResolvedValue([PASSION]),
    getPassionCount: vi.fn().mockResolvedValue(0),
    createInspiration: vi.fn().mockResolvedValue(INSPIRATION),
    getInspiration: vi.fn().mockResolvedValue(INSPIRATION),
    updateInspiration: vi.fn().mockResolvedValue(INSPIRATION),
    deleteInspiration: vi.fn().mockResolvedValue(true),
    listInspirations: vi.fn().mockResolvedValue({ inspirations: [INSPIRATION], total: 1 }),
    getActiveInspirations: vi.fn().mockResolvedValue([INSPIRATION]),
    getInspirationCount: vi.fn().mockResolvedValue(0),
    createPain: vi.fn().mockResolvedValue(PAIN),
    getPain: vi.fn().mockResolvedValue(PAIN),
    updatePain: vi.fn().mockResolvedValue(PAIN),
    deletePain: vi.fn().mockResolvedValue(true),
    listPains: vi.fn().mockResolvedValue({ pains: [PAIN], total: 1 }),
    getActivePains: vi.fn().mockResolvedValue([PAIN]),
    getPainCount: vi.fn().mockResolvedValue(0),
    close: vi.fn(),
    ...overrides,
  };
}

function makeManager(storageOverrides: any = {}, configOverrides: any = {}) {
  const storage = makeStorage(storageOverrides);
  const logger = makeLogger();
  const config = {
    enabled: true,
    maxPassions: 10,
    maxInspirations: 10,
    maxPains: 10,
    ...configOverrides,
  };
  const deps = { logger: logger as any };
  const manager = new SpiritManager(storage as any, config as any, deps);
  return { manager, storage, logger, config };
}

describe('SpiritManager', () => {
  describe('passion operations', () => {
    it('createPassion delegates to storage', async () => {
      const { manager, storage } = makeManager();
      await manager.createPassion({
        name: 'Security',
        description: 'test',
        intensity: 1,
        isActive: true,
      });
      expect(storage.createPassion).toHaveBeenCalled();
    });

    it('createPassion throws when max limit reached', async () => {
      const { manager } = makeManager(
        { getPassionCount: vi.fn().mockResolvedValue(10) },
        { maxPassions: 10 }
      );
      await expect(
        manager.createPassion({ name: 'New', description: 'test', intensity: 1, isActive: true })
      ).rejects.toThrow('Maximum passion limit reached');
    });

    it('getPassion returns passion', async () => {
      const { manager } = makeManager();
      const p = await manager.getPassion('pass-1');
      expect(p?.id).toBe('pass-1');
    });

    it('updatePassion delegates to storage', async () => {
      const { manager, storage } = makeManager();
      await manager.updatePassion('pass-1', { intensity: 0.5 });
      expect(storage.updatePassion).toHaveBeenCalledWith('pass-1', { intensity: 0.5 });
    });

    it('deletePassion delegates to storage', async () => {
      const { manager } = makeManager();
      expect(await manager.deletePassion('pass-1')).toBe(true);
    });

    it('listPassions delegates to storage', async () => {
      const { manager } = makeManager();
      const result = await manager.listPassions();
      expect(result.passions).toHaveLength(1);
    });

    it('getActivePassions returns active passions', async () => {
      const { manager } = makeManager();
      const passions = await manager.getActivePassions();
      expect(passions).toHaveLength(1);
    });
  });

  describe('inspiration operations', () => {
    it('createInspiration throws when max limit reached', async () => {
      const { manager } = makeManager(
        { getInspirationCount: vi.fn().mockResolvedValue(10) },
        { maxInspirations: 10 }
      );
      await expect(
        manager.createInspiration({
          source: 'New',
          description: 'test',
          impact: 0.5,
          isActive: true,
        })
      ).rejects.toThrow('Maximum inspiration limit reached');
    });

    it('createInspiration delegates to storage', async () => {
      const { manager, storage } = makeManager();
      await manager.createInspiration({
        source: 'Clean Code',
        description: 'test',
        impact: 0.9,
        isActive: true,
      });
      expect(storage.createInspiration).toHaveBeenCalled();
    });

    it('getInspiration returns inspiration', async () => {
      const { manager } = makeManager();
      const i = await manager.getInspiration('insp-1');
      expect(i?.id).toBe('insp-1');
    });

    it('updateInspiration delegates to storage', async () => {
      const { manager, storage } = makeManager();
      await manager.updateInspiration('insp-1', { impact: 0.7 });
      expect(storage.updateInspiration).toHaveBeenCalledWith('insp-1', { impact: 0.7 });
    });

    it('deleteInspiration delegates to storage', async () => {
      const { manager } = makeManager();
      expect(await manager.deleteInspiration('insp-1')).toBe(true);
    });

    it('listInspirations delegates to storage', async () => {
      const { manager } = makeManager();
      const result = await manager.listInspirations();
      expect(result.inspirations).toHaveLength(1);
    });

    it('getActiveInspirations returns active inspirations', async () => {
      const { manager } = makeManager();
      const inspirations = await manager.getActiveInspirations();
      expect(inspirations).toHaveLength(1);
    });
  });

  describe('pain operations', () => {
    it('createPain throws when max limit reached', async () => {
      const { manager } = makeManager(
        { getPainCount: vi.fn().mockResolvedValue(10) },
        { maxPains: 10 }
      );
      await expect(
        manager.createPain({ trigger: 'New', description: 'test', severity: 0.5, isActive: true })
      ).rejects.toThrow('Maximum pain limit reached');
    });

    it('createPain delegates to storage', async () => {
      const { manager, storage } = makeManager();
      await manager.createPain({
        trigger: 'Security Breaches',
        description: 'test',
        severity: 1,
        isActive: true,
      });
      expect(storage.createPain).toHaveBeenCalled();
    });

    it('getPain returns pain', async () => {
      const { manager } = makeManager();
      const p = await manager.getPain('pain-1');
      expect(p?.id).toBe('pain-1');
    });

    it('updatePain delegates to storage', async () => {
      const { manager, storage } = makeManager();
      await manager.updatePain('pain-1', { severity: 0.5 });
      expect(storage.updatePain).toHaveBeenCalledWith('pain-1', { severity: 0.5 });
    });

    it('deletePain delegates to storage', async () => {
      const { manager } = makeManager();
      expect(await manager.deletePain('pain-1')).toBe(true);
    });

    it('listPains delegates to storage', async () => {
      const { manager } = makeManager();
      const result = await manager.listPains();
      expect(result.pains).toHaveLength(1);
    });

    it('getActivePains returns active pains', async () => {
      const { manager } = makeManager();
      const pains = await manager.getActivePains();
      expect(pains).toHaveLength(1);
    });
  });

  describe('composeSpiritPrompt', () => {
    it('returns empty string when disabled', async () => {
      const { manager } = makeManager({}, { enabled: false });
      expect(await manager.composeSpiritPrompt()).toBe('');
    });

    it('returns empty string when no active items', async () => {
      const { manager } = makeManager({
        getActivePassions: vi.fn().mockResolvedValue([]),
        getActiveInspirations: vi.fn().mockResolvedValue([]),
        getActivePains: vi.fn().mockResolvedValue([]),
      });
      expect(await manager.composeSpiritPrompt()).toBe('');
    });

    it('includes passions in prompt', async () => {
      const { manager } = makeManager({
        getActiveInspirations: vi.fn().mockResolvedValue([]),
        getActivePains: vi.fn().mockResolvedValue([]),
      });
      const prompt = await manager.composeSpiritPrompt();
      expect(prompt).toContain('## Spirit');
      expect(prompt).toContain('Security');
    });

    it('includes inspirations in prompt', async () => {
      const { manager } = makeManager({
        getActivePassions: vi.fn().mockResolvedValue([]),
        getActivePains: vi.fn().mockResolvedValue([]),
      });
      const prompt = await manager.composeSpiritPrompt();
      expect(prompt).toContain('Clean Code');
    });

    it('includes pains in prompt', async () => {
      const { manager } = makeManager({
        getActivePassions: vi.fn().mockResolvedValue([]),
        getActiveInspirations: vi.fn().mockResolvedValue([]),
      });
      const prompt = await manager.composeSpiritPrompt();
      expect(prompt).toContain('Security Breaches');
    });

    it('includes all sections when all active', async () => {
      const { manager } = makeManager();
      const prompt = await manager.composeSpiritPrompt();
      expect(prompt).toContain('Passions');
      expect(prompt).toContain('Inspirations');
      expect(prompt).toContain('Pain Points');
    });
  });

  describe('getStats', () => {
    it('returns stats with counts', async () => {
      const { manager } = makeManager({
        getPassionCount: vi.fn().mockResolvedValue(5),
        getInspirationCount: vi.fn().mockResolvedValue(3),
        getPainCount: vi.fn().mockResolvedValue(2),
      });
      const stats = await manager.getStats();
      expect(stats.passions.total).toBe(5);
      expect(stats.passions.active).toBe(1);
      expect(stats.inspirations.total).toBe(3);
      expect(stats.pains.total).toBe(2);
    });
  });

  describe('seedDefaultSpirit', () => {
    it('skips seeding when passions already exist', async () => {
      const { manager, storage } = makeManager({ getPassionCount: vi.fn().mockResolvedValue(2) });
      await manager.seedDefaultSpirit();
      expect(storage.createPassion).not.toHaveBeenCalled();
    });

    it('seeds default passions, inspirations, and pains', async () => {
      const { manager, storage } = makeManager();
      await manager.seedDefaultSpirit();
      expect(storage.createPassion).toHaveBeenCalledTimes(2);
      expect(storage.createInspiration).toHaveBeenCalledTimes(2);
      expect(storage.createPain).toHaveBeenCalledTimes(3);
    });
  });

  describe('getConfig / getSoul / close', () => {
    it('getConfig returns config', () => {
      const { manager, config } = makeManager();
      expect(manager.getConfig()).toEqual(config);
    });

    it('getSoul returns null when no soul provided', () => {
      const { manager } = makeManager();
      expect(manager.getSoul()).toBeNull();
    });

    it('close calls storage.close', () => {
      const { manager, storage } = makeManager();
      manager.close();
      expect(storage.close).toHaveBeenCalled();
    });
  });
});
