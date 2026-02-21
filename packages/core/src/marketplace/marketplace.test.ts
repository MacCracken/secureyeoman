import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';
import { MarketplaceStorage } from './storage.js';
import { MarketplaceManager } from './manager.js';
import { BrainStorage } from '../brain/storage.js';
import { BrainManager } from '../brain/manager.js';
import { AuditChain, InMemoryAuditStorage } from '../logging/audit-chain.js';
import { createNoopLogger } from '../logging/logger.js';
import type { SecureLogger } from '../logging/logger.js';
import { setupTestDb, teardownTestDb, truncateAllTables } from '../test-setup.js';
import { validateGitUrl } from './git-fetch.js';

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

  it('should propagate triggerPatterns from JSON through sync → marketplace DB → brain skill on install', async () => {
    const { brainManager } = createBrainManager();
    const mgr = new MarketplaceManager(storage, {
      logger: createNoopLogger(),
      brainManager,
      communityRepoPath: tmpDir,
    });

    const patterns = ['review.*code|code.*review', '\\bpr\\b|pull.?request', '\\bdiff\\b'];
    writeSkill('skills/development/pattern-skill.json', {
      name: 'Pattern Skill',
      instructions: 'Reviews code',
      triggerPatterns: patterns,
    });

    await mgr.syncFromCommunity();
    const { skills } = await mgr.search(undefined, undefined, 20, 0, 'community');
    expect(skills).toHaveLength(1);
    // Patterns survive the JSON → marketplace DB round-trip
    expect(skills[0].triggerPatterns).toEqual(patterns);

    await mgr.install(skills[0].id);
    const brainSkills = await brainManager.listSkills({ source: 'community' });
    expect(brainSkills).toHaveLength(1);
    // Patterns survive the marketplace DB → brain skill install
    expect(brainSkills[0].triggerPatterns).toEqual(patterns);
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

  // ── Author metadata tests ──────────────────────────────────────────

  it('should parse object author into authorInfo and set author to name string', async () => {
    writeSkill('skills/development/authored-skill.json', {
      name: 'Authored Skill',
      instructions: 'Has rich author metadata',
      author: { name: 'Alice', github: 'alice', website: 'https://alice.dev', license: 'MIT' },
    });

    await manager.syncFromCommunity();
    const { skills } = await manager.search(undefined, undefined, 20, 0, 'community');
    expect(skills).toHaveLength(1);
    const skill = skills[0];
    expect(skill.author).toBe('Alice');
    expect(skill.authorInfo).toBeDefined();
    expect(skill.authorInfo!.github).toBe('alice');
    expect(skill.authorInfo!.website).toBe('https://alice.dev');
    expect(skill.authorInfo!.license).toBe('MIT');
  });

  it('should leave authorInfo undefined when author is a plain string (backward compat)', async () => {
    writeSkill('skills/development/string-author-skill.json', {
      name: 'String Author Skill',
      instructions: 'Uses legacy string author',
      author: 'legacy-author',
    });

    await manager.syncFromCommunity();
    const { skills } = await manager.search(undefined, undefined, 20, 0, 'community');
    expect(skills).toHaveLength(1);
    const skill = skills[0];
    expect(skill.author).toBe('legacy-author');
    expect(skill.authorInfo).toBeUndefined();
  });

  it('should round-trip authorInfo through storage', async () => {
    writeSkill('skills/development/roundtrip-skill.json', {
      name: 'Roundtrip Skill',
      instructions: 'Tests storage round-trip',
      author: { name: 'Bob', github: 'bobdev', website: 'https://bob.io' },
    });

    await manager.syncFromCommunity();

    // Retrieve directly from storage
    const found = await storage.findByNameAndSource('Roundtrip Skill', 'community');
    expect(found).not.toBeNull();
    expect(found!.authorInfo).toBeDefined();
    expect(found!.authorInfo!.github).toBe('bobdev');
    expect(found!.authorInfo!.website).toBe('https://bob.io');
    expect(found!.authorInfo!.license).toBeUndefined();
  });
});

// ── Git URL validation unit tests ──────────────────────────────────────────

describe('validateGitUrl', () => {
  it('should accept https:// URLs', () => {
    expect(() => validateGitUrl('https://github.com/org/repo')).not.toThrow();
  });

  it('should accept file:// URLs', () => {
    expect(() => validateGitUrl('file:///tmp/local-repo')).not.toThrow();
  });

  it('should reject git:// URLs', () => {
    expect(() => validateGitUrl('git://github.com/org/repo')).toThrow(/not allowed/);
  });

  it('should reject ssh:// URLs', () => {
    expect(() => validateGitUrl('ssh://git@github.com/org/repo')).toThrow(/not allowed/);
  });

  it('should reject http:// URLs (downgrade risk)', () => {
    expect(() => validateGitUrl('http://github.com/org/repo')).toThrow(/not allowed/);
  });

  it('should throw on malformed URLs', () => {
    expect(() => validateGitUrl('not-a-url')).toThrow();
  });
});

