/**
 * Dependency Provenance Tracker — Detects risky changes in the dependency
 * tree by comparing two package-lock.json snapshots.
 *
 * Detects:
 *   - New direct and transitive dependencies
 *   - Removed dependencies
 *   - Version changes (with semver analysis)
 *   - Integrity hash changes (potential tampering)
 *   - Registry URL changes (redirect attacks)
 *
 * Usage:
 *   const diff = diffLockFiles(oldLock, newLock);
 *   const alerts = analyzeRisks(diff);
 */

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface LockEntry {
  name: string;
  version: string;
  integrity?: string;
  resolved?: string;
  dev?: boolean;
}

export interface DependencyDiff {
  added: LockEntry[];
  removed: LockEntry[];
  versionChanged: Array<{ name: string; from: string; to: string; dev?: boolean }>;
  integrityChanged: Array<{ name: string; version: string; from: string; to: string }>;
  registryChanged: Array<{ name: string; version: string; from: string; to: string }>;
}

export type RiskLevel = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface ProvenanceAlert {
  level: RiskLevel;
  category: string;
  message: string;
  package?: string;
  details?: string;
}

/**
 * Parse a package-lock.json into a normalized list of LockEntry.
 */
export function parseLockFile(content: string): Map<string, LockEntry> {
  const lock = JSON.parse(content) as {
    packages?: Record<string, { version?: string; integrity?: string; resolved?: string; dev?: boolean }>;
    dependencies?: Record<string, { version?: string; integrity?: string; resolved?: string; dev?: boolean }>;
  };

  const entries = new Map<string, LockEntry>();

  if (lock.packages) {
    for (const [path, dep] of Object.entries(lock.packages)) {
      if (!path || path === '') continue;
      const name = extractName(path);
      if (!name || !dep.version) continue;
      entries.set(name, {
        name,
        version: dep.version,
        integrity: dep.integrity,
        resolved: dep.resolved,
        dev: dep.dev,
      });
    }
  } else if (lock.dependencies) {
    flattenDeps(lock.dependencies, entries);
  }

  return entries;
}

function extractName(path: string): string | null {
  const match = path.match(/node_modules\/(.+)$/);
  return match?.[1] ?? null;
}

function flattenDeps(
  deps: Record<string, { version?: string; integrity?: string; resolved?: string; dev?: boolean; dependencies?: Record<string, unknown> }>,
  entries: Map<string, LockEntry>
): void {
  for (const [name, dep] of Object.entries(deps)) {
    if (!dep.version) continue;
    entries.set(name, {
      name,
      version: dep.version,
      integrity: dep.integrity,
      resolved: dep.resolved,
      dev: dep.dev,
    });
  }
}

/**
 * Diff two lock file snapshots.
 */
export function diffLockFiles(
  oldEntries: Map<string, LockEntry>,
  newEntries: Map<string, LockEntry>
): DependencyDiff {
  const added: LockEntry[] = [];
  const removed: LockEntry[] = [];
  const versionChanged: DependencyDiff['versionChanged'] = [];
  const integrityChanged: DependencyDiff['integrityChanged'] = [];
  const registryChanged: DependencyDiff['registryChanged'] = [];

  // Find added and changed
  for (const [name, newEntry] of newEntries) {
    const oldEntry = oldEntries.get(name);
    if (!oldEntry) {
      added.push(newEntry);
      continue;
    }

    if (oldEntry.version !== newEntry.version) {
      versionChanged.push({
        name,
        from: oldEntry.version,
        to: newEntry.version,
        dev: newEntry.dev,
      });
    }

    if (oldEntry.integrity && newEntry.integrity && oldEntry.integrity !== newEntry.integrity) {
      integrityChanged.push({
        name,
        version: newEntry.version,
        from: oldEntry.integrity,
        to: newEntry.integrity,
      });
    }

    if (oldEntry.resolved && newEntry.resolved) {
      const oldRegistry = extractRegistry(oldEntry.resolved);
      const newRegistry = extractRegistry(newEntry.resolved);
      if (oldRegistry && newRegistry && oldRegistry !== newRegistry) {
        registryChanged.push({
          name,
          version: newEntry.version,
          from: oldEntry.resolved,
          to: newEntry.resolved,
        });
      }
    }
  }

  // Find removed
  for (const [name, oldEntry] of oldEntries) {
    if (!newEntries.has(name)) {
      removed.push(oldEntry);
    }
  }

  return { added, removed, versionChanged, integrityChanged, registryChanged };
}

function extractRegistry(resolved: string): string | null {
  try {
    const url = new URL(resolved);
    return url.hostname;
  } catch {
    return null;
  }
}

/**
 * Analyze a dependency diff for security risks.
 */
