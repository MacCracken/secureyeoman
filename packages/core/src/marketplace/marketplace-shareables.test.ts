/**
 * Marketplace Manager — workflow/swarm community sync tests (Phase 89)
 *
 * Tests the syncFromCommunity() extension for workflows/ and swarms/ directories.
 * Uses mocked WorkflowManager and SwarmManager — no database required.
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
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sy-shareables-test-'));
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

// ── Workflows sync ─────────────────────────────────────────────────────────────

describe('syncFromCommunity — workflows/', () => {
  it('adds a new community workflow when workflows/ dir exists', async () => {
    writeJson('workflows/daily-brief.json', {
      name: 'Daily Morning Brief',
      description: 'Morning brief',
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
    expect(result.workflowsUpdated).toBe(0);
    expect(wfManager.createDefinition).toHaveBeenCalledTimes(1);
  });

  it('updates existing community workflow on re-sync', async () => {
    writeJson('workflows/daily-brief.json', {
      name: 'Daily Morning Brief',
      steps: [{ id: 's1', type: 'agent', config: {} }],
    });

    const existingDef = { id: 'wf-existing', name: 'Daily Morning Brief', createdBy: 'community' };
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
    expect(result.workflowsAdded).toBe(0);
    expect(wfManager.updateDefinition).toHaveBeenCalledWith(
      'wf-existing',
      expect.objectContaining({ steps: expect.any(Array) })
    );
  });

  it('records error when workflow JSON is missing name', async () => {
    writeJson('workflows/bad.json', { steps: [{ id: 's1', type: 'agent' }] });

    const mgr = new MarketplaceManager(mockStorage(), {
      logger: createNoopLogger(),
      communityRepoPath: tmpDir,
      workflowManager: mockWorkflowManager(),
    });

    const result = await mgr.syncFromCommunity();
    expect(result.errors.some((e) => e.includes('name'))).toBe(true);
    expect(result.workflowsAdded).toBe(0);
  });

  it('skips workflows sync when no workflowManager provided', async () => {
    writeJson('workflows/daily-brief.json', {
      name: 'Daily Morning Brief',
      steps: [{ id: 's1', type: 'agent', config: {} }],
    });

    const mgr = new MarketplaceManager(mockStorage(), {
      logger: createNoopLogger(),
      communityRepoPath: tmpDir,
    });

    const result = await mgr.syncFromCommunity();
    expect(result.workflowsAdded).toBe(0);
  });

  it('new result fields initialize to 0', async () => {
    const mgr = new MarketplaceManager(mockStorage(), {
      logger: createNoopLogger(),
      communityRepoPath: tmpDir,
    });
    const result = await mgr.syncFromCommunity();
    expect(result.workflowsAdded).toBe(0);
    expect(result.workflowsUpdated).toBe(0);
    expect(result.swarmsAdded).toBe(0);
    expect(result.swarmsUpdated).toBe(0);
  });
});

// ── Swarms sync ──────────────────────────────────────────────────────────────

describe('syncFromCommunity — swarms/', () => {
  it('adds a new community swarm template when swarms/ dir exists', async () => {
    writeJson('swarms/security-team.json', {
      name: 'Security Audit Team',
      description: 'A security swarm',
      strategy: 'sequential',
      roles: [
        { role: 'researcher', profileName: 'security-researcher', description: 'Researches' },
        { role: 'hacker', profileName: 'ethical-whitehat-hacker', description: 'Probes' },
      ],
    });

    const swManager = mockSwarmManager();
    const mgr = new MarketplaceManager(mockStorage(), {
      logger: createNoopLogger(),
      communityRepoPath: tmpDir,
      swarmManager: swManager,
    });

    const result = await mgr.syncFromCommunity();
    expect(result.swarmsAdded).toBe(1);
    expect(result.swarmsUpdated).toBe(0);
    expect(swManager.createTemplate).toHaveBeenCalledTimes(1);
  });

  it('updates an existing non-builtin community swarm template on re-sync', async () => {
    writeJson('swarms/security-team.json', {
      name: 'Security Audit Team',
      strategy: 'sequential',
      roles: [{ role: 'researcher', profileName: 'security-researcher' }],
    });

    const existingTmpl = { id: 'tmpl-existing', name: 'Security Audit Team', isBuiltin: false };
    const swManager = mockSwarmManager({
      listTemplates: vi.fn().mockResolvedValue({ templates: [existingTmpl], total: 1 }),
    });

    const mgr = new MarketplaceManager(mockStorage(), {
      logger: createNoopLogger(),
      communityRepoPath: tmpDir,
      swarmManager: swManager,
    });

    const result = await mgr.syncFromCommunity();
    expect(result.swarmsUpdated).toBe(1);
    expect(result.swarmsAdded).toBe(0);
  });

  it('records error when swarm JSON is missing name', async () => {
    writeJson('swarms/bad.json', {
      roles: [{ role: 'r', profileName: 'p' }],
    });

    const mgr = new MarketplaceManager(mockStorage(), {
      logger: createNoopLogger(),
      communityRepoPath: tmpDir,
      swarmManager: mockSwarmManager(),
    });

    const result = await mgr.syncFromCommunity();
    expect(result.errors.some((e) => e.includes('name'))).toBe(true);
    expect(result.swarmsAdded).toBe(0);
  });

  it('skips swarms sync when no swarmManager provided', async () => {
    writeJson('swarms/security-team.json', {
      name: 'Security Audit Team',
      strategy: 'sequential',
      roles: [{ role: 'r', profileName: 'p' }],
    });

    const mgr = new MarketplaceManager(mockStorage(), {
      logger: createNoopLogger(),
      communityRepoPath: tmpDir,
    });

    const result = await mgr.syncFromCommunity();
    expect(result.swarmsAdded).toBe(0);
  });
});
