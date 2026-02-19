import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
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
    expect(total).toBe(6);
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
    expect(total).toBe(6);
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
});

describe('Community Skill Sync', () => {
  let storage: MarketplaceStorage;
  let manager: MarketplaceManager;
  let tmpDir: string;

  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await truncateAllTables();
    storage = new MarketplaceStorage();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sy-community-test-'));
    manager = new MarketplaceManager(storage, {
      logger: createNoopLogger(),
      communityRepoPath: tmpDir,
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeSkill(relPath: string, content: object) {
    const fullPath = path.join(tmpDir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, JSON.stringify(content));
  }

  it('should sync community skills from a local path', async () => {
    writeSkill('skills/development/test-skill.json', {
      name: 'Test Skill',
      description: 'A test skill',
      instructions: 'Do the thing',
      category: 'development',
      author: 'tester',
      tags: ['test'],
    });

    const result = await manager.syncFromCommunity();
    expect(result.added).toBe(1);
    expect(result.errors).toHaveLength(0);

    const { skills } = await manager.search(undefined, undefined, 20, 0, 'community');
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('Test Skill');
    expect(skills[0].source).toBe('community');
  });

  it('should upsert (not duplicate) on second sync', async () => {
    writeSkill('skills/development/test-skill.json', {
      name: 'Upsert Skill',
      instructions: 'First version',
    });

    await manager.syncFromCommunity();
    await manager.syncFromCommunity();

    const { total } = await manager.search(undefined, undefined, 20, 0, 'community');
    expect(total).toBe(1);
  });

  it('should set source=community on brain skill when community skill is installed', async () => {
    const { brainManager } = createBrainManager();
    const mgr = new MarketplaceManager(storage, {
      logger: createNoopLogger(),
      brainManager,
      communityRepoPath: tmpDir,
    });

    writeSkill('skills/utilities/helper.json', {
      name: 'Community Helper',
      instructions: 'Help with things',
    });

    await mgr.syncFromCommunity();
    const { skills } = await mgr.search(undefined, undefined, 20, 0, 'community');
    expect(skills).toHaveLength(1);

    await mgr.install(skills[0].id);
    const communityBrainSkills = await brainManager.listSkills({ source: 'community' });
    expect(communityBrainSkills).toHaveLength(1);
    expect(communityBrainSkills[0].name).toBe('Community Helper');
  });

  it('should skip invalid JSON files and continue importing valid ones', async () => {
    writeSkill('skills/development/good-skill.json', {
      name: 'Good Skill',
      instructions: 'Works fine',
    });
    // Malformed JSON
    const badPath = path.join(tmpDir, 'skills', 'development', 'bad-skill.json');
    fs.writeFileSync(badPath, '{ not valid json }}}');
    // Valid JSON but missing required name
    writeSkill('skills/development/no-name.json', { instructions: 'No name here' });

    const result = await manager.syncFromCommunity();
    expect(result.added).toBe(1);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should return an error for a non-existent community path', async () => {
    const result = await manager.syncFromCommunity('/non/existent/path');
    expect(result.added).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/not found/i);
  });

  it('should use configured communityRepoPath when no argument passed', async () => {
    writeSkill('skills/development/configured-skill.json', {
      name: 'Configured Path Skill',
      instructions: 'Uses configured path',
    });
    // No argument — falls back to the communityRepoPath set in constructor (tmpDir)
    const result = await manager.syncFromCommunity();
    expect(result.added).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it('should return community status with skill count and last synced time', async () => {
    writeSkill('skills/productivity/status-skill.json', {
      name: 'Status Skill',
      instructions: 'For status testing',
    });
    await manager.syncFromCommunity();
    const status = await manager.getCommunityStatus();
    expect(status.skillCount).toBe(1);
    expect(status.lastSyncedAt).toBeGreaterThan(0);
  });
});