export function analyzeRisks(diff: DependencyDiff): ProvenanceAlert[] {
  const alerts: ProvenanceAlert[] = [];

  // Registry changes are critical (potential supply chain redirect)
  for (const change of diff.registryChanged) {
    alerts.push({
      level: 'critical',
      category: 'registry-change',
      message: `Package "${change.name}" registry changed`,
      package: change.name,
      details: `From: ${change.from}\nTo:   ${change.to}`,
    });
  }

  // Integrity changes without version bump (possible tampering)
  for (const change of diff.integrityChanged) {
    const versionAlsoChanged = diff.versionChanged.some((v) => v.name === change.name);
    if (!versionAlsoChanged) {
      alerts.push({
        level: 'critical',
        category: 'integrity-mismatch',
        message: `Package "${change.name}@${change.version}" integrity hash changed without version bump`,
        package: change.name,
        details: `Old: ${change.from.substring(0, 32)}...\nNew: ${change.to.substring(0, 32)}...`,
      });
    }
  }

  // Large batch of new non-dev dependencies
  const newProdDeps = diff.added.filter((d) => !d.dev);
  if (newProdDeps.length > 10) {
    alerts.push({
      level: 'high',
      category: 'bulk-new-deps',
      message: `${newProdDeps.length} new production dependencies added in one change`,
      details: newProdDeps.map((d) => `  ${d.name}@${d.version}`).join('\n'),
    });
  }

  // Individual new production dependencies
  for (const dep of newProdDeps) {
    alerts.push({
      level: 'medium',
      category: 'new-dependency',
      message: `New production dependency: ${dep.name}@${dep.version}`,
      package: dep.name,
    });
  }

  // Major version bumps in production deps
  for (const change of diff.versionChanged) {
    if (change.dev) continue;
    const oldMajor = parseInt(change.from.split('.')[0] ?? '0', 10);
    const newMajor = parseInt(change.to.split('.')[0] ?? '0', 10);
    if (newMajor > oldMajor) {
      alerts.push({
        level: 'medium',
        category: 'major-version-bump',
        message: `Major version bump: ${change.name} ${change.from} -> ${change.to}`,
        package: change.name,
      });
    }
  }

  // New dev dependencies (informational)
  const newDevDeps = diff.added.filter((d) => d.dev);
  for (const dep of newDevDeps) {
    alerts.push({
      level: 'info',
      category: 'new-dev-dependency',
      message: `New dev dependency: ${dep.name}@${dep.version}`,
      package: dep.name,
    });
  }

  // Sort by severity
  const order: Record<RiskLevel, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  alerts.sort((a, b) => order[a.level] - order[b.level]);

  return alerts;
}

/**
 * Compare the current package-lock.json against a saved baseline.
 *
 * The baseline is stored at `.secureyeoman/dependency-baseline.json`.
 * If no baseline exists, the current lock file becomes the baseline.
 */
export function trackDependencies(rootDir: string): {
  diff: DependencyDiff;
  alerts: ProvenanceAlert[];
  baselineCreated: boolean;
} {
  const lockPath = join(rootDir, 'package-lock.json');
  const baselinePath = join(rootDir, '.secureyeoman', 'dependency-baseline.json');

  if (!existsSync(lockPath)) {
    throw new Error(`No package-lock.json found in ${rootDir}`);
  }

  const currentContent = readFileSync(lockPath, 'utf-8');
  const currentEntries = parseLockFile(currentContent);

  if (!existsSync(baselinePath)) {
    // Create baseline
    const baselineDir = join(rootDir, '.secureyeoman');
    if (!existsSync(baselineDir)) {
      const { mkdirSync } = require('node:fs') as typeof import('node:fs');
      mkdirSync(baselineDir, { recursive: true });
    }
    writeFileSync(baselinePath, currentContent, 'utf-8');
    return {
      diff: { added: [], removed: [], versionChanged: [], integrityChanged: [], registryChanged: [] },
      alerts: [],
      baselineCreated: true,
    };
  }

  const baselineContent = readFileSync(baselinePath, 'utf-8');
  const baselineEntries = parseLockFile(baselineContent);

  const diff = diffLockFiles(baselineEntries, currentEntries);
  const alerts = analyzeRisks(diff);

  return { diff, alerts, baselineCreated: false };
}

/**
 * Update the dependency baseline with the current lock file.
 */
export function updateBaseline(rootDir: string): void {
  const lockPath = join(rootDir, 'package-lock.json');
  const baselinePath = join(rootDir, '.secureyeoman', 'dependency-baseline.json');

  if (!existsSync(lockPath)) {
    throw new Error(`No package-lock.json found in ${rootDir}`);
  }

  const baselineDir = join(rootDir, '.secureyeoman');
  if (!existsSync(baselineDir)) {
    const { mkdirSync } = require('node:fs') as typeof import('node:fs');
    mkdirSync(baselineDir, { recursive: true });
  }

  const content = readFileSync(lockPath, 'utf-8');
  writeFileSync(baselinePath, content, 'utf-8');
}
