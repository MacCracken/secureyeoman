/**
 * Bundle Manager Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BundleManager } from './bundle-manager.js';
import type { PolicyAsCodeConfig } from '@secureyeoman/shared';

vi.mock('./git-policy-repo.js', () => ({
  GitPolicyRepo: function () {
    return {
      getGitInfo: vi
        .fn()
        .mockResolvedValue({ commitSha: 'abc123', branch: 'main', shortSha: 'abc123' }),
      pull: vi.fn().mockResolvedValue({ updated: true, commitSha: 'def456' }),
      discoverBundles: vi.fn().mockResolvedValue([
        {
          name: 'security-baseline',
          dir: '/tmp/bundles/security-baseline',
          metadata: {
            name: 'security-baseline',
            version: '1.0.0',
            description: 'Base policies',
            author: 'team',
            tags: ['security'],
            enforcement: 'warn',
          },
          files: [
            {
              path: 'access.rego',
              language: 'rego',
              source: 'package access\ndefault allow = false',
            },
          ],
        },
      ]),
    };
  },
}));

vi.mock('./bundle-compiler.js', () => ({
  BundleCompiler: function () {
    return {
      compile: vi
        .fn()
        .mockImplementation(async (id: string, metadata: any, files: any[], commitSha: string) => ({
          bundle: {
            id,
            metadata,
            files: files.map((f: any) => ({ ...f, sha256: 'a'.repeat(64) })),
            commitSha,
            ref: 'main',
            compiledAt: Date.now(),
            valid: true,
            validationErrors: [],
          },
          valid: true,
          errors: [],
        })),
    };
  },
}));

vi.mock('./policy-sync.js', () => ({
  PolicySync: function () {
    return {
      deploy: vi.fn().mockImplementation(async (bundle: any) => ({
        id: `deploy-${bundle.id}`,
        bundleId: bundle.id,
        bundleName: bundle.metadata.name,
        bundleVersion: bundle.metadata.version,
        status: 'deployed',
        deployedBy: 'system',
        commitSha: bundle.commitSha,
        policyCount: bundle.files.length,
        errorCount: 0,
        errors: [],
        deployedAt: Date.now(),
        tenantId: 'default',
      })),
      evaluate: vi.fn().mockResolvedValue({
        policyId: 'test',
        allowed: true,
        enforcement: 'warn',
        reason: 'allowed',
        durationMs: 1,
        engine: 'opa',
        evaluatedAt: Date.now(),
      }),
      rollback: vi.fn().mockResolvedValue({
        id: 'deploy-rollback',
        status: 'deployed',
      }),
    };
  },
}));

const defaultConfig: PolicyAsCodeConfig = {
  enabled: true,
  repo: {
    repoPath: '/tmp/test-repo',
    remoteUrl: '',
    branch: 'main',
    bundleDir: 'bundles',
    syncIntervalSec: 0,
    requirePrApproval: true,
  },
  maxBundleFiles: 100,
  maxFileSizeBytes: 256_000,
  retainDeployments: 50,
};

describe('BundleManager', () => {
  let manager: BundleManager;
  let mockStore: any;

  beforeEach(() => {
    mockStore = {
      saveBundle: vi.fn().mockResolvedValue(undefined),
      getBundle: vi.fn().mockResolvedValue(null),
      listBundles: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      deleteBundle: vi.fn().mockResolvedValue(true),
      listDeployments: vi.fn().mockResolvedValue([]),
      deleteOldDeployments: vi.fn().mockResolvedValue(0),
    };

    manager = new BundleManager({
      opaClient: null,
      store: mockStore,
      config: defaultConfig,
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any,
    });
  });

  afterEach(() => {
    manager.stop();
  });

  it('syncs bundles from git', async () => {
    const result = await manager.syncFromGit();

    expect(result.bundles).toHaveLength(1);
    expect(result.deployments).toHaveLength(1);
    expect(result.bundles[0]!.metadata.name).toBe('security-baseline');
    expect(mockStore.saveBundle).toHaveBeenCalledOnce();
  });

  it('compiles and deploys a specific bundle', async () => {
    const result = await manager.compileAndDeploy(
      'security-baseline',
      'admin',
      42,
      'https://pr/42'
    );

    expect(result.bundle.valid).toBe(true);
    expect(result.deployment).not.toBeNull();
    expect(result.deployment!.status).toBe('deployed');
  });

  it('evaluates a policy', async () => {
    const result = await manager.evaluate({
      policyId: 'access/allow',
      input: { role: 'admin' },
    });

    expect(result.allowed).toBe(true);
  });

  it('delegates list/get/delete to store', async () => {
    await manager.listBundles({ limit: 10 });
    expect(mockStore.listBundles).toHaveBeenCalledWith({ limit: 10 });

    await manager.getBundle('bundle-1');
    expect(mockStore.getBundle).toHaveBeenCalledWith('bundle-1');

    await manager.deleteBundle('bundle-1');
    expect(mockStore.deleteBundle).toHaveBeenCalledWith('bundle-1');
  });

  it('gets repo info', async () => {
    const info = await manager.getRepoInfo();
    expect(info.commitSha).toBe('abc123');
  });

  it('starts and stops auto-sync timer', () => {
    const config = { ...defaultConfig, repo: { ...defaultConfig.repo, syncIntervalSec: 60 } };
    const m = new BundleManager({
      opaClient: null,
      store: mockStore,
      config,
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any,
    });

    m.start();
    // Timer is running — stop should clear it
    m.stop();
    // No error means it worked
  });
});
