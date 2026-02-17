import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { MarketplaceStorage } from './storage.js';
import { MarketplaceManager } from './manager.js';
import { BrainStorage } from '../brain/storage.js';
import { BrainManager } from '../brain/manager.js';
import { AuditChain, InMemoryAuditStorage } from '../logging/audit-chain.js';
import { createNoopLogger } from '../logging/logger.js';
import type { SecureLogger } from '../logging/logger.js';
import { setupTestDb, teardownTestDb, truncateAllTables } from '../test-setup.js';

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

function createBrainManager(): { brainStorage: BrainStorage; brainManager: BrainManager } {
  const brainStorage = new BrainStorage();
  const auditStorage = new InMemoryAuditStorage();
  const auditChain = new AuditChain({
    storage: auditStorage,
    signingKey: 'test-signing-key-must-be-at-least-32-chars!!',
  });
  const brainManager = new BrainManager(
    brainStorage,
    {
      enabled: true,
      maxMemories: 10000,
      maxKnowledge: 5000,
      memoryRetentionDays: 90,
      importanceDecayRate: 0.01,
      contextWindowMemories: 10,
    },
    { auditChain, logger: noopLogger() }
  );
  return { brainStorage, brainManager };
}

beforeAll(async () => {
  await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

describe('MarketplaceStorage', () => {
  let storage: MarketplaceStorage;

  beforeEach(async () => {
    await truncateAllTables();
    storage = new MarketplaceStorage();
  });

  it('should add and retrieve a skill', async () => {
    const skill = await storage.addSkill({ name: 'Test Skill', category: 'ai' });
    expect(skill.id).toBeTruthy();
    expect((await storage.getSkill(skill.id))!.name).toBe('Test Skill');
  });

  it('should search skills', async () => {
    await storage.addSkill({ name: 'AI Helper', category: 'ai' });
    await storage.addSkill({ name: 'Code Formatter', category: 'dev' });
    const { skills, total } = await storage.search('AI');
    expect(total).toBe(1);
    expect(skills[0].name).toBe('AI Helper');
  });

  it('should install/uninstall', async () => {
    const skill = await storage.addSkill({ name: 'Installable' });
    expect(await storage.setInstalled(skill.id, true)).toBe(true);
    expect((await storage.getSkill(skill.id))!.installed).toBe(true);
    expect(await storage.setInstalled(skill.id, false)).toBe(true);
    expect((await storage.getSkill(skill.id))!.installed).toBe(false);
  });

  it('should delete skills', async () => {
    const skill = await storage.addSkill({ name: 'Deletable' });
    expect(await storage.delete(skill.id)).toBe(true);
    expect(await storage.getSkill(skill.id)).toBeNull();
  });

  it('should seed builtin skills', async () => {
    await storage.seedBuiltinSkills();
    const { skills, total } = await storage.search();
    expect(total).toBe(7);
    const summarizeSkill = skills.find((s) => s.name === 'Summarize Text');
    expect(summarizeSkill).toBeDefined();
    expect(summarizeSkill!.author).toBe('YEOMAN');
    expect(summarizeSkill!.category).toBe('utilities');
    const designerSkill = skills.find((s) => s.name === 'Senior Web Designer');
    expect(designerSkill).toBeDefined();
    expect(designerSkill!.category).toBe('design');
  });

  it('should be idempotent when seeding builtin skills', async () => {
    await storage.seedBuiltinSkills();
    await storage.seedBuiltinSkills();
    const { skills } = await storage.search('Summarize');
    expect(skills).toHaveLength(1);
  });
});

describe('MarketplaceManager', () => {
  let storage: MarketplaceStorage;
  let manager: MarketplaceManager;

  beforeEach(async () => {
    await truncateAllTables();
    storage = new MarketplaceStorage();
    manager = new MarketplaceManager(storage, { logger: createNoopLogger() });
  });

  it('should publish and search', async () => {
    await manager.publish({ name: 'Published Skill', category: 'test' });
    const { skills } = await manager.search();
    expect(skills).toHaveLength(1);
  });

  it('should install and uninstall', async () => {
    const skill = await manager.publish({ name: 'My Skill' });
    expect(await manager.install(skill.id)).toBe(true);
    expect((await manager.getSkill(skill.id))!.installed).toBe(true);
    expect(await manager.uninstall(skill.id)).toBe(true);
  });

  it('should return false when installing a non-existent skill', async () => {
    expect(await manager.install('non-existent-id')).toBe(false);
  });

  it('should seed builtin skills via manager', async () => {
    await manager.seedBuiltinSkills();
    const { skills, total } = await manager.search();
    expect(total).toBe(7);
    const summarizeSkill = skills.find((s) => s.name === 'Summarize Text');
    expect(summarizeSkill).toBeDefined();
  });
});

describe('MarketplaceManager with BrainManager', () => {
  let storage: MarketplaceStorage;
  let manager: MarketplaceManager;
  let brainStorage: BrainStorage;
  let brainManager: BrainManager;

  beforeEach(async () => {
    await truncateAllTables();
    storage = new MarketplaceStorage();
    const brain = createBrainManager();
    brainStorage = brain.brainStorage;
    brainManager = brain.brainManager;
    manager = new MarketplaceManager(storage, {
      logger: createNoopLogger(),
      brainManager,
    });
  });

  it('should create a brain skill on install', async () => {
    const skill = await manager.publish({
      name: 'Test Marketplace Skill',
      description: 'A test skill',
      instructions: 'Do the thing',
    });
    await manager.install(skill.id);

    const brainSkills = await brainManager.listSkills({ source: 'marketplace' });
    expect(brainSkills).toHaveLength(1);
    expect(brainSkills[0].name).toBe('Test Marketplace Skill');
    expect(brainSkills[0].source).toBe('marketplace');
    expect(brainSkills[0].instructions).toBe('Do the thing');
  });

  it('should remove the brain skill on uninstall', async () => {
    const skill = await manager.publish({
      name: 'Removable Skill',
      instructions: 'Instructions here',
    });
    await manager.install(skill.id);
    expect(await brainManager.listSkills({ source: 'marketplace' })).toHaveLength(1);

    await manager.uninstall(skill.id);
    expect(await brainManager.listSkills({ source: 'marketplace' })).toHaveLength(0);
  });

  it('should not create duplicate brain skills on double install', async () => {
    const skill = await manager.publish({ name: 'Double Install' });
    await manager.install(skill.id);
    // Second install won't flip storage again (already installed), so no duplicate
    await manager.install(skill.id);
    const brainSkills = await brainManager.listSkills({ source: 'marketplace' });
    expect(brainSkills).toHaveLength(1);
  });
});
