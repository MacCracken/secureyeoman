/**
 * WorkflowVersionManager unit tests (Phase 114)
 *
 * Tests business logic for recording, tagging, diffing, rolling back,
 * and drift detection of workflow versions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowVersionManager } from './workflow-version-manager.js';
import type { WorkflowVersionStorage } from './workflow-version-storage.js';
import type { WorkflowStorage } from './workflow-storage.js';

vi.mock('../soul/diff-utils.js', () => ({
  computeUnifiedDiff: vi.fn().mockReturnValue('--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new'),
}));

const WORKFLOW = {
  id: 'wf-1',
  name: 'Test Workflow',
  description: 'A test',
  steps: [{ id: 's1', type: 'agent', name: 'Step 1', config: {} }],
  edges: [],
  triggers: [],
  isEnabled: true,
};

const VERSION = {
  id: 'wv-1',
  workflowId: 'wf-1',
  versionTag: null as string | null,
  snapshot: { name: 'Test Workflow', steps: [{ id: 's1' }] },
  diffSummary: null as string | null,
  changedFields: [] as string[],
  author: 'system',
  createdAt: 1700000000000,
};

function makeMockVersionStorage(overrides: Partial<WorkflowVersionStorage> = {}): WorkflowVersionStorage {
  return {
    createVersion: vi.fn().mockResolvedValue(VERSION),
    listVersions: vi.fn().mockResolvedValue({ versions: [VERSION], total: 1 }),
    getVersion: vi.fn().mockResolvedValue(VERSION),
    getVersionByTag: vi.fn().mockResolvedValue(null),
    getLatestVersion: vi.fn().mockResolvedValue(null),
    getLatestTaggedVersion: vi.fn().mockResolvedValue(null),
    tagVersion: vi.fn().mockResolvedValue({ ...VERSION, versionTag: '2026.3.3' }),
    generateNextTag: vi.fn().mockResolvedValue('2026.3.3'),
    deleteVersionsForWorkflow: vi.fn().mockResolvedValue(0),
    ...overrides,
  } as unknown as WorkflowVersionStorage;
}

function makeMockWorkflowStorage(overrides: Partial<WorkflowStorage> = {}): WorkflowStorage {
  return {
    getDefinition: vi.fn().mockResolvedValue(WORKFLOW),
    updateDefinition: vi.fn().mockResolvedValue(WORKFLOW),
    ...overrides,
  } as unknown as WorkflowStorage;
}

describe('WorkflowVersionManager', () => {
  let manager: WorkflowVersionManager;
  let versionStorage: WorkflowVersionStorage;
  let workflowStorage: WorkflowStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    versionStorage = makeMockVersionStorage();
    workflowStorage = makeMockWorkflowStorage();
    manager = new WorkflowVersionManager({ versionStorage, workflowStorage });
  });

  describe('recordVersion', () => {
    it('records a version snapshot for current workflow state', async () => {
      const result = await manager.recordVersion('wf-1');
      expect(workflowStorage.getDefinition).toHaveBeenCalledWith('wf-1');
      expect(versionStorage.createVersion).toHaveBeenCalledWith(
        expect.objectContaining({ workflowId: 'wf-1', author: 'system' })
      );
      expect(result.id).toBe('wv-1');
    });

    it('passes custom author when provided', async () => {
      await manager.recordVersion('wf-1', 'admin');
      expect(versionStorage.createVersion).toHaveBeenCalledWith(
        expect.objectContaining({ author: 'admin' })
      );
    });

    it('throws when workflow not found', async () => {
      workflowStorage = makeMockWorkflowStorage({ getDefinition: vi.fn().mockResolvedValue(null) });
      manager = new WorkflowVersionManager({ versionStorage, workflowStorage });
      await expect(manager.recordVersion('missing')).rejects.toThrow('Workflow not found');
    });

    it('computes diff against previous version when one exists', async () => {
      const previous = { ...VERSION, id: 'wv-0', snapshot: { name: 'Old', steps: [] } };
      versionStorage = makeMockVersionStorage({ getLatestVersion: vi.fn().mockResolvedValue(previous) });
      manager = new WorkflowVersionManager({ versionStorage, workflowStorage });

      await manager.recordVersion('wf-1');

      expect(versionStorage.createVersion).toHaveBeenCalledWith(
        expect.objectContaining({ diffSummary: expect.any(String) })
      );
    });

    it('detects changed fields between versions', async () => {
      const previous = {
        ...VERSION,
        id: 'wv-0',
        snapshot: { name: 'OLD_NAME', steps: [], isEnabled: true },
      };
      versionStorage = makeMockVersionStorage({ getLatestVersion: vi.fn().mockResolvedValue(previous) });
      manager = new WorkflowVersionManager({ versionStorage, workflowStorage });

      await manager.recordVersion('wf-1');

      const createCall = (versionStorage.createVersion as any).mock.calls[0][0];
      expect(createCall.changedFields).toContain('name');
    });

    it('records empty changedFields and null diff when no previous version', async () => {
      await manager.recordVersion('wf-1');
      const createCall = (versionStorage.createVersion as any).mock.calls[0][0];
      expect(createCall.changedFields).toEqual([]);
      expect(createCall.diffSummary).toBeNull();
    });
  });

  describe('tagRelease', () => {
    it('records version and applies auto-generated tag', async () => {
      const result = await manager.tagRelease('wf-1');
      expect(versionStorage.generateNextTag).toHaveBeenCalledWith('wf-1');
      expect(versionStorage.tagVersion).toHaveBeenCalledWith('wv-1', '2026.3.3');
      expect(result.versionTag).toBe('2026.3.3');
    });

    it('uses custom tag when provided', async () => {
      await manager.tagRelease('wf-1', 'v1.0');
      expect(versionStorage.generateNextTag).not.toHaveBeenCalled();
      expect(versionStorage.tagVersion).toHaveBeenCalledWith('wv-1', 'v1.0');
    });

    it('passes author through', async () => {
      await manager.tagRelease('wf-1', undefined, 'admin');
      expect(versionStorage.createVersion).toHaveBeenCalledWith(
        expect.objectContaining({ author: 'admin' })
      );
    });
  });

  describe('listVersions', () => {
    it('delegates to storage', async () => {
      const result = await manager.listVersions('wf-1', { limit: 5 });
      expect(versionStorage.listVersions).toHaveBeenCalledWith('wf-1', { limit: 5 });
      expect(result.total).toBe(1);
    });
  });

  describe('getVersion', () => {
    it('returns version found by ID', async () => {
      const result = await manager.getVersion('wf-1', 'wv-1');
      expect(result?.id).toBe('wv-1');
    });

    it('falls back to tag lookup when ID belongs to different workflow', async () => {
      versionStorage = makeMockVersionStorage({
        getVersion: vi.fn().mockResolvedValue({ ...VERSION, workflowId: 'other' }),
        getVersionByTag: vi.fn().mockResolvedValue({ ...VERSION, versionTag: '2026.3.3' }),
      });
      manager = new WorkflowVersionManager({ versionStorage, workflowStorage });

      const result = await manager.getVersion('wf-1', '2026.3.3');
      expect(result?.versionTag).toBe('2026.3.3');
    });

    it('returns null when neither ID nor tag match', async () => {
      versionStorage = makeMockVersionStorage({
        getVersion: vi.fn().mockResolvedValue(null),
        getVersionByTag: vi.fn().mockResolvedValue(null),
      });
      manager = new WorkflowVersionManager({ versionStorage, workflowStorage });

      expect(await manager.getVersion('wf-1', 'nope')).toBeNull();
    });
  });

  describe('diffVersions', () => {
    it('computes unified diff between two versions', async () => {
      const vA = { ...VERSION, id: 'wv-a' };
      const vB = { ...VERSION, id: 'wv-b' };
      versionStorage = makeMockVersionStorage({
        getVersion: vi.fn().mockResolvedValueOnce(vA).mockResolvedValueOnce(vB),
      });
      manager = new WorkflowVersionManager({ versionStorage, workflowStorage });

      const diff = await manager.diffVersions('wv-a', 'wv-b');
      expect(diff).toContain('---');
    });

    it('throws when version A not found', async () => {
      versionStorage = makeMockVersionStorage({
        getVersion: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(VERSION),
      });
      manager = new WorkflowVersionManager({ versionStorage, workflowStorage });

      await expect(manager.diffVersions('missing', 'wv-1')).rejects.toThrow('Version not found: missing');
    });

    it('throws when version B not found', async () => {
      versionStorage = makeMockVersionStorage({
        getVersion: vi.fn().mockResolvedValueOnce(VERSION).mockResolvedValueOnce(null),
      });
      manager = new WorkflowVersionManager({ versionStorage, workflowStorage });

      await expect(manager.diffVersions('wv-1', 'missing')).rejects.toThrow('Version not found: missing');
    });
  });

  describe('rollback', () => {
    it('restores workflow from target version snapshot', async () => {
      const target = {
        ...VERSION,
        id: 'wv-old',
        snapshot: { name: 'Old Workflow', steps: [], isEnabled: false },
      };
      versionStorage = makeMockVersionStorage({
        getVersion: vi.fn().mockResolvedValue(target),
        getLatestVersion: vi.fn().mockResolvedValue(null),
        createVersion: vi.fn().mockResolvedValue({ ...VERSION, id: 'wv-new' }),
      });
      manager = new WorkflowVersionManager({ versionStorage, workflowStorage });

      const result = await manager.rollback('wf-1', 'wv-old');

      expect(workflowStorage.updateDefinition).toHaveBeenCalledWith(
        'wf-1',
        expect.objectContaining({ name: 'Old Workflow' })
      );
      expect(result.id).toBe('wv-new');
    });

    it('throws when target version not found', async () => {
      versionStorage = makeMockVersionStorage({ getVersion: vi.fn().mockResolvedValue(null) });
      manager = new WorkflowVersionManager({ versionStorage, workflowStorage });

      await expect(manager.rollback('wf-1', 'missing')).rejects.toThrow('Version not found');
    });

    it('throws when target version belongs to different workflow', async () => {
      versionStorage = makeMockVersionStorage({
        getVersion: vi.fn().mockResolvedValue({ ...VERSION, workflowId: 'other' }),
      });
      manager = new WorkflowVersionManager({ versionStorage, workflowStorage });

      await expect(manager.rollback('wf-1', 'wv-1')).rejects.toThrow('Version not found');
    });
  });

  describe('getDrift', () => {
    it('returns empty drift when no tagged versions exist', async () => {
      const drift = await manager.getDrift('wf-1');
      expect(drift.lastTaggedVersion).toBeNull();
      expect(drift.uncommittedChanges).toBe(0);
    });

    it('returns drift with changes when workflow diverged from tag', async () => {
      const tagged = {
        ...VERSION,
        versionTag: '2026.3.2',
        snapshot: { name: 'OLD_NAME', steps: [] },
      };
      versionStorage = makeMockVersionStorage({
        getLatestTaggedVersion: vi.fn().mockResolvedValue(tagged),
      });
      manager = new WorkflowVersionManager({ versionStorage, workflowStorage });

      const drift = await manager.getDrift('wf-1');
      expect(drift.lastTaggedVersion).toBe('2026.3.2');
      expect(drift.uncommittedChanges).toBeGreaterThan(0);
      expect(drift.changedFields).toContain('name');
    });

    it('throws when workflow not found', async () => {
      workflowStorage = makeMockWorkflowStorage({ getDefinition: vi.fn().mockResolvedValue(null) });
      manager = new WorkflowVersionManager({ versionStorage, workflowStorage });

      await expect(manager.getDrift('missing')).rejects.toThrow('Workflow not found');
    });
  });
});
