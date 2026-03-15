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
    expect(total).toBe(45);
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

  it('should carry routing quality fields through install to brain skill', async () => {
    const skill = await manager.publish({
      name: 'Routed Marketplace Skill',
      instructions: 'Do the thing',
      useWhen: 'User wants routing',
      doNotUseWhen: 'Never',
      successCriteria: 'Routing done',
      routing: 'explicit',
      autonomyLevel: 'L2',
    });
    await manager.install(skill.id);

    const brainSkills = await brainManager.listSkills({ source: 'marketplace' });
    expect(brainSkills).toHaveLength(1);
    expect(brainSkills[0].useWhen).toBe('User wants routing');
    expect(brainSkills[0].doNotUseWhen).toBe('Never');
    expect(brainSkills[0].successCriteria).toBe('Routing done');
    expect(brainSkills[0].routing).toBe('explicit');
    expect(brainSkills[0].autonomyLevel).toBe('L2');
  });

  it('should carry mcpToolsAllowed through install to brain skill', async () => {
    const skill = await manager.publish({
      name: 'MCP Scoped Skill',
      instructions: 'Uses only specific MCP tools',
      mcpToolsAllowed: ['web_search', 'file_read'],
    });
    await manager.install(skill.id);

    const brainSkills = await brainManager.listSkills({ source: 'marketplace' });
    expect(brainSkills).toHaveLength(1);
    expect(brainSkills[0].mcpToolsAllowed).toEqual(['web_search', 'file_read']);
  });

  it('should set origin=marketplace on published catalog skill', async () => {
    const skill = await manager.publish({ name: 'Origin Test Skill', instructions: 'Test' });
    expect(skill.origin).toBe('marketplace');
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

  it('should set personalityId on the brain skill when provided', async () => {
    const skill = await manager.publish({
      name: 'Personality Skill',
      instructions: 'Scoped to a personality',
    });
    await manager.install(skill.id, 'test-personality-id');

    const brainSkills = await brainManager.listSkills({ source: 'marketplace' });
    expect(brainSkills).toHaveLength(1);
    expect(brainSkills[0].personalityId).toBe('test-personality-id');
  });

  it('should set personalityId=null when no personalityId provided (global)', async () => {
    const skill = await manager.publish({
      name: 'Global Skill',
      instructions: 'Not scoped to a personality',
    });
    await manager.install(skill.id);

    const brainSkills = await brainManager.listSkills({ source: 'marketplace' });
    expect(brainSkills).toHaveLength(1);
    expect(brainSkills[0].personalityId).toBeNull();
  });

  it('should remove ALL brain skills (global + per-personality) on uninstall', async () => {
    const skill = await manager.publish({ name: 'Multi-Install Skill', instructions: 'Shared' });
    await manager.install(skill.id);
    // Seed a second brain skill record (per-personality copy) to simulate re-install for another personality
    await brainManager.createSkill({
      name: 'Multi-Install Skill',
      instructions: 'Shared',
      source: 'marketplace',
      personalityId: 'personality-a',
      enabled: true,
      status: 'active',
      tools: [],
      triggerPatterns: [],
    });
    expect(await brainManager.listSkills({ source: 'marketplace' })).toHaveLength(2);

    await manager.uninstall(skill.id);
    expect(await brainManager.listSkills({ source: 'marketplace' })).toHaveLength(0);
    expect((await manager.getSkill(skill.id))!.installed).toBe(false);
  });

  it('should reset installed flag via onBrainSkillDeleted when no brain records remain', async () => {
    const skill = await manager.publish({ name: 'Sync Target', instructions: 'Will be deleted' });
    await manager.install(skill.id);
    expect((await manager.getSkill(skill.id))!.installed).toBe(true);

    // Simulate soul deleteSkill() path: brain record deleted, then notifies marketplace
    const brainSkills = await brainManager.listSkills({ source: 'marketplace' });
    await brainManager.deleteSkill(brainSkills[0].id);
    await manager.onBrainSkillDeleted('Sync Target', 'marketplace');

    expect((await manager.getSkill(skill.id))!.installed).toBe(false);
  });

  it('should NOT reset installed flag via onBrainSkillDeleted when other brain records remain', async () => {
    const skill = await manager.publish({ name: 'Partially Deleted', instructions: 'Some remain' });
    await manager.install(skill.id);
    // Add a second brain skill record (per-personality copy)
    await brainManager.createSkill({
      name: 'Partially Deleted',
      instructions: 'Some remain',
      source: 'marketplace',
      personalityId: 'personality-b',
      enabled: true,
      status: 'active',
      tools: [],
      triggerPatterns: [],
    });

    // Delete only the first (global) record, personality-b copy still exists
    const allBrainSkills = await brainManager.listSkills({ source: 'marketplace' });
    await brainManager.deleteSkill(allBrainSkills[0].id);
    await manager.onBrainSkillDeleted('Partially Deleted', 'marketplace');

    // personality-b brain record still exists — installed should stay true
    expect((await manager.getSkill(skill.id))!.installed).toBe(true);
  });
});
