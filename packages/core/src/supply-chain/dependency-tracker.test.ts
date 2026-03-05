import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseLockFile, diffLockFiles, analyzeRisks } from './dependency-tracker.js';
import type { DependencyDiff, LockEntry } from './dependency-tracker.js';

describe('Dependency Tracker', () => {
  describe('parseLockFile', () => {
    it('parses lockfileVersion 3 packages', () => {
      const content = JSON.stringify({
        lockfileVersion: 3,
        packages: {
          '': { name: 'root', version: '1.0.0' },
          'node_modules/fastify': { version: '4.28.0', integrity: 'sha512-abc==', resolved: 'https://registry.npmjs.org/fastify/-/fastify-4.28.0.tgz' },
          'node_modules/@types/node': { version: '22.0.0', dev: true },
        },
      });

      const entries = parseLockFile(content);
      expect(entries.size).toBe(2);
      expect(entries.get('fastify')?.version).toBe('4.28.0');
      expect(entries.get('@types/node')?.dev).toBe(true);
    });

    it('parses lockfileVersion 1 dependencies', () => {
      const content = JSON.stringify({
        lockfileVersion: 1,
        dependencies: {
          express: { version: '4.19.2' },
          lodash: { version: '4.17.21' },
        },
      });

      const entries = parseLockFile(content);
      expect(entries.size).toBe(2);
    });

    it('skips root entry', () => {
      const content = JSON.stringify({
        packages: { '': { name: 'root', version: '1.0.0' } },
      });
      const entries = parseLockFile(content);
      expect(entries.size).toBe(0);
    });
  });

  describe('diffLockFiles', () => {
    function makeMap(entries: Array<[string, Partial<LockEntry>]>): Map<string, LockEntry> {
      const map = new Map<string, LockEntry>();
      for (const [name, partial] of entries) {
        map.set(name, { name, version: '1.0.0', ...partial });
      }
      return map;
    }

    it('detects added dependencies', () => {
      const old = makeMap([['fastify', { version: '4.28.0' }]]);
      const newer = makeMap([
        ['fastify', { version: '4.28.0' }],
        ['pino', { version: '9.1.0' }],
      ]);

      const diff = diffLockFiles(old, newer);
      expect(diff.added).toHaveLength(1);
      expect(diff.added[0]!.name).toBe('pino');
    });

    it('detects removed dependencies', () => {
      const old = makeMap([['fastify', {}], ['lodash', {}]]);
      const newer = makeMap([['fastify', {}]]);

      const diff = diffLockFiles(old, newer);
      expect(diff.removed).toHaveLength(1);
      expect(diff.removed[0]!.name).toBe('lodash');
    });

    it('detects version changes', () => {
      const old = makeMap([['fastify', { version: '4.27.0' }]]);
      const newer = makeMap([['fastify', { version: '4.28.0' }]]);

      const diff = diffLockFiles(old, newer);
      expect(diff.versionChanged).toHaveLength(1);
      expect(diff.versionChanged[0]!.from).toBe('4.27.0');
      expect(diff.versionChanged[0]!.to).toBe('4.28.0');
    });

    it('detects integrity changes', () => {
      const old = makeMap([['pkg', { version: '1.0.0', integrity: 'sha512-old==' }]]);
      const newer = makeMap([['pkg', { version: '1.0.0', integrity: 'sha512-new==' }]]);

      const diff = diffLockFiles(old, newer);
      expect(diff.integrityChanged).toHaveLength(1);
    });

    it('detects registry changes', () => {
      const old = makeMap([['pkg', { version: '1.0.0', resolved: 'https://registry.npmjs.org/pkg/-/pkg-1.0.0.tgz' }]]);
      const newer = makeMap([['pkg', { version: '1.0.0', resolved: 'https://evil-registry.com/pkg/-/pkg-1.0.0.tgz' }]]);

      const diff = diffLockFiles(old, newer);
      expect(diff.registryChanged).toHaveLength(1);
    });

    it('reports no changes for identical entries', () => {
      const entries = makeMap([['fastify', { version: '4.28.0', integrity: 'sha512-abc==' }]]);
      const diff = diffLockFiles(entries, new Map(entries));
      expect(diff.added).toHaveLength(0);
      expect(diff.removed).toHaveLength(0);
      expect(diff.versionChanged).toHaveLength(0);
      expect(diff.integrityChanged).toHaveLength(0);
      expect(diff.registryChanged).toHaveLength(0);
    });
  });

  describe('analyzeRisks', () => {
    it('flags registry changes as critical', () => {
      const diff: DependencyDiff = {
        added: [],
        removed: [],
        versionChanged: [],
        integrityChanged: [],
        registryChanged: [{ name: 'pkg', version: '1.0.0', from: 'https://registry.npmjs.org/...', to: 'https://evil.com/...' }],
      };

      const alerts = analyzeRisks(diff);
      const critical = alerts.filter((a) => a.level === 'critical');
      expect(critical).toHaveLength(1);
      expect(critical[0]!.category).toBe('registry-change');
    });

    it('flags integrity change without version bump as critical', () => {
      const diff: DependencyDiff = {
        added: [],
        removed: [],
        versionChanged: [],
        integrityChanged: [{ name: 'pkg', version: '1.0.0', from: 'sha512-old==', to: 'sha512-new==' }],
        registryChanged: [],
      };

      const alerts = analyzeRisks(diff);
      expect(alerts.some((a) => a.level === 'critical' && a.category === 'integrity-mismatch')).toBe(true);
    });

    it('does not flag integrity change when version also changed', () => {
      const diff: DependencyDiff = {
        added: [],
        removed: [],
        versionChanged: [{ name: 'pkg', from: '1.0.0', to: '1.0.1' }],
        integrityChanged: [{ name: 'pkg', version: '1.0.1', from: 'sha512-old==', to: 'sha512-new==' }],
        registryChanged: [],
      };

      const alerts = analyzeRisks(diff);
      expect(alerts.some((a) => a.category === 'integrity-mismatch')).toBe(false);
    });

    it('flags bulk new production dependencies as high', () => {
      const added = Array.from({ length: 15 }, (_, i) => ({
        name: `pkg-${i}`,
        version: '1.0.0',
      }));

      const diff: DependencyDiff = {
        added,
        removed: [],
        versionChanged: [],
        integrityChanged: [],
        registryChanged: [],
      };

      const alerts = analyzeRisks(diff);
      expect(alerts.some((a) => a.level === 'high' && a.category === 'bulk-new-deps')).toBe(true);
    });

    it('flags major version bumps as medium', () => {
      const diff: DependencyDiff = {
        added: [],
        removed: [],
        versionChanged: [{ name: 'pkg', from: '1.5.0', to: '2.0.0' }],
        integrityChanged: [],
        registryChanged: [],
      };

      const alerts = analyzeRisks(diff);
      expect(alerts.some((a) => a.category === 'major-version-bump')).toBe(true);
    });

    it('skips major version alerts for dev dependencies', () => {
      const diff: DependencyDiff = {
        added: [],
        removed: [],
        versionChanged: [{ name: 'vitest', from: '1.0.0', to: '2.0.0', dev: true }],
        integrityChanged: [],
        registryChanged: [],
      };

      const alerts = analyzeRisks(diff);
      expect(alerts.some((a) => a.category === 'major-version-bump')).toBe(false);
    });

    it('alerts are sorted by severity', () => {
      const diff: DependencyDiff = {
        added: [{ name: 'new-pkg', version: '1.0.0' }],
        removed: [],
        versionChanged: [],
        integrityChanged: [],
        registryChanged: [{ name: 'hijacked', version: '1.0.0', from: 'https://registry.npmjs.org/...', to: 'https://evil.com/...' }],
      };

      const alerts = analyzeRisks(diff);
      expect(alerts.length).toBeGreaterThan(1);
      // First alert should be critical
      expect(alerts[0]!.level).toBe('critical');
    });

    it('returns empty alerts for no changes', () => {
      const diff: DependencyDiff = {
        added: [],
        removed: [],
        versionChanged: [],
        integrityChanged: [],
        registryChanged: [],
      };

      const alerts = analyzeRisks(diff);
      expect(alerts).toHaveLength(0);
    });
  });
});
