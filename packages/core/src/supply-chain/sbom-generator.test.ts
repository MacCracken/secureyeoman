import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateSbom } from './sbom-generator.js';

// Mock fs to avoid reading real files
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

const { existsSync, readFileSync } = await import('node:fs');
const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);

const MOCK_LOCK_V3 = JSON.stringify({
  lockfileVersion: 3,
  packages: {
    '': { name: 'test-project', version: '1.0.0' },
    'node_modules/fastify': {
      version: '4.28.0',
      integrity: 'sha512-abc123==',
      resolved: 'https://registry.npmjs.org/fastify/-/fastify-4.28.0.tgz',
      license: 'MIT',
    },
    'node_modules/@types/node': {
      version: '22.0.0',
      integrity: 'sha512-def456==',
      resolved: 'https://registry.npmjs.org/@types/node/-/node-22.0.0.tgz',
      dev: true,
      license: 'MIT',
    },
    'node_modules/pino': {
      version: '9.1.0',
      integrity: 'sha512-ghi789==',
      resolved: 'https://registry.npmjs.org/pino/-/pino-9.1.0.tgz',
      license: 'MIT',
      optional: true,
    },
  },
});

const MOCK_PKG = JSON.stringify({ name: 'test-project', version: '1.0.0' });

describe('SBOM Generator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates CycloneDX 1.5 SBOM from lockfile v3', () => {
    mockExistsSync.mockImplementation((p) => {
      const s = String(p);
      return s.includes('package-lock.json') || s.includes('package.json');
    });
    mockReadFileSync.mockImplementation((p) => {
      const s = String(p);
      if (s.includes('package-lock.json')) return MOCK_LOCK_V3;
      if (s.includes('package.json')) return MOCK_PKG;
      throw new Error(`Unexpected read: ${s}`);
    });

    const sbom = generateSbom({ rootDir: '/test' });

    expect(sbom.bomFormat).toBe('CycloneDX');
    expect(sbom.specVersion).toBe('1.5');
    expect(sbom.serialNumber).toMatch(/^urn:uuid:/);
    expect(sbom.metadata.tools[0]!.name).toBe('secureyeoman-sbom');
    expect(sbom.metadata.component.name).toBe('test-project');

    // Without --include-dev, should exclude @types/node
    expect(sbom.components).toHaveLength(2);
    const names = sbom.components.map((c) => c.name);
    expect(names).toContain('fastify');
    expect(names).toContain('pino');
    expect(names).not.toContain('@types/node');
  });

  it('includes dev dependencies when includeDev is true', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation((p) => {
      const s = String(p);
      if (s.includes('package-lock.json')) return MOCK_LOCK_V3;
      return MOCK_PKG;
    });

    const sbom = generateSbom({ rootDir: '/test', includeDev: true });
    expect(sbom.components).toHaveLength(3);
    const names = sbom.components.map((c) => c.name);
    expect(names).toContain('@types/node');
  });

  it('generates correct purl for scoped packages', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation((p) => {
      const s = String(p);
      if (s.includes('package-lock.json')) return MOCK_LOCK_V3;
      return MOCK_PKG;
    });

    const sbom = generateSbom({ rootDir: '/test', includeDev: true });
    const typesNode = sbom.components.find((c) => c.name === '@types/node');
    // Per purl spec, @ in namespace is not encoded, / is encoded as %2F
    expect(typesNode?.purl).toBe('pkg:npm/@types%2Fnode@22.0.0');
  });

  it('sets optional scope on optional dependencies', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation((p) => {
      const s = String(p);
      if (s.includes('package-lock.json')) return MOCK_LOCK_V3;
      return MOCK_PKG;
    });

    const sbom = generateSbom({ rootDir: '/test' });
    const pino = sbom.components.find((c) => c.name === 'pino');
    expect(pino?.scope).toBe('optional');
  });

  it('parses integrity hashes', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation((p) => {
      const s = String(p);
      if (s.includes('package-lock.json')) return MOCK_LOCK_V3;
      return MOCK_PKG;
    });

    const sbom = generateSbom({ rootDir: '/test' });
    const fastify = sbom.components.find((c) => c.name === 'fastify');
    expect(fastify?.hashes).toBeDefined();
    expect(fastify?.hashes?.[0]?.alg).toMatch(/SHA/);
  });

  it('includes license info', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation((p) => {
      const s = String(p);
      if (s.includes('package-lock.json')) return MOCK_LOCK_V3;
      return MOCK_PKG;
    });

    const sbom = generateSbom({ rootDir: '/test' });
    const fastify = sbom.components.find((c) => c.name === 'fastify');
    expect(fastify?.licenses?.[0]?.license.id).toBe('MIT');
  });

  it('includes external references', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation((p) => {
      const s = String(p);
      if (s.includes('package-lock.json')) return MOCK_LOCK_V3;
      return MOCK_PKG;
    });

    const sbom = generateSbom({ rootDir: '/test' });
    const fastify = sbom.components.find((c) => c.name === 'fastify');
    expect(fastify?.externalReferences?.[0]?.type).toBe('distribution');
    expect(fastify?.externalReferences?.[0]?.url).toContain('registry.npmjs.org');
  });

  it('throws when no lock file found', () => {
    mockExistsSync.mockReturnValue(false);
    expect(() => generateSbom({ rootDir: '/empty' })).toThrow('No package-lock.json found');
  });

  it('components are sorted by name', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation((p) => {
      const s = String(p);
      if (s.includes('package-lock.json')) return MOCK_LOCK_V3;
      return MOCK_PKG;
    });

    const sbom = generateSbom({ rootDir: '/test' });
    const names = sbom.components.map((c) => c.name);
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });

  it('handles lockfileVersion 1 format', () => {
    const lockV1 = JSON.stringify({
      lockfileVersion: 1,
      dependencies: {
        express: { version: '4.19.2', integrity: 'sha512-xxx==', resolved: 'https://registry.npmjs.org/express/-/express-4.19.2.tgz' },
      },
    });
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation((p) => {
      const s = String(p);
      if (s.includes('package-lock.json')) return lockV1;
      return MOCK_PKG;
    });

    const sbom = generateSbom({ rootDir: '/test' });
    expect(sbom.components).toHaveLength(1);
    expect(sbom.components[0]!.name).toBe('express');
  });
});
