import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { SpiritStorage } from './storage.js';
import type { PassionCreate, InspirationCreate, PainCreate } from './types.js';
import { setupTestDb, teardownTestDb, truncateAllTables } from '../test-setup.js';

// ── Helpers ──────────────────────────────────────────────────────

const TEST_PASSION: PassionCreate = {
  name: 'Open Source',
  description: 'Building and contributing to open source software',
  intensity: 0.9,
  isActive: true,
};

const TEST_INSPIRATION: InspirationCreate = {
  source: 'Alan Turing',
  description: 'Pioneer of computational theory and AI',
  impact: 0.95,
  isActive: true,
};

const TEST_PAIN: PainCreate = {
  trigger: 'Data Loss',
  description: 'Losing user data due to system failure',
  severity: 0.8,
  isActive: true,
};

// ── SpiritStorage Tests ────────────────────────────────────────

describe('SpiritStorage', () => {
  let storage: SpiritStorage;

  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await truncateAllTables();
    storage = new SpiritStorage();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  describe('passions', () => {
    it('should create and retrieve a passion', async () => {
      const p = await storage.createPassion(TEST_PASSION);
      expect(p.id).toBeDefined();
      expect(p.name).toBe('Open Source');
      expect(p.description).toBe('Building and contributing to open source software');
      expect(p.intensity).toBe(0.9);
      expect(p.isActive).toBe(true);

      const retrieved = await storage.getPassion(p.id);
      expect(retrieved).toEqual(p);
    });

    it('should return null for non-existent passion', async () => {
      expect(await storage.getPassion('nonexistent')).toBeNull();
    });

    it('should update a passion', async () => {
      const p = await storage.createPassion(TEST_PASSION);
      const updated = await storage.updatePassion(p.id, { name: 'Closed Source', intensity: 0.3 });
      expect(updated.name).toBe('Closed Source');
      expect(updated.intensity).toBe(0.3);
      expect(updated.description).toBe(p.description); // unchanged
    });

    it('should throw when updating non-existent passion', async () => {
      await expect(storage.updatePassion('nonexistent', { name: 'X' })).rejects.toThrow(
        'Passion not found'
      );
    });

    it('should delete a passion', async () => {
      const p = await storage.createPassion(TEST_PASSION);
      expect(await storage.deletePassion(p.id)).toBe(true);
      expect(await storage.getPassion(p.id)).toBeNull();
    });

    it('should return false when deleting non-existent passion', async () => {
      expect(await storage.deletePassion('nonexistent')).toBe(false);
    });

    it('should list passions ordered by intensity', async () => {
      await storage.createPassion({ ...TEST_PASSION, name: 'Low', intensity: 0.1 });
      await storage.createPassion({ ...TEST_PASSION, name: 'High', intensity: 0.9 });
      const list = await storage.listPassions();
      expect(list.passions).toHaveLength(2);
      expect(list.passions[0].name).toBe('High');
    });

    it('should get active passions only', async () => {
      await storage.createPassion(TEST_PASSION);
      await storage.createPassion({ ...TEST_PASSION, name: 'Inactive', isActive: false });
      const active = await storage.getActivePassions();
      expect(active).toHaveLength(1);
      expect(active[0].name).toBe('Open Source');
    });

    it('should count passions', async () => {
      expect(await storage.getPassionCount()).toBe(0);
      await storage.createPassion(TEST_PASSION);
      expect(await storage.getPassionCount()).toBe(1);
    });
  });

  describe('inspirations', () => {
    it('should create and retrieve an inspiration', async () => {
      const i = await storage.createInspiration(TEST_INSPIRATION);
      expect(i.id).toBeDefined();
      expect(i.source).toBe('Alan Turing');
      expect(i.description).toBe('Pioneer of computational theory and AI');
      expect(i.impact).toBe(0.95);
      expect(i.isActive).toBe(true);

      const retrieved = await storage.getInspiration(i.id);
      expect(retrieved).toEqual(i);
    });

    it('should return null for non-existent inspiration', async () => {
      expect(await storage.getInspiration('nonexistent')).toBeNull();
    });

    it('should update an inspiration', async () => {
      const i = await storage.createInspiration(TEST_INSPIRATION);
      const updated = await storage.updateInspiration(i.id, {
        source: 'Ada Lovelace',
        impact: 0.99,
      });
      expect(updated.source).toBe('Ada Lovelace');
      expect(updated.impact).toBe(0.99);
      expect(updated.description).toBe(i.description);
    });

    it('should throw when updating non-existent inspiration', async () => {
      await expect(storage.updateInspiration('nonexistent', { source: 'X' })).rejects.toThrow(
        'Inspiration not found'
      );
    });

    it('should delete an inspiration', async () => {
      const i = await storage.createInspiration(TEST_INSPIRATION);
      expect(await storage.deleteInspiration(i.id)).toBe(true);
      expect(await storage.getInspiration(i.id)).toBeNull();
    });

    it('should return false when deleting non-existent inspiration', async () => {
      expect(await storage.deleteInspiration('nonexistent')).toBe(false);
    });

    it('should list inspirations ordered by impact', async () => {
      await storage.createInspiration({ ...TEST_INSPIRATION, source: 'Low', impact: 0.1 });
      await storage.createInspiration({ ...TEST_INSPIRATION, source: 'High', impact: 0.9 });
      const list = await storage.listInspirations();
      expect(list.inspirations).toHaveLength(2);
      expect(list.inspirations[0].source).toBe('High');
    });

    it('should get active inspirations only', async () => {
      await storage.createInspiration(TEST_INSPIRATION);
      await storage.createInspiration({ ...TEST_INSPIRATION, source: 'Inactive', isActive: false });
      const active = await storage.getActiveInspirations();
      expect(active).toHaveLength(1);
      expect(active[0].source).toBe('Alan Turing');
    });

    it('should count inspirations', async () => {
      expect(await storage.getInspirationCount()).toBe(0);
      await storage.createInspiration(TEST_INSPIRATION);
      expect(await storage.getInspirationCount()).toBe(1);
    });
  });

  describe('pains', () => {
    it('should create and retrieve a pain', async () => {
      const p = await storage.createPain(TEST_PAIN);
      expect(p.id).toBeDefined();
      expect(p.trigger).toBe('Data Loss');
      expect(p.description).toBe('Losing user data due to system failure');
      expect(p.severity).toBe(0.8);
      expect(p.isActive).toBe(true);

      const retrieved = await storage.getPain(p.id);
      expect(retrieved).toEqual(p);
    });

    it('should return null for non-existent pain', async () => {
      expect(await storage.getPain('nonexistent')).toBeNull();
    });

    it('should update a pain', async () => {
      const p = await storage.createPain(TEST_PAIN);
      const updated = await storage.updatePain(p.id, { trigger: 'Memory Leak', severity: 0.6 });
      expect(updated.trigger).toBe('Memory Leak');
      expect(updated.severity).toBe(0.6);
      expect(updated.description).toBe(p.description);
    });

    it('should throw when updating non-existent pain', async () => {
      await expect(storage.updatePain('nonexistent', { trigger: 'X' })).rejects.toThrow(
        'Pain not found'
      );
    });

    it('should delete a pain', async () => {
      const p = await storage.createPain(TEST_PAIN);
      expect(await storage.deletePain(p.id)).toBe(true);
      expect(await storage.getPain(p.id)).toBeNull();
    });

    it('should return false when deleting non-existent pain', async () => {
      expect(await storage.deletePain('nonexistent')).toBe(false);
    });

    it('should list pains ordered by severity', async () => {
      await storage.createPain({ ...TEST_PAIN, trigger: 'Low', severity: 0.1 });
      await storage.createPain({ ...TEST_PAIN, trigger: 'High', severity: 0.9 });
      const list = await storage.listPains();
      expect(list.pains).toHaveLength(2);
      expect(list.pains[0].trigger).toBe('High');
    });

    it('should get active pains only', async () => {
      await storage.createPain(TEST_PAIN);
      await storage.createPain({ ...TEST_PAIN, trigger: 'Inactive', isActive: false });
      const active = await storage.getActivePains();
      expect(active).toHaveLength(1);
      expect(active[0].trigger).toBe('Data Loss');
    });

    it('should count pains', async () => {
      expect(await storage.getPainCount()).toBe(0);
      await storage.createPain(TEST_PAIN);
      expect(await storage.getPainCount()).toBe(1);
    });
  });

  describe('spirit meta', () => {
    it('should return null for non-existent meta key', async () => {
      expect(await storage.getMeta('nonexistent')).toBeNull();
    });

    it('should set and get meta', async () => {
      await storage.setMeta('theme', 'growth');
      expect(await storage.getMeta('theme')).toBe('growth');
    });

    it('should overwrite existing meta', async () => {
      await storage.setMeta('theme', 'growth');
      await storage.setMeta('theme', 'resilience');
      expect(await storage.getMeta('theme')).toBe('resilience');
    });
  });
});
