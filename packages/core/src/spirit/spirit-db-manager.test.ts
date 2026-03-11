import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { SpiritStorage } from './storage.js';
import { SpiritManager } from './manager.js';
import type {
  SpiritConfig,
  SpiritManagerDeps,
  PassionCreate,
  InspirationCreate,
  PainCreate,
} from './types.js';
import type { SecureLogger } from '../logging/logger.js';
import { AuditChain, InMemoryAuditStorage } from '../logging/audit-chain.js';
import { setupTestDb, teardownTestDb, truncateAllTables } from '../test-setup.js';

// ── Helpers ──────────────────────────────────────────────────────

function noopLogger(): SecureLogger {
  const noop = () => {};
  return {
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    child: () => noopLogger(),
    level: 'silent',
  } as SecureLogger;
}

function defaultConfig(overrides?: Partial<SpiritConfig>): SpiritConfig {
  return {
    enabled: true,
    maxPassions: 20,
    maxInspirations: 20,
    maxPains: 20,
    ...overrides,
  };
}

function createDeps(): SpiritManagerDeps & { auditStorage: InMemoryAuditStorage } {
  const auditStorage = new InMemoryAuditStorage();
  const auditChain = new AuditChain({
    storage: auditStorage,
    signingKey: 'test-signing-key-must-be-at-least-32-chars!!',
  });
  return {
    auditChain,
    auditStorage,
    logger: noopLogger(),
  };
}

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

// ── SpiritManager Tests ────────────────────────────────────────

