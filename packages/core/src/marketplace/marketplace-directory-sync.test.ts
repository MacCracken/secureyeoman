/**
 * Marketplace Manager — directory-based workflow/swarm sync tests (Phase 113)
 *
 * Tests the findDirectoryEntries, readOptionalMd helpers and directory-based
 * syncFromCommunity() logic for workflows/ and swarms/ directories.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MarketplaceManager } from './manager.js';
import type { MarketplaceStorage } from './storage.js';
import type { WorkflowManager } from '../workflow/workflow-manager.js';
import type { SwarmManager } from '../agents/swarm-manager.js';
import { createNoopLogger } from '../logging/logger.js';

function mockStorage(): MarketplaceStorage {
  return {
    search: vi.fn().mockResolvedValue({ skills: [], total: 0 }),
    findByNameAndSource: vi.fn().mockResolvedValue(null),
    addSkill: vi.fn().mockResolvedValue({ id: 's1', name: 'x' }),
    updateSkill: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(true),
    getSkill: vi.fn().mockResolvedValue(null),
    setInstalled: vi.fn().mockResolvedValue(undefined),
    seedBuiltinSkills: vi.fn().mockResolvedValue(undefined),
  } as unknown as MarketplaceStorage;
}

function mockWorkflowManager(overrides?: Partial<WorkflowManager>): WorkflowManager {
  return {
    listDefinitions: vi.fn().mockResolvedValue({ definitions: [], total: 0 }),
    createDefinition: vi.fn().mockResolvedValue({ id: 'wf-1', name: 'x' }),
    updateDefinition: vi.fn().mockResolvedValue({ id: 'wf-1', name: 'x' }),
    deleteDefinition: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as unknown as WorkflowManager;
}

function mockSwarmManager(overrides?: Partial<SwarmManager>): SwarmManager {
  return {
    listTemplates: vi.fn().mockResolvedValue({ templates: [], total: 0 }),
    createTemplate: vi.fn().mockResolvedValue({ id: 'tmpl-1', name: 'x' }),
    updateTemplate: vi.fn().mockResolvedValue({ id: 'tmpl-1', name: 'x' }),
    deleteTemplate: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as unknown as SwarmManager;
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sy-dirsync-test-'));
  fs.mkdirSync(path.join(tmpDir, 'skills'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeJson(relPath: string, content: object) {
  const fullPath = path.join(tmpDir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, JSON.stringify(content));
}

function writeMd(relPath: string, content: string) {
  const fullPath = path.join(tmpDir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

// ── Helper function tests ─────────────────────────────────────────────────────

describe('findDirectoryEntries', () => {
  it('returns empty array for empty directory', () => {
    fs.mkdirSync(path.join(tmpDir, 'workflows'), { recursive: true });
    const mgr = new MarketplaceManager(mockStorage(), {
      logger: createNoopLogger(),
      communityRepoPath: tmpDir,
    });
    const entries = mgr.findDirectoryEntries(path.join(tmpDir, 'workflows'));
    expect(entries).toEqual([]);
  });

  it('returns directories that contain metadata.json', () => {
    writeJson('workflows/my-wf/metadata.json', { name: 'test' });
    fs.mkdirSync(path.join(tmpDir, 'workflows', 'no-metadata'), { recursive: true });

    const mgr = new MarketplaceManager(mockStorage(), {
      logger: createNoopLogger(),
      communityRepoPath: tmpDir,
    });
    const entries = mgr.findDirectoryEntries(path.join(tmpDir, 'workflows'));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toContain('my-wf');
  });

  it('ignores files at top level', () => {
    writeJson('workflows/flat.json', { name: 'flat' });
    const mgr = new MarketplaceManager(mockStorage(), {
      logger: createNoopLogger(),
      communityRepoPath: tmpDir,
    });
    const entries = mgr.findDirectoryEntries(path.join(tmpDir, 'workflows'));
    expect(entries).toEqual([]);
  });

  it('returns multiple directory entries', () => {
    writeJson('workflows/wf-a/metadata.json', { name: 'a' });
    writeJson('workflows/wf-b/metadata.json', { name: 'b' });
    const mgr = new MarketplaceManager(mockStorage(), {
      logger: createNoopLogger(),
      communityRepoPath: tmpDir,
    });
    const entries = mgr.findDirectoryEntries(path.join(tmpDir, 'workflows'));
    expect(entries).toHaveLength(2);
  });
});

describe('readOptionalMd', () => {
  it('returns content when file exists', () => {
    writeMd('test.md', '# Hello');
    const mgr = new MarketplaceManager(mockStorage(), {
      logger: createNoopLogger(),
      communityRepoPath: tmpDir,
    });
    expect(mgr.readOptionalMd(path.join(tmpDir, 'test.md'))).toBe('# Hello');
  });

  it('returns null when file does not exist', () => {
    const mgr = new MarketplaceManager(mockStorage(), {
      logger: createNoopLogger(),
      communityRepoPath: tmpDir,
    });
    expect(mgr.readOptionalMd(path.join(tmpDir, 'nonexistent.md'))).toBeNull();
  });
});

// ── Workflow directory sync ─────────────────────────────────────────────────

describe('syncFromCommunity — workflow directories', () => {
  it('adds a new community workflow from directory', async () => {
    writeJson('workflows/sec-triage/metadata.json', {
      name: 'Security Triage',
      steps: [{ id: 's1', type: 'agent', config: {} }],
      autonomyLevel: 'L2',
    });

    const wfManager = mockWorkflowManager();
    const mgr = new MarketplaceManager(mockStorage(), {
      logger: createNoopLogger(),
      communityRepoPath: tmpDir,
      workflowManager: wfManager,
    });

    const result = await mgr.syncFromCommunity();
    expect(result.workflowsAdded).toBe(1);
    expect(wfManager.createDefinition).toHaveBeenCalledTimes(1);
  });

  it('updates existing directory workflow on re-sync', async () => {
    writeJson('workflows/sec-triage/metadata.json', {
      name: 'Security Triage',
      steps: [{ id: 's1', type: 'agent', config: {} }],
    });

    const existingDef = { id: 'wf-existing', name: 'Security Triage', createdBy: 'community' };
    const wfManager = mockWorkflowManager({
      listDefinitions: vi.fn().mockResolvedValue({ definitions: [existingDef], total: 1 }),
    });

    const mgr = new MarketplaceManager(mockStorage(), {
      logger: createNoopLogger(),
      communityRepoPath: tmpDir,
      workflowManager: wfManager,
    });

    const result = await mgr.syncFromCommunity();
    expect(result.workflowsUpdated).toBe(1);
    expect(wfManager.updateDefinition).toHaveBeenCalledWith(
      'wf-existing',
      expect.objectContaining({ steps: expect.any(Array) })
    );
  });

  it('uses README.md as description fallback', async () => {
    writeJson('workflows/wf-readme/metadata.json', {
      name: 'Readme Workflow',
      steps: [{ id: 's1', type: 'agent', config: {} }],
    });
    writeMd('workflows/wf-readme/README.md', 'This is the description from README.');

    const wfManager = mockWorkflowManager();
    const mgr = new MarketplaceManager(mockStorage(), {
      logger: createNoopLogger(),
      communityRepoPath: tmpDir,
      workflowManager: wfManager,
    });

    await mgr.syncFromCommunity();
    expect(wfManager.createDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'This is the description from README.',
      })
    );
  });

  it('injects step prompts from steps/ markdown files', async () => {
    writeJson('workflows/wf-steps/metadata.json', {
      name: 'Step Inject Workflow',
      steps: [
        { id: 'analyze', type: 'agent', config: { prompt: 'default prompt' } },
        { id: 'report', type: 'agent', config: {} },
      ],
    });
    writeMd('workflows/wf-steps/steps/analyze.md', 'Overridden prompt from markdown file.');

    const wfManager = mockWorkflowManager();
    const mgr = new MarketplaceManager(mockStorage(), {
      logger: createNoopLogger(),
      communityRepoPath: tmpDir,
      workflowManager: wfManager,
    });

    await mgr.syncFromCommunity();
    const callArgs = (wfManager.createDefinition as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.steps[0].config.prompt).toBe('Overridden prompt from markdown file.');
    // Step without matching .md keeps original config
    expect(callArgs.steps[1].config).toEqual({});
  });

  it('skips directory with missing metadata name', async () => {
    writeJson('workflows/bad-wf/metadata.json', {
      steps: [{ id: 's1', type: 'agent' }],
    });

    const mgr = new MarketplaceManager(mockStorage(), {
      logger: createNoopLogger(),
      communityRepoPath: tmpDir,
      workflowManager: mockWorkflowManager(),
    });

    const result = await mgr.syncFromCommunity();
    expect(result.skipped).toBeGreaterThanOrEqual(1);
    expect(result.errors.some((e) => e.includes('missing required field "name"'))).toBe(true);
  });

  it('skips directory with missing steps', async () => {
    writeJson('workflows/no-steps/metadata.json', {
      name: 'No Steps',
    });

    const mgr = new MarketplaceManager(mockStorage(), {
      logger: createNoopLogger(),
      communityRepoPath: tmpDir,
      workflowManager: mockWorkflowManager(),
    });

    const result = await mgr.syncFromCommunity();
    expect(result.skipped).toBeGreaterThanOrEqual(1);
    expect(result.errors.some((e) => e.includes('missing required field "steps"'))).toBe(true);
  });

  it('skips directory workflow when JSON with same name already synced', async () => {
    // JSON workflow first
    writeJson('workflows/dup-name.json', {
      name: 'Duplicate Name',
      steps: [{ id: 's1', type: 'agent', config: {} }],
    });
    // Directory workflow with same name
    writeJson('workflows/dup-name-dir/metadata.json', {
      name: 'Duplicate Name',
      steps: [{ id: 's1', type: 'agent', config: {} }],
    });

    const wfManager = mockWorkflowManager();
    const mgr = new MarketplaceManager(mockStorage(), {
      logger: createNoopLogger(),
      communityRepoPath: tmpDir,
      workflowManager: wfManager,
    });

    const result = await mgr.syncFromCommunity();
    // JSON one adds, directory one is skipped (dedup)
    expect(result.workflowsAdded).toBe(1);
    expect(wfManager.createDefinition).toHaveBeenCalledTimes(1);
  });

  it('coexists with JSON-only workflows', async () => {
    writeJson('workflows/json-only.json', {
      name: 'JSON Only',
      steps: [{ id: 's1', type: 'agent', config: {} }],
    });
    writeJson('workflows/dir-only/metadata.json', {
      name: 'Dir Only',
      steps: [{ id: 's1', type: 'agent', config: {} }],
    });

    const wfManager = mockWorkflowManager();
    const mgr = new MarketplaceManager(mockStorage(), {
      logger: createNoopLogger(),
      communityRepoPath: tmpDir,
      workflowManager: wfManager,
    });

    const result = await mgr.syncFromCommunity();
    expect(result.workflowsAdded).toBe(2);
  });
});

// ── Swarm directory sync ──────────────────────────────────────────────────────

describe('syncFromCommunity — swarm directories', () => {
  it('adds a new community swarm from directory', async () => {
    writeJson('swarms/hunt-team/metadata.json', {
      name: 'Hunt Team',
      roles: [
        { role: 'leader', profileName: 'sec-lead', description: 'Leads the hunt' },
      ],
      strategy: 'hierarchical',
    });

    const swarmMgr = mockSwarmManager();
    const mgr = new MarketplaceManager(mockStorage(), {
      logger: createNoopLogger(),
      communityRepoPath: tmpDir,
      swarmManager: swarmMgr,
    });

    const result = await mgr.syncFromCommunity();
    expect(result.swarmsAdded).toBe(1);
    expect(swarmMgr.createTemplate).toHaveBeenCalledTimes(1);
  });

  it('updates existing directory swarm on re-sync', async () => {
    writeJson('swarms/hunt-team/metadata.json', {
      name: 'Hunt Team',
      roles: [{ role: 'leader', profileName: 'sec-lead' }],
    });

    const existingTmpl = { id: 'tmpl-existing', name: 'Hunt Team', isBuiltin: false };
    const swarmMgr = mockSwarmManager({
      listTemplates: vi.fn().mockResolvedValue({ templates: [existingTmpl], total: 1 }),
    });

    const mgr = new MarketplaceManager(mockStorage(), {
      logger: createNoopLogger(),
      communityRepoPath: tmpDir,
      swarmManager: swarmMgr,
    });

    const result = await mgr.syncFromCommunity();
    expect(result.swarmsUpdated).toBe(1);
  });

  it('uses README.md as description fallback for swarms', async () => {
    writeJson('swarms/readme-swarm/metadata.json', {
      name: 'Readme Swarm',
      roles: [{ role: 'worker', profileName: 'worker-p' }],
    });
    writeMd('swarms/readme-swarm/README.md', 'Swarm description from readme.');

    const swarmMgr = mockSwarmManager();
    const mgr = new MarketplaceManager(mockStorage(), {
      logger: createNoopLogger(),
      communityRepoPath: tmpDir,
      swarmManager: swarmMgr,
    });

    await mgr.syncFromCommunity();
    expect(swarmMgr.createTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Swarm description from readme.',
      })
    );
  });

  it('injects role prompts from roles/ markdown files', async () => {
    writeJson('swarms/role-inject/metadata.json', {
      name: 'Role Inject Swarm',
      roles: [
        { role: 'coordinator', profileName: 'coord-p', description: 'Coordinator role' },
        { role: 'analyst', profileName: 'analyst-p', description: 'Analyst role' },
      ],
    });
    writeMd('swarms/role-inject/roles/coordinator.md', 'You are the coordinator. Manage the team.');

    const swarmMgr = mockSwarmManager();
    const mgr = new MarketplaceManager(mockStorage(), {
      logger: createNoopLogger(),
      communityRepoPath: tmpDir,
      swarmManager: swarmMgr,
    });

    await mgr.syncFromCommunity();
    const callArgs = (swarmMgr.createTemplate as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.roles[0].systemPromptOverride).toBe(
      'You are the coordinator. Manage the team.'
    );
    // Role without matching .md has no override
    expect(callArgs.roles[1].systemPromptOverride).toBeUndefined();
  });

  it('skips directory with missing name', async () => {
    writeJson('swarms/bad-swarm/metadata.json', {
      roles: [{ role: 'x', profileName: 'y' }],
    });

    const mgr = new MarketplaceManager(mockStorage(), {
      logger: createNoopLogger(),
      communityRepoPath: tmpDir,
      swarmManager: mockSwarmManager(),
    });

    const result = await mgr.syncFromCommunity();
    expect(result.skipped).toBeGreaterThanOrEqual(1);
  });

  it('skips directory with missing roles', async () => {
    writeJson('swarms/no-roles/metadata.json', {
      name: 'No Roles',
    });

    const mgr = new MarketplaceManager(mockStorage(), {
      logger: createNoopLogger(),
      communityRepoPath: tmpDir,
      swarmManager: mockSwarmManager(),
    });

    const result = await mgr.syncFromCommunity();
    expect(result.skipped).toBeGreaterThanOrEqual(1);
  });

  it('skips directory swarm when JSON with same name already synced', async () => {
    writeJson('swarms/dup.json', {
      name: 'Dup Swarm',
      roles: [{ role: 'a', profileName: 'b' }],
    });
    writeJson('swarms/dup-dir/metadata.json', {
      name: 'Dup Swarm',
      roles: [{ role: 'a', profileName: 'b' }],
    });

    const swarmMgr = mockSwarmManager();
    const mgr = new MarketplaceManager(mockStorage(), {
      logger: createNoopLogger(),
      communityRepoPath: tmpDir,
      swarmManager: swarmMgr,
    });

    const result = await mgr.syncFromCommunity();
    expect(result.swarmsAdded).toBe(1);
    expect(swarmMgr.createTemplate).toHaveBeenCalledTimes(1);
  });

  it('coexists with JSON-only swarms', async () => {
    writeJson('swarms/json-swarm.json', {
      name: 'JSON Swarm',
      roles: [{ role: 'a', profileName: 'b' }],
    });
    writeJson('swarms/dir-swarm/metadata.json', {
      name: 'Dir Swarm',
      roles: [{ role: 'c', profileName: 'd' }],
    });

    const swarmMgr = mockSwarmManager();
    const mgr = new MarketplaceManager(mockStorage(), {
      logger: createNoopLogger(),
      communityRepoPath: tmpDir,
      swarmManager: swarmMgr,
    });

    const result = await mgr.syncFromCommunity();
    expect(result.swarmsAdded).toBe(2);
  });
});

// ── Mixed mode ────────────────────────────────────────────────────────────────

describe('syncFromCommunity — mixed mode', () => {
  it('syncs both JSON and directory workflows in one sync', async () => {
    writeJson('workflows/json-wf.json', {
      name: 'JSON WF',
      steps: [{ id: 's1', type: 'agent', config: {} }],
    });
    writeJson('workflows/dir-wf/metadata.json', {
      name: 'Dir WF',
      steps: [{ id: 's1', type: 'agent', config: {} }],
    });

    const wfManager = mockWorkflowManager();
    const mgr = new MarketplaceManager(mockStorage(), {
      logger: createNoopLogger(),
      communityRepoPath: tmpDir,
      workflowManager: wfManager,
    });

    const result = await mgr.syncFromCommunity();
    expect(result.workflowsAdded).toBe(2);
  });

  it('syncs both JSON and directory swarms in one sync', async () => {
    writeJson('swarms/json-sw.json', {
      name: 'JSON SW',
      roles: [{ role: 'a', profileName: 'b' }],
    });
    writeJson('swarms/dir-sw/metadata.json', {
      name: 'Dir SW',
      roles: [{ role: 'c', profileName: 'd' }],
    });

    const swarmMgr = mockSwarmManager();
    const mgr = new MarketplaceManager(mockStorage(), {
      logger: createNoopLogger(),
      communityRepoPath: tmpDir,
      swarmManager: swarmMgr,
    });

    const result = await mgr.syncFromCommunity();
    expect(result.swarmsAdded).toBe(2);
  });

  it('handles directory-only sync (no JSON files)', async () => {
    writeJson('workflows/dir-only/metadata.json', {
      name: 'Directory Only',
      steps: [{ id: 's1', type: 'agent', config: {} }],
    });

    const wfManager = mockWorkflowManager();
    const mgr = new MarketplaceManager(mockStorage(), {
      logger: createNoopLogger(),
      communityRepoPath: tmpDir,
      workflowManager: wfManager,
    });

    const result = await mgr.syncFromCommunity();
    expect(result.workflowsAdded).toBe(1);
  });

  it('JSON-only sync still works as before', async () => {
    writeJson('workflows/classic.json', {
      name: 'Classic JSON',
      steps: [{ id: 's1', type: 'agent', config: {} }],
    });

    const wfManager = mockWorkflowManager();
    const mgr = new MarketplaceManager(mockStorage(), {
      logger: createNoopLogger(),
      communityRepoPath: tmpDir,
      workflowManager: wfManager,
    });

    const result = await mgr.syncFromCommunity();
    expect(result.workflowsAdded).toBe(1);
  });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe('syncFromCommunity — directory error handling', () => {
  it('records error for malformed metadata JSON', async () => {
    const dirPath = path.join(tmpDir, 'workflows', 'bad-json');
    fs.mkdirSync(dirPath, { recursive: true });
    fs.writeFileSync(path.join(dirPath, 'metadata.json'), '{ invalid json }}}');

    const mgr = new MarketplaceManager(mockStorage(), {
      logger: createNoopLogger(),
      communityRepoPath: tmpDir,
      workflowManager: mockWorkflowManager(),
    });

    const result = await mgr.syncFromCommunity();
    expect(result.errors.some((e) => e.includes('bad-json'))).toBe(true);
  });

  it('step md for nonexistent step ID is safely ignored', async () => {
    writeJson('workflows/extra-md/metadata.json', {
      name: 'Extra MD',
      steps: [{ id: 'real-step', type: 'agent', config: {} }],
    });
    // Write a .md for a step that doesn't exist in metadata
    writeMd('workflows/extra-md/steps/nonexistent.md', 'This step does not exist');

    const wfManager = mockWorkflowManager();
    const mgr = new MarketplaceManager(mockStorage(), {
      logger: createNoopLogger(),
      communityRepoPath: tmpDir,
      workflowManager: wfManager,
    });

    const result = await mgr.syncFromCommunity();
    expect(result.workflowsAdded).toBe(1);
    // real-step should not get the nonexistent.md content
    const callArgs = (wfManager.createDefinition as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.steps[0].config.prompt).toBeUndefined();
  });

  it('handles missing required fields gracefully', async () => {
    writeJson('swarms/bad/metadata.json', {
      name: 'Bad Swarm',
      // missing roles
    });

    const mgr = new MarketplaceManager(mockStorage(), {
      logger: createNoopLogger(),
      communityRepoPath: tmpDir,
      swarmManager: mockSwarmManager(),
    });

    const result = await mgr.syncFromCommunity();
    expect(result.skipped).toBeGreaterThanOrEqual(1);
  });

  it('handles description override: inline description takes priority over README', async () => {
    writeJson('workflows/desc-priority/metadata.json', {
      name: 'Desc Priority',
      description: 'Inline description',
      steps: [{ id: 's1', type: 'agent', config: {} }],
    });
    writeMd('workflows/desc-priority/README.md', 'README description');

    const wfManager = mockWorkflowManager();
    const mgr = new MarketplaceManager(mockStorage(), {
      logger: createNoopLogger(),
      communityRepoPath: tmpDir,
      workflowManager: wfManager,
    });

    await mgr.syncFromCommunity();
    expect(wfManager.createDefinition).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Inline description' })
    );
  });
});
