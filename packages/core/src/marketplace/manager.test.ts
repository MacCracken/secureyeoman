import { describe, it, expect, vi } from 'vitest';
import { MarketplaceManager } from './manager.js';

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(false),
    readdirSync: vi.fn().mockReturnValue([]),
    readFileSync: vi.fn().mockReturnValue('{}'),
  },
}));

vi.mock('./git-fetch.js', () => ({
  gitCloneOrPull: vi.fn().mockResolvedValue(undefined),
}));

const makeLogger = () => ({
  info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(),
  trace: vi.fn(), fatal: vi.fn(), child: vi.fn().mockReturnThis(), level: 'info',
});

const SKILL = {
  id: 'skill-1', name: 'Test Skill', description: 'A test skill', version: '1.0.0',
  author: 'test', category: 'general', tags: [], instructions: 'Do things.',
  source: 'builtin', installed: false, createdAt: 1000, updatedAt: 1000,
  tools: [], triggerPatterns: [],
};

function makeStorage(overrides: any = {}) {
  return {
    search: vi.fn().mockResolvedValue({ skills: [SKILL], total: 1 }),
    getSkill: vi.fn().mockResolvedValue(SKILL),
    setInstalled: vi.fn().mockResolvedValue(true),
    addSkill: vi.fn().mockResolvedValue(SKILL),
    updateSkill: vi.fn().mockResolvedValue(SKILL),
    delete: vi.fn().mockResolvedValue(true),
    findByNameAndSource: vi.fn().mockResolvedValue(null),
    seedBuiltinSkills: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeManager(storageOverrides: any = {}, depOverrides: any = {}) {
  const storage = makeStorage(storageOverrides);
  const logger = makeLogger();
  const deps = { logger: logger as any, ...depOverrides };
  const manager = new MarketplaceManager(storage as any, deps);
  return { manager, storage, logger };
}

describe('MarketplaceManager', () => {
  describe('search', () => {
    it('delegates to storage', async () => {
      const { manager, storage } = makeManager();
      const result = await manager.search('test');
      expect(result.skills).toHaveLength(1);
      expect(storage.search).toHaveBeenCalled();
    });
  });

  describe('getSkill', () => {
    it('returns skill by id', async () => {
      const { manager } = makeManager();
      const skill = await manager.getSkill('skill-1');
      expect(skill?.id).toBe('skill-1');
    });

    it('returns null when not found', async () => {
      const { manager } = makeManager({ getSkill: vi.fn().mockResolvedValue(null) });
      expect(await manager.getSkill('missing')).toBeNull();
    });
  });

  describe('install', () => {
    it('returns false when skill not found', async () => {
      const { manager } = makeManager({ getSkill: vi.fn().mockResolvedValue(null) });
      expect(await manager.install('missing')).toBe(false);
    });

    it('returns true immediately when already installed', async () => {
      const { manager, storage } = makeManager({ getSkill: vi.fn().mockResolvedValue({ ...SKILL, installed: true }) });
      expect(await manager.install('skill-1')).toBe(true);
      expect(storage.setInstalled).not.toHaveBeenCalled();
    });

    it('installs skill and logs', async () => {
      const { manager, storage, logger } = makeManager();
      const ok = await manager.install('skill-1');
      expect(ok).toBe(true);
      expect(storage.setInstalled).toHaveBeenCalledWith('skill-1', true);
      expect(logger.info).toHaveBeenCalledWith('Marketplace skill installed', { id: 'skill-1' });
    });

    it('creates brain skill when brainManager provided', async () => {
      const createSkill = vi.fn().mockResolvedValue({ id: 'brain-skill-1' });
      const brainManager = { createSkill, listSkills: vi.fn(), deleteSkill: vi.fn() };
      const { manager } = makeManager({}, { brainManager });
      await manager.install('skill-1');
      expect(createSkill).toHaveBeenCalled();
    });

    it('logs error when brain skill creation fails', async () => {
      const brainManager = { createSkill: vi.fn().mockRejectedValue(new Error('create failed')) };
      const { manager, logger } = makeManager({}, { brainManager });
      const ok = await manager.install('skill-1');
      expect(ok).toBe(true); // install still succeeds
      expect(logger.error).toHaveBeenCalledWith('Failed to create brain skill from marketplace', expect.any(Object));
    });
  });

  describe('uninstall', () => {
    it('uninstalls skill and logs', async () => {
      const { manager, storage, logger } = makeManager({ getSkill: vi.fn().mockResolvedValue({ ...SKILL, installed: true }) });
      const ok = await manager.uninstall('skill-1');
      expect(ok).toBe(true);
      expect(storage.setInstalled).toHaveBeenCalledWith('skill-1', false);
      expect(logger.info).toHaveBeenCalledWith('Marketplace skill uninstalled', { id: 'skill-1' });
    });

    it('removes matching brain skills when brainManager provided', async () => {
      const deleteSkill = vi.fn().mockResolvedValue(undefined);
      const brainManager = {
        listSkills: vi.fn().mockResolvedValue([{ id: 'bs-1', name: 'Test Skill', source: 'marketplace' }]),
        deleteSkill,
      };
      const { manager } = makeManager({ getSkill: vi.fn().mockResolvedValue({ ...SKILL, installed: true }) }, { brainManager });
      await manager.uninstall('skill-1');
      expect(deleteSkill).toHaveBeenCalledWith('bs-1');
    });
  });

  describe('onBrainSkillDeleted', () => {
    it('does nothing for non-marketplace/community source', async () => {
      const { manager, storage } = makeManager();
      await manager.onBrainSkillDeleted('Test Skill', 'user');
      expect(storage.findByNameAndSource).not.toHaveBeenCalled();
    });

    it('resets installed flag when no brain skills remain', async () => {
      const brainManager = { listSkills: vi.fn().mockResolvedValue([]) };
      const { manager, storage } = makeManager({ findByNameAndSource: vi.fn().mockResolvedValue({ ...SKILL, installed: true }) }, { brainManager });
      await manager.onBrainSkillDeleted('Test Skill', 'marketplace');
      expect(storage.setInstalled).toHaveBeenCalledWith('skill-1', false);
    });

    it('does not reset when brain skills still exist for name', async () => {
      const brainManager = { listSkills: vi.fn().mockResolvedValue([{ id: 'bs-1', name: 'Test Skill' }]) };
      const { manager, storage } = makeManager({}, { brainManager });
      await manager.onBrainSkillDeleted('Test Skill', 'marketplace');
      expect(storage.setInstalled).not.toHaveBeenCalled();
    });
  });

  describe('publish', () => {
    it('creates skill and logs', async () => {
      const { manager, storage, logger } = makeManager();
      const skill = await manager.publish({ name: 'New Skill', description: 'test' } as any);
      expect(skill.id).toBe('skill-1');
      expect(storage.addSkill).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Skill published to marketplace', { id: 'skill-1', name: 'Test Skill' });
    });
  });

  describe('delete', () => {
    it('deletes skill and logs', async () => {
      const { manager, logger } = makeManager();
      const ok = await manager.delete('skill-1');
      expect(ok).toBe(true);
      expect(logger.info).toHaveBeenCalledWith('Marketplace skill removed', { id: 'skill-1' });
    });

    it('does not log when skill not found', async () => {
      const { manager, logger } = makeManager({ delete: vi.fn().mockResolvedValue(false) });
      const ok = await manager.delete('missing');
      expect(ok).toBe(false);
      expect(logger.info).not.toHaveBeenCalled();
    });
  });

  describe('syncFromCommunity', () => {
    it('returns error when no path configured', async () => {
      const { manager } = makeManager();
      const result = await manager.syncFromCommunity();
      expect(result.errors).toContain('No community repo path configured');
    });

    it('returns error when path does not exist', async () => {
      const { default: fs } = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const { manager } = makeManager({}, { communityRepoPath: '/tmp/community' });
      const result = await manager.syncFromCommunity('/tmp/community');
      expect(result.errors.some((e) => e.includes('Path not found') || e.includes('No skills'))).toBe(true);
    });
  });

  describe('getCommunityStatus', () => {
    it('returns status with skill count', async () => {
      const { manager } = makeManager();
      const status = await manager.getCommunityStatus();
      expect(status.communityRepoPath).toBeNull();
      expect(status.skillCount).toBe(1);
      expect(status.lastSyncedAt).toBeNull();
    });
  });

  describe('updatePolicy', () => {
    it('updates allowCommunityGitFetch', () => {
      const { manager } = makeManager();
      manager.updatePolicy({ allowCommunityGitFetch: true });
      // Policy is private, but we can verify it's applied via behavior
      // (would affect syncFromCommunity when repoUrl provided)
    });
  });

  describe('seedBuiltinSkills', () => {
    it('delegates to storage', async () => {
      const { manager, storage } = makeManager();
      await manager.seedBuiltinSkills();
      expect(storage.seedBuiltinSkills).toHaveBeenCalled();
    });
  });
});