describe('SpiritManager', () => {
  let storage: SpiritStorage;
  let manager: SpiritManager;
  let deps: SpiritManagerDeps;

  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await truncateAllTables();
    storage = new SpiritStorage();
    deps = createDeps();
    manager = new SpiritManager(storage, defaultConfig(), deps);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  describe('passion management', () => {
    it('should create and list passions', async () => {
      await manager.createPassion(TEST_PASSION);
      expect((await manager.listPassions()).passions).toHaveLength(1);
    });

    it('should enforce max passions limit', async () => {
      const mgr = new SpiritManager(storage, defaultConfig({ maxPassions: 2 }), deps);
      await mgr.createPassion(TEST_PASSION);
      await mgr.createPassion({ ...TEST_PASSION, name: 'Second' });
      await expect(mgr.createPassion({ ...TEST_PASSION, name: 'Third' })).rejects.toThrow(
        'Maximum passion limit'
      );
    });

    it('should get active passions', async () => {
      await manager.createPassion(TEST_PASSION);
      await manager.createPassion({ ...TEST_PASSION, name: 'Inactive', isActive: false });
      expect(await manager.getActivePassions()).toHaveLength(1);
    });

    it('should update and delete passions', async () => {
      const p = await manager.createPassion(TEST_PASSION);
      const updated = await manager.updatePassion(p.id, { name: 'Updated' });
      expect(updated.name).toBe('Updated');
      expect(await manager.deletePassion(p.id)).toBe(true);
      expect((await manager.listPassions()).passions).toHaveLength(0);
    });
  });

  describe('inspiration management', () => {
    it('should create and list inspirations', async () => {
      await manager.createInspiration(TEST_INSPIRATION);
      expect((await manager.listInspirations()).inspirations).toHaveLength(1);
    });

    it('should enforce max inspirations limit', async () => {
      const mgr = new SpiritManager(storage, defaultConfig({ maxInspirations: 2 }), deps);
      await mgr.createInspiration(TEST_INSPIRATION);
      await mgr.createInspiration({ ...TEST_INSPIRATION, source: 'Second' });
      await expect(mgr.createInspiration({ ...TEST_INSPIRATION, source: 'Third' })).rejects.toThrow(
        'Maximum inspiration limit'
      );
    });

    it('should get active inspirations', async () => {
      await manager.createInspiration(TEST_INSPIRATION);
      await manager.createInspiration({ ...TEST_INSPIRATION, source: 'Inactive', isActive: false });
      expect(await manager.getActiveInspirations()).toHaveLength(1);
    });

    it('should update and delete inspirations', async () => {
      const i = await manager.createInspiration(TEST_INSPIRATION);
      const updated = await manager.updateInspiration(i.id, { source: 'Updated' });
      expect(updated.source).toBe('Updated');
      expect(await manager.deleteInspiration(i.id)).toBe(true);
      expect((await manager.listInspirations()).inspirations).toHaveLength(0);
    });
  });

  describe('pain management', () => {
    it('should create and list pains', async () => {
      await manager.createPain(TEST_PAIN);
      expect((await manager.listPains()).pains).toHaveLength(1);
    });

    it('should enforce max pains limit', async () => {
      const mgr = new SpiritManager(storage, defaultConfig({ maxPains: 2 }), deps);
      await mgr.createPain(TEST_PAIN);
      await mgr.createPain({ ...TEST_PAIN, trigger: 'Second' });
      await expect(mgr.createPain({ ...TEST_PAIN, trigger: 'Third' })).rejects.toThrow(
        'Maximum pain limit'
      );
    });

    it('should get active pains', async () => {
      await manager.createPain(TEST_PAIN);
      await manager.createPain({ ...TEST_PAIN, trigger: 'Inactive', isActive: false });
      expect(await manager.getActivePains()).toHaveLength(1);
    });

    it('should update and delete pains', async () => {
      const p = await manager.createPain(TEST_PAIN);
      const updated = await manager.updatePain(p.id, { trigger: 'Updated' });
      expect(updated.trigger).toBe('Updated');
      expect(await manager.deletePain(p.id)).toBe(true);
      expect((await manager.listPains()).pains).toHaveLength(0);
    });
  });

  describe('prompt composition', () => {
    it('should return empty string when disabled', async () => {
      const mgr = new SpiritManager(storage, defaultConfig({ enabled: false }), deps);
      expect(await mgr.composeSpiritPrompt()).toBe('');
    });

    it('should return empty string with no passions, inspirations, or pains', async () => {
      expect(await manager.composeSpiritPrompt()).toBe('');
    });

    it('should include passions in prompt', async () => {
      await manager.createPassion(TEST_PASSION);
      const prompt = await manager.composeSpiritPrompt();
      expect(prompt).toContain('## Spirit');
      expect(prompt).toContain('Your Spirit is the animating force within you');
      expect(prompt).toContain('### Passions');
      expect(prompt).toContain('Open Source');
      expect(prompt).toContain('intensity: 0.9');
    });

    it('should include inspirations in prompt', async () => {
      await manager.createInspiration(TEST_INSPIRATION);
      const prompt = await manager.composeSpiritPrompt();
      expect(prompt).toContain('### Inspirations');
      expect(prompt).toContain('Alan Turing');
      expect(prompt).toContain('impact: 0.95');
    });

    it('should include pains in prompt', async () => {
      await manager.createPain(TEST_PAIN);
      const prompt = await manager.composeSpiritPrompt();
      expect(prompt).toContain('### Pain Points');
      expect(prompt).toContain('Data Loss');
      expect(prompt).toContain('severity: 0.8');
    });

    it('should compose all three sections', async () => {
      await manager.createPassion(TEST_PASSION);
      await manager.createInspiration(TEST_INSPIRATION);
      await manager.createPain(TEST_PAIN);
      const prompt = await manager.composeSpiritPrompt();
      expect(prompt).toContain('### Passions');
      expect(prompt).toContain('### Inspirations');
      expect(prompt).toContain('### Pain Points');
    });

    it('should exclude inactive items from prompt', async () => {
      await manager.createPassion({ ...TEST_PASSION, isActive: false });
      await manager.createInspiration({ ...TEST_INSPIRATION, isActive: false });
      await manager.createPain({ ...TEST_PAIN, isActive: false });
      expect(await manager.composeSpiritPrompt()).toBe('');
    });
  });

  describe('stats', () => {
    it('should return correct stats', async () => {
      await manager.createPassion(TEST_PASSION);
      await manager.createPassion({ ...TEST_PASSION, name: 'Inactive', isActive: false });
      await manager.createInspiration(TEST_INSPIRATION);
      await manager.createPain(TEST_PAIN);
      await manager.createPain({ ...TEST_PAIN, trigger: 'Inactive', isActive: false });

      const stats = await manager.getStats();
      expect(stats.passions.total).toBe(2);
      expect(stats.passions.active).toBe(1);
      expect(stats.inspirations.total).toBe(1);
      expect(stats.inspirations.active).toBe(1);
      expect(stats.pains.total).toBe(2);
      expect(stats.pains.active).toBe(1);
    });
  });

  describe('config', () => {
    it('should return config', () => {
      expect(manager.getConfig()).toEqual(defaultConfig());
    });
  });
});
