/**
 * PersonalityVersionManager unit tests (Phase 114)
 *
 * Tests business logic for recording, tagging, diffing, rolling back,
 * and drift detection of personality versions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PersonalityVersionManager } from './personality-version-manager.js';
import type { PersonalityVersionStorage } from './personality-version-storage.js';
import type { SoulStorage } from './storage.js';
import type { PersonalityMarkdownSerializer } from './personality-serializer.js';

vi.mock('./diff-utils.js', () => ({
  computeUnifiedDiff: vi.fn().mockReturnValue('--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new'),
}));

const PERSONALITY = {
  id: 'pers-1',
  name: 'FRIDAY',
  systemPrompt: 'You are helpful.',
  traits: { humor: 0.5 },
  description: 'Assistant',
};

const VERSION = {
  id: 'pv-1',
  personalityId: 'pers-1',
  versionTag: null as string | null,
  snapshot: { name: 'FRIDAY', systemPrompt: 'You are helpful.' },
  snapshotMd: '# FRIDAY\nYou are helpful.',
  diffSummary: null as string | null,
  changedFields: [] as string[],
  author: 'system',
  createdAt: 1700000000000,
};

function makeMockStorage(overrides: Partial<PersonalityVersionStorage> = {}): PersonalityVersionStorage {
  return {
    createVersion: vi.fn().mockResolvedValue(VERSION),
    listVersions: vi.fn().mockResolvedValue({ versions: [VERSION], total: 1 }),
    getVersion: vi.fn().mockResolvedValue(VERSION),
    getVersionByTag: vi.fn().mockResolvedValue(null),
    getLatestVersion: vi.fn().mockResolvedValue(null),
    getLatestTaggedVersion: vi.fn().mockResolvedValue(null),
    tagVersion: vi.fn().mockResolvedValue({ ...VERSION, versionTag: '2026.3.3' }),
    generateNextTag: vi.fn().mockResolvedValue('2026.3.3'),
    deleteVersionsForPersonality: vi.fn().mockResolvedValue(0),
    ...overrides,
  } as unknown as PersonalityVersionStorage;
}

function makeMockSoulStorage(overrides: Partial<SoulStorage> = {}): SoulStorage {
  return {
    getPersonality: vi.fn().mockResolvedValue(PERSONALITY),
    updatePersonality: vi.fn().mockResolvedValue(PERSONALITY),
    ...overrides,
  } as unknown as SoulStorage;
}

function makeMockSerializer(): PersonalityMarkdownSerializer {
  return {
    toMarkdown: vi.fn().mockReturnValue('# FRIDAY\nYou are helpful.'),
  } as unknown as PersonalityMarkdownSerializer;
}

describe('PersonalityVersionManager', () => {
  let manager: PersonalityVersionManager;
  let versionStorage: PersonalityVersionStorage;
  let soulStorage: SoulStorage;
  let serializer: PersonalityMarkdownSerializer;

  beforeEach(() => {
    vi.clearAllMocks();
    versionStorage = makeMockStorage();
    soulStorage = makeMockSoulStorage();
    serializer = makeMockSerializer();
    manager = new PersonalityVersionManager({ versionStorage, soulStorage, serializer });
  });

  describe('recordVersion', () => {
    it('records a version snapshot for current personality state', async () => {
      const result = await manager.recordVersion('pers-1');
      expect(soulStorage.getPersonality).toHaveBeenCalledWith('pers-1');
      expect(serializer.toMarkdown).toHaveBeenCalled();
      expect(versionStorage.createVersion).toHaveBeenCalledWith(
        expect.objectContaining({
          personalityId: 'pers-1',
          author: 'system',
        })
      );
      expect(result.id).toBe('pv-1');
    });

    it('passes custom author when provided', async () => {
      await manager.recordVersion('pers-1', 'admin');
      expect(versionStorage.createVersion).toHaveBeenCalledWith(
        expect.objectContaining({ author: 'admin' })
      );
    });

    it('throws when personality not found', async () => {
      soulStorage = makeMockSoulStorage({ getPersonality: vi.fn().mockResolvedValue(null) });
      manager = new PersonalityVersionManager({ versionStorage, soulStorage, serializer });

      await expect(manager.recordVersion('missing')).rejects.toThrow('Personality not found');
    });

    it('computes diff against previous version when one exists', async () => {
      const previous = { ...VERSION, id: 'pv-0', snapshotMd: '# OLD\nOld prompt' };
      versionStorage = makeMockStorage({ getLatestVersion: vi.fn().mockResolvedValue(previous) });
      manager = new PersonalityVersionManager({ versionStorage, soulStorage, serializer });

      await manager.recordVersion('pers-1');

      expect(versionStorage.createVersion).toHaveBeenCalledWith(
        expect.objectContaining({
          diffSummary: expect.any(String),
        })
      );
    });

    it('detects changed fields when previous version exists', async () => {
      const previous = {
        ...VERSION,
        id: 'pv-0',
        snapshot: { name: 'OLD_NAME', systemPrompt: 'You are helpful.' },
      };
      versionStorage = makeMockStorage({ getLatestVersion: vi.fn().mockResolvedValue(previous) });
      manager = new PersonalityVersionManager({ versionStorage, soulStorage, serializer });

      await manager.recordVersion('pers-1');

      const createCall = (versionStorage.createVersion as any).mock.calls[0][0];
      expect(createCall.changedFields).toContain('name');
    });

    it('records empty changedFields when no previous version', async () => {
      await manager.recordVersion('pers-1');

      const createCall = (versionStorage.createVersion as any).mock.calls[0][0];
      expect(createCall.changedFields).toEqual([]);
      expect(createCall.diffSummary).toBeNull();
    });
  });

  describe('tagRelease', () => {
    it('records version and applies auto-generated tag', async () => {
      const result = await manager.tagRelease('pers-1');
      expect(versionStorage.generateNextTag).toHaveBeenCalledWith('pers-1');
      expect(versionStorage.tagVersion).toHaveBeenCalledWith('pv-1', '2026.3.3');
      expect(result.versionTag).toBe('2026.3.3');
    });

    it('uses custom tag when provided', async () => {
      await manager.tagRelease('pers-1', 'v1.0');
      expect(versionStorage.generateNextTag).not.toHaveBeenCalled();
      expect(versionStorage.tagVersion).toHaveBeenCalledWith('pv-1', 'v1.0');
    });

    it('passes author through to recordVersion', async () => {
      await manager.tagRelease('pers-1', undefined, 'admin');
      expect(versionStorage.createVersion).toHaveBeenCalledWith(
        expect.objectContaining({ author: 'admin' })
      );
    });
  });

  describe('listVersions', () => {
    it('delegates to storage with options', async () => {
      const result = await manager.listVersions('pers-1', { limit: 10 });
      expect(versionStorage.listVersions).toHaveBeenCalledWith('pers-1', { limit: 10 });
      expect(result.total).toBe(1);
    });
  });

  describe('getVersion', () => {
    it('returns version found by ID', async () => {
      const result = await manager.getVersion('pers-1', 'pv-1');
      expect(result?.id).toBe('pv-1');
    });

    it('falls back to tag lookup when ID does not match personality', async () => {
      versionStorage = makeMockStorage({
        getVersion: vi.fn().mockResolvedValue({ ...VERSION, personalityId: 'other' }),
        getVersionByTag: vi.fn().mockResolvedValue({ ...VERSION, versionTag: '2026.3.3' }),
      });
      manager = new PersonalityVersionManager({ versionStorage, soulStorage, serializer });

      const result = await manager.getVersion('pers-1', '2026.3.3');
      expect(versionStorage.getVersionByTag).toHaveBeenCalledWith('pers-1', '2026.3.3');
      expect(result?.versionTag).toBe('2026.3.3');
    });

    it('returns null when neither ID nor tag match', async () => {
      versionStorage = makeMockStorage({
        getVersion: vi.fn().mockResolvedValue(null),
        getVersionByTag: vi.fn().mockResolvedValue(null),
      });
      manager = new PersonalityVersionManager({ versionStorage, soulStorage, serializer });

      const result = await manager.getVersion('pers-1', 'nope');
      expect(result).toBeNull();
    });
  });

  describe('diffVersions', () => {
    it('computes unified diff between two versions', async () => {
      const vA = { ...VERSION, id: 'pv-a', snapshotMd: '# A' };
      const vB = { ...VERSION, id: 'pv-b', snapshotMd: '# B' };
      versionStorage = makeMockStorage({
        getVersion: vi.fn()
          .mockResolvedValueOnce(vA)
          .mockResolvedValueOnce(vB),
      });
      manager = new PersonalityVersionManager({ versionStorage, soulStorage, serializer });

      const diff = await manager.diffVersions('pv-a', 'pv-b');
      expect(diff).toContain('---');
    });

    it('throws when version A not found', async () => {
      versionStorage = makeMockStorage({
        getVersion: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(VERSION),
      });
      manager = new PersonalityVersionManager({ versionStorage, soulStorage, serializer });

      await expect(manager.diffVersions('missing', 'pv-1')).rejects.toThrow('Version not found: missing');
    });

    it('throws when version B not found', async () => {
      versionStorage = makeMockStorage({
        getVersion: vi.fn().mockResolvedValueOnce(VERSION).mockResolvedValueOnce(null),
      });
      manager = new PersonalityVersionManager({ versionStorage, soulStorage, serializer });

      await expect(manager.diffVersions('pv-1', 'missing')).rejects.toThrow('Version not found: missing');
    });
  });

  describe('rollback', () => {
    it('restores personality from target version snapshot', async () => {
      const target = {
        ...VERSION,
        id: 'pv-old',
        snapshot: { name: 'OLD_FRIDAY', systemPrompt: 'Old prompt', traits: {} },
      };
      versionStorage = makeMockStorage({
        getVersion: vi.fn().mockResolvedValue(target),
        getLatestVersion: vi.fn().mockResolvedValue(null),
        createVersion: vi.fn().mockResolvedValue({ ...VERSION, id: 'pv-new' }),
      });
      manager = new PersonalityVersionManager({ versionStorage, soulStorage, serializer });

      const result = await manager.rollback('pers-1', 'pv-old');

      expect(soulStorage.updatePersonality).toHaveBeenCalledWith(
        'pers-1',
        expect.objectContaining({ name: 'OLD_FRIDAY' })
      );
      expect(result.id).toBe('pv-new');
    });

    it('throws when target version not found', async () => {
      versionStorage = makeMockStorage({ getVersion: vi.fn().mockResolvedValue(null) });
      manager = new PersonalityVersionManager({ versionStorage, soulStorage, serializer });

      await expect(manager.rollback('pers-1', 'missing')).rejects.toThrow('Version not found');
    });

    it('throws when target version belongs to different personality', async () => {
      const wrongTarget = { ...VERSION, personalityId: 'other-pers' };
      versionStorage = makeMockStorage({ getVersion: vi.fn().mockResolvedValue(wrongTarget) });
      manager = new PersonalityVersionManager({ versionStorage, soulStorage, serializer });

      await expect(manager.rollback('pers-1', 'pv-1')).rejects.toThrow('Version not found');
    });
  });

  describe('getDrift', () => {
    it('returns empty drift when no tagged versions exist', async () => {
      const drift = await manager.getDrift('pers-1');
      expect(drift.lastTaggedVersion).toBeNull();
      expect(drift.lastTaggedAt).toBeNull();
      expect(drift.uncommittedChanges).toBe(0);
      expect(drift.changedFields).toEqual([]);
    });

    it('returns drift with changes when personality diverged from tag', async () => {
      const tagged = {
        ...VERSION,
        versionTag: '2026.3.2',
        snapshot: { name: 'OLD_NAME', systemPrompt: 'You are helpful.' },
        snapshotMd: '# OLD_NAME',
      };
      versionStorage = makeMockStorage({
        getLatestTaggedVersion: vi.fn().mockResolvedValue(tagged),
      });
      manager = new PersonalityVersionManager({ versionStorage, soulStorage, serializer });

      const drift = await manager.getDrift('pers-1');

      expect(drift.lastTaggedVersion).toBe('2026.3.2');
      expect(drift.uncommittedChanges).toBeGreaterThan(0);
      expect(drift.changedFields).toContain('name');
    });

    it('throws when personality not found', async () => {
      soulStorage = makeMockSoulStorage({ getPersonality: vi.fn().mockResolvedValue(null) });
      manager = new PersonalityVersionManager({ versionStorage, soulStorage, serializer });

      await expect(manager.getDrift('missing')).rejects.toThrow('Personality not found');
    });

    it('returns zero uncommitted changes when personality matches tagged snapshot', async () => {
      const tagged = {
        ...VERSION,
        versionTag: '2026.3.2',
        snapshot: { ...PERSONALITY },
        snapshotMd: '# FRIDAY\nYou are helpful.',
      };
      versionStorage = makeMockStorage({
        getLatestTaggedVersion: vi.fn().mockResolvedValue(tagged),
      });
      manager = new PersonalityVersionManager({ versionStorage, soulStorage, serializer });

      const drift = await manager.getDrift('pers-1');
      expect(drift.uncommittedChanges).toBe(0);
      expect(drift.changedFields).toEqual([]);
    });
  });
});
