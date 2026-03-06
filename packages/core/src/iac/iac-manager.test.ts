/**
 * IaC Manager Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IacManager } from './iac-manager.js';
import type { IacConfig } from '@secureyeoman/shared';

vi.mock('./iac-git-repo.js', () => ({
  IacGitRepo: function () {
    return {
      getGitInfo: vi
        .fn()
        .mockResolvedValue({ commitSha: 'abc123', branch: 'main', shortSha: 'abc123' }),
      pull: vi.fn().mockResolvedValue({ updated: true, commitSha: 'def456' }),
      discoverTemplates: vi.fn().mockResolvedValue([
        {
          name: 'vpc-network',
          dir: '/tmp/templates/vpc-network',
          tool: 'terraform',
          cloudProvider: 'aws',
          category: 'networking',
          version: '1.0.0',
          description: 'VPC with subnets',
          variables: [],
          tags: ['aws', 'vpc'],
          sraControlIds: [],
          files: [
            {
              path: 'main.tf',
              content: 'resource "aws_vpc" "main" {\n  cidr_block = "10.0.0.0/16"\n}\n',
            },
          ],
        },
      ]),
    };
  },
}));

vi.mock('./iac-sra-populator.js', () => ({
  IacSraPopulator: {
    getBuiltinTemplates: vi.fn().mockReturnValue([]),
  },
}));

const defaultConfig: IacConfig = {
  enabled: true,
  repo: {
    repoPath: '/tmp/iac-repo',
    remoteUrl: '',
    branch: 'main',
    templateDir: 'templates',
    syncIntervalSec: 0,
  },
  maxTemplateFiles: 200,
  maxFileSizeBytes: 512_000,
  retainDeployments: 100,
  enableBuiltinTemplates: false,
};

describe('IacManager', () => {
  let manager: IacManager;
  let mockStore: any;

  beforeEach(() => {
    mockStore = {
      saveTemplate: vi.fn().mockResolvedValue(undefined),
      getTemplate: vi.fn().mockResolvedValue(null),
      listTemplates: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      deleteTemplate: vi.fn().mockResolvedValue(true),
      saveDeployment: vi.fn().mockResolvedValue(undefined),
      getDeployment: vi.fn().mockResolvedValue(null),
      listDeployments: vi.fn().mockResolvedValue([]),
      deleteOldDeployments: vi.fn().mockResolvedValue(0),
    };

    manager = new IacManager({
      store: mockStore,
      config: defaultConfig,
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any,
    });
  });

  afterEach(() => {
    manager.stop();
  });

  it('syncs templates from git', async () => {
    const result = await manager.syncFromGit();

    expect(result.templates).toHaveLength(1);
    expect(result.templates[0]!.name).toBe('vpc-network');
    expect(result.templates[0]!.tool).toBe('terraform');
    expect(mockStore.saveTemplate).toHaveBeenCalledOnce();
  });

  it('validates a template by ID', async () => {
    mockStore.getTemplate.mockResolvedValue({
      id: 't-1',
      tool: 'terraform',
      files: [{ path: 'main.tf', content: 'resource "x" "y" {}\n', sha256: 'a'.repeat(64) }],
    });

    const result = await manager.validateTemplate('t-1');
    expect(result.valid).toBe(true);
    expect(result.tool).toBe('terraform');
  });

  it('validates a template by files', async () => {
    const result = await manager.validateTemplate({
      tool: 'terraform',
      files: [{ path: 'main.tf', content: 'resource "x" "y" {}\n' }],
    });
    expect(result.valid).toBe(true);
  });

  it('delegates list/get/delete to store', async () => {
    await manager.listTemplates({ tool: 'terraform' });
    expect(mockStore.listTemplates).toHaveBeenCalledWith({ tool: 'terraform' });

    await manager.getTemplate('t-1');
    expect(mockStore.getTemplate).toHaveBeenCalledWith('t-1');

    await manager.deleteTemplate('t-1');
    expect(mockStore.deleteTemplate).toHaveBeenCalledWith('t-1');
  });

  it('records a deployment', async () => {
    const deployment = {
      id: 'd-1',
      templateId: 't-1',
      templateName: 'vpc',
      templateVersion: '1.0.0',
      status: 'applied' as const,
      variables: {},
      planOutput: '',
      applyOutput: '',
      errors: [],
      resourcesCreated: 3,
      resourcesModified: 0,
      resourcesDestroyed: 0,
      deployedBy: 'admin',
      deployedAt: Date.now(),
      tenantId: 'default',
    };

    await manager.recordDeployment(deployment);
    expect(mockStore.saveDeployment).toHaveBeenCalledWith(deployment);
    expect(mockStore.deleteOldDeployments).toHaveBeenCalledWith('vpc', 100);
  });

  it('gets repo info', async () => {
    const info = await manager.getRepoInfo();
    expect(info.commitSha).toBe('abc123');
  });

  it('starts and stops auto-sync timer', () => {
    const config = { ...defaultConfig, repo: { ...defaultConfig.repo, syncIntervalSec: 60 } };
    const m = new IacManager({
      store: mockStore,
      config,
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any,
    });
    m.start();
    m.stop();
  });
});