// ── Git fetch integration tests (mocked) ──────────────────────────────────

describe('Community Skill Sync — git fetch', () => {
  let storage: MarketplaceStorage;
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
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sy-gitfetch-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function writeSkill(relPath: string, content: object) {
    const fullPath = path.join(tmpDir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, JSON.stringify(content));
  }

  it('should call gitCloneOrPull when allowCommunityGitFetch is true and repoUrl provided', async () => {
    // Pre-create the skills dir so the sync can proceed after the "clone"
    writeSkill('skills/dev/mocked-skill.json', {
      name: 'Mocked Git Skill',
      instructions: 'Synced after git clone',
    });

    const gitFetch = await import('./git-fetch.js');
    const spy = vi.spyOn(gitFetch, 'gitCloneOrPull').mockResolvedValue(undefined);

    const manager = new MarketplaceManager(storage, {
      logger: createNoopLogger(),
      communityRepoPath: tmpDir,
      allowCommunityGitFetch: true,
      communityGitUrl: 'https://github.com/MacCracken/secureyeoman-community-skills',
    });

    const result = await manager.syncFromCommunity(
      undefined,
      'https://github.com/MacCracken/secureyeoman-community-skills'
    );
    expect(spy).toHaveBeenCalledWith(
      'https://github.com/MacCracken/secureyeoman-community-skills',
      tmpDir,
      expect.anything()
    );
    expect(result.errors).toHaveLength(0);
    expect(result.added).toBe(1);
  });

  it('should NOT call gitCloneOrPull when allowCommunityGitFetch is false', async () => {
    writeSkill('skills/dev/local-skill.json', {
      name: 'Local Only Skill',
      instructions: 'No git fetch',
    });

    const gitFetch = await import('./git-fetch.js');
    const spy = vi.spyOn(gitFetch, 'gitCloneOrPull').mockResolvedValue(undefined);

    const manager = new MarketplaceManager(storage, {
      logger: createNoopLogger(),
      communityRepoPath: tmpDir,
      allowCommunityGitFetch: false,
    });

    const result = await manager.syncFromCommunity(
      undefined,
      'https://github.com/MacCracken/secureyeoman-community-skills'
    );
    expect(spy).not.toHaveBeenCalled();
    expect(result.added).toBe(1);
  });

  it('should push git error to result.errors and return early on git failure', async () => {
    const gitFetch = await import('./git-fetch.js');
    vi.spyOn(gitFetch, 'gitCloneOrPull').mockRejectedValue(new Error('git clone failed: timeout'));

    const manager = new MarketplaceManager(storage, {
      logger: createNoopLogger(),
      communityRepoPath: tmpDir,
      allowCommunityGitFetch: true,
      communityGitUrl: 'https://github.com/MacCracken/secureyeoman-community-skills',
    });

    const result = await manager.syncFromCommunity(
      undefined,
      'https://github.com/MacCracken/secureyeoman-community-skills'
    );
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/git clone failed/i);
    expect(result.added).toBe(0);
  });

  it('should use communityGitUrl from manager config when no repoUrl in request', async () => {
    writeSkill('skills/dev/configured-skill.json', {
      name: 'Configured Git Skill',
      instructions: 'Uses configured communityGitUrl',
    });

    const gitFetch = await import('./git-fetch.js');
    const spy = vi.spyOn(gitFetch, 'gitCloneOrPull').mockResolvedValue(undefined);

    const manager = new MarketplaceManager(storage, {
      logger: createNoopLogger(),
      communityRepoPath: tmpDir,
      allowCommunityGitFetch: true,
      communityGitUrl: 'https://github.com/MacCracken/secureyeoman-community-skills',
    });

    // No repoUrl argument — falls back to communityGitUrl from config
    await manager.syncFromCommunity();
    expect(spy).toHaveBeenCalledWith(
      'https://github.com/MacCracken/secureyeoman-community-skills',
      tmpDir,
      expect.anything()
    );
  });

  it('updatePolicy should toggle allowCommunityGitFetch at runtime', async () => {
    writeSkill('skills/dev/policy-skill.json', {
      name: 'Policy Toggle Skill',
      instructions: 'Tests updatePolicy',
    });

    const gitFetch = await import('./git-fetch.js');
    const spy = vi.spyOn(gitFetch, 'gitCloneOrPull').mockResolvedValue(undefined);

    const manager = new MarketplaceManager(storage, {
      logger: createNoopLogger(),
      communityRepoPath: tmpDir,
      allowCommunityGitFetch: false,
    });

    // Git fetch disabled — spy not called
    await manager.syncFromCommunity(
      undefined,
      'https://github.com/MacCracken/secureyeoman-community-skills'
    );
    expect(spy).not.toHaveBeenCalled();

    // Enable via updatePolicy
    manager.updatePolicy({ allowCommunityGitFetch: true });
    await manager.syncFromCommunity(
      undefined,
      'https://github.com/MacCracken/secureyeoman-community-skills'
    );
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
