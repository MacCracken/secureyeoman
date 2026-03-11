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

describe('Community Skill Sync', () => {
  let storage: MarketplaceStorage;
  let manager: MarketplaceManager;
  let tmpDir: string;

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

  it('should set origin=community on synced community skill', async () => {
    writeSkill('skills/general/origin-skill.json', {
      name: 'Origin Check Skill',
      instructions: 'Tests origin derivation',
    });

    await manager.syncFromCommunity();
    const { skills } = await manager.search(undefined, undefined, 20, 0, 'community');
    expect(skills).toHaveLength(1);
    expect(skills[0].origin).toBe('community');
  });

  it('should propagate mcpToolsAllowed from JSON through sync → marketplace DB', async () => {
    writeSkill('skills/general/mcp-skill.json', {
      name: 'MCP Community Skill',
      instructions: 'Has mcp tool restrictions',
      mcpToolsAllowed: ['web_search'],
    });

    await manager.syncFromCommunity();
    const { skills } = await manager.search(undefined, undefined, 20, 0, 'community');
    expect(skills).toHaveLength(1);
    expect(skills[0].mcpToolsAllowed).toEqual(['web_search']);
  });

  it('should propagate routing quality fields from JSON through sync → marketplace DB', async () => {
    writeSkill('skills/development/routed-skill.json', {
      name: 'Routed Skill',
      instructions: 'Has routing metadata',
      useWhen: 'User asks for routing help',
      doNotUseWhen: 'User wants something else',
      successCriteria: 'Routing is clear',
      routing: 'explicit',
      autonomyLevel: 'L2',
    });

    await manager.syncFromCommunity();
    const { skills } = await manager.search(undefined, undefined, 20, 0, 'community');
    expect(skills).toHaveLength(1);
    expect(skills[0].useWhen).toBe('User asks for routing help');
    expect(skills[0].doNotUseWhen).toBe('User wants something else');
    expect(skills[0].successCriteria).toBe('Routing is clear');
    expect(skills[0].routing).toBe('explicit');
    expect(skills[0].autonomyLevel).toBe('L2');
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
      communityGitUrl: 'https://github.com/MacCracken/secureyeoman-community-repo',
    });

    const result = await manager.syncFromCommunity(
      undefined,
      'https://github.com/MacCracken/secureyeoman-community-repo'
    );
    expect(spy).toHaveBeenCalledWith(
      'https://github.com/MacCracken/secureyeoman-community-repo',
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
      'https://github.com/MacCracken/secureyeoman-community-repo'
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
      communityGitUrl: 'https://github.com/MacCracken/secureyeoman-community-repo',
    });

    const result = await manager.syncFromCommunity(
      undefined,
      'https://github.com/MacCracken/secureyeoman-community-repo'
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
      communityGitUrl: 'https://github.com/MacCracken/secureyeoman-community-repo',
    });

    // No repoUrl argument — falls back to communityGitUrl from config
    await manager.syncFromCommunity();
    expect(spy).toHaveBeenCalledWith(
      'https://github.com/MacCracken/secureyeoman-community-repo',
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
      'https://github.com/MacCracken/secureyeoman-community-repo'
    );
    expect(spy).not.toHaveBeenCalled();

    // Enable via updatePolicy
    manager.updatePolicy({ allowCommunityGitFetch: true });
    await manager.syncFromCommunity(
      undefined,
      'https://github.com/MacCracken/secureyeoman-community-repo'
    );
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
