/**
 * Bundle Compiler Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BundleCompiler } from './bundle-compiler.js';
import type { PolicyAsCodeConfig } from '@secureyeoman/shared';

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

describe('BundleCompiler', () => {
  let compiler: BundleCompiler;
  let mockOpa: { uploadPolicy: ReturnType<typeof vi.fn>; deletePolicy: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockOpa = {
      uploadPolicy: vi.fn().mockResolvedValue(undefined),
      deletePolicy: vi.fn().mockResolvedValue(undefined),
    };
    compiler = new BundleCompiler(mockOpa as any, defaultConfig);
  });

  it('compiles a valid Rego bundle', async () => {
    const result = await compiler.compile(
      'test-1',
      {
        name: 'test',
        version: '1.0.0',
        description: '',
        author: '',
        tags: [],
        enforcement: 'warn',
      },
      [{ path: 'access.rego', language: 'rego', source: 'package access\ndefault allow = false' }]
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.bundle.files).toHaveLength(1);
    expect(result.bundle.files[0]!.sha256).toHaveLength(64);
    expect(mockOpa.uploadPolicy).toHaveBeenCalledOnce();
    expect(mockOpa.deletePolicy).toHaveBeenCalledOnce();
  });

  it('compiles a valid CEL bundle', async () => {
    const result = await compiler.compile(
      'test-2',
      {
        name: 'cel-test',
        version: '1.0.0',
        description: '',
        author: '',
        tags: [],
        enforcement: 'warn',
      },
      [{ path: 'check.cel', language: 'cel', source: 'role == "admin"\nstatus == "active"' }]
    );

    expect(result.valid).toBe(true);
    expect(result.bundle.files).toHaveLength(1);
  });

  it('skips blank lines and comments in CEL files', async () => {
    const result = await compiler.compile(
      'test-3',
      {
        name: 'cel-comments',
        version: '1.0.0',
        description: '',
        author: '',
        tags: [],
        enforcement: 'warn',
      },
      [{ path: 'rules.cel', language: 'cel', source: '# This is a comment\n\nrole == "admin"' }]
    );

    expect(result.valid).toBe(true);
  });

  it('fails on missing package declaration in Rego', async () => {
    const result = await compiler.compile(
      'test-4',
      {
        name: 'bad-rego',
        version: '1.0.0',
        description: '',
        author: '',
        tags: [],
        enforcement: 'warn',
      },
      [{ path: 'bad.rego', language: 'rego', source: 'default allow = false' }]
    );

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('missing'))).toBe(true);
  });

  it('fails when OPA compile rejects policy', async () => {
    mockOpa.uploadPolicy.mockRejectedValue(new Error('OPA uploadPolicy failed (400): parse error'));

    const result = await compiler.compile(
      'test-5',
      {
        name: 'opa-fail',
        version: '1.0.0',
        description: '',
        author: '',
        tags: [],
        enforcement: 'warn',
      },
      [{ path: 'err.rego', language: 'rego', source: 'package err\nINVALID SYNTAX' }]
    );

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('OPA compile error'))).toBe(true);
  });

  it('fails on file exceeding max size', async () => {
    const result = await compiler.compile(
      'test-6',
      {
        name: 'big-file',
        version: '1.0.0',
        description: '',
        author: '',
        tags: [],
        enforcement: 'warn',
      },
      [{ path: 'huge.rego', language: 'rego', source: 'x'.repeat(300_000) }]
    );

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('exceeds max size'))).toBe(true);
  });

  it('fails on too many files', async () => {
    const config = { ...defaultConfig, maxBundleFiles: 2 };
    const c = new BundleCompiler(null, config);

    const files = Array.from({ length: 3 }, (_, i) => ({
      path: `p${i}.cel`,
      language: 'cel' as const,
      source: 'x == "y"',
    }));

    const result = await c.compile(
      'test-7',
      {
        name: 'too-many',
        version: '1.0.0',
        description: '',
        author: '',
        tags: [],
        enforcement: 'warn',
      },
      files
    );

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('exceeds max files'))).toBe(true);
  });

  it('works without OPA client (local-only)', async () => {
    const c = new BundleCompiler(null, defaultConfig);
    const result = await c.compile(
      'test-8',
      {
        name: 'no-opa',
        version: '1.0.0',
        description: '',
        author: '',
        tags: [],
        enforcement: 'warn',
      },
      [{ path: 'local.rego', language: 'rego', source: 'package local\ndefault allow = true' }]
    );

    expect(result.valid).toBe(true);
  });

  it('produces deterministic SHA-256 hashes', () => {
    const hash1 = BundleCompiler.hash('hello world');
    const hash2 = BundleCompiler.hash('hello world');
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('includes commitSha and ref in compiled bundle', async () => {
    const c = new BundleCompiler(null, defaultConfig);
    const result = await c.compile(
      'test-9',
      {
        name: 'meta',
        version: '2.0.0',
        description: '',
        author: '',
        tags: [],
        enforcement: 'warn',
      },
      [{ path: 'p.cel', language: 'cel', source: 'x == "y"' }],
      'abc123def456',
      'feature/policy'
    );

    expect(result.bundle.commitSha).toBe('abc123def456');
    expect(result.bundle.ref).toBe('feature/policy');
    expect(result.bundle.compiledAt).toBeGreaterThan(0);
  });
});
