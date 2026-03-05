/**
 * SBOM Generator — Produces CycloneDX 1.5 Software Bill of Materials
 * from the installed npm dependency tree.
 *
 * Reads package-lock.json to enumerate all direct and transitive dependencies
 * with their resolved versions, integrity hashes, and license metadata.
 *
 * Output conforms to the CycloneDX 1.5 JSON specification.
 * Reference: https://cyclonedx.org/specification/overview/
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { VERSION } from '../version.js';

export interface SbomComponent {
  type: 'library';
  name: string;
  version: string;
  purl: string;
  scope?: 'required' | 'optional';
  licenses?: { license: { id: string } }[];
  hashes?: { alg: string; content: string }[];
  externalReferences?: { type: string; url: string }[];
}

export interface SbomDocument {
  bomFormat: 'CycloneDX';
  specVersion: '1.5';
  serialNumber: string;
  version: number;
  metadata: {
    timestamp: string;
    tools: { vendor: string; name: string; version: string }[];
    component: {
      type: 'application';
      name: string;
      version: string;
    };
  };
  components: SbomComponent[];
}

interface PackageLockDep {
  version?: string;
  resolved?: string;
  integrity?: string;
  dev?: boolean;
  license?: string | string[];
  optional?: boolean;
  dependencies?: Record<string, PackageLockDep>;
}

interface PackageLockV3 {
  lockfileVersion?: number;
  packages?: Record<string, PackageLockDep>;
  dependencies?: Record<string, PackageLockDep>;
}

export interface SbomOptions {
  /** Root directory containing package-lock.json (defaults to process.cwd()) */
  rootDir?: string;
  /** Include devDependencies (default: false) */
  includeDev?: boolean;
  /** Output format: 'json' or 'xml' (default: 'json') */
  format?: 'json';
}

/**
 * Generate a CycloneDX 1.5 SBOM from the npm dependency tree.
 */
export function generateSbom(options: SbomOptions = {}): SbomDocument {
  const rootDir = options.rootDir ?? process.cwd();
  const includeDev = options.includeDev ?? false;

  const lockPath = findLockFile(rootDir);
  if (!lockPath) {
    throw new Error(`No package-lock.json found in ${rootDir} or parent directories`);
  }

  const lockData: PackageLockV3 = JSON.parse(readFileSync(lockPath, 'utf-8'));

  // Read root package.json for application metadata
  const rootPkgPath = join(dirname(lockPath), 'package.json');
  const rootPkg = existsSync(rootPkgPath)
    ? (JSON.parse(readFileSync(rootPkgPath, 'utf-8')) as Record<string, unknown>)
    : {};

  const components = extractComponents(lockData, includeDev);

  const serialNumber = `urn:uuid:${generateUuid()}`;

  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    serialNumber,
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      tools: [
        {
          vendor: 'SecureYeoman',
          name: 'secureyeoman-sbom',
          version: VERSION,
        },
      ],
      component: {
        type: 'application',
        name: (rootPkg.name as string) ?? 'secureyeoman',
        version: (rootPkg.version as string) ?? VERSION,
      },
    },
    components,
  };
}

function findLockFile(startDir: string): string | null {
  let dir = startDir;
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, 'package-lock.json');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function extractComponents(lockData: PackageLockV3, includeDev: boolean): SbomComponent[] {
  const components: SbomComponent[] = [];
  const seen = new Set<string>();

  // lockfileVersion 2/3 uses "packages" with path keys
  if (lockData.packages) {
    for (const [path, dep] of Object.entries(lockData.packages)) {
      if (!path || path === '') continue; // skip root
      if (!includeDev && dep.dev) continue;

      const name = extractNameFromPath(path);
      if (!name || !dep.version) continue;

      const key = `${name}@${dep.version}`;
      if (seen.has(key)) continue;
      seen.add(key);

      components.push(buildComponent(name, dep));
    }
  }

  // lockfileVersion 1 fallback uses "dependencies"
  if (lockData.dependencies && components.length === 0) {
    flattenV1Dependencies(lockData.dependencies, includeDev, components, seen);
  }

  components.sort((a, b) => a.name.localeCompare(b.name));
  return components;
}

function extractNameFromPath(path: string): string | null {
  // path format: "node_modules/@scope/name" or "node_modules/name"
  const match = /node_modules\/(.+)$/.exec(path);
  return match?.[1] ?? null;
}

function flattenV1Dependencies(
  deps: Record<string, PackageLockDep>,
  includeDev: boolean,
  components: SbomComponent[],
  seen: Set<string>,
  prefix = ''
): void {
  for (const [name, dep] of Object.entries(deps)) {
    if (!includeDev && dep.dev) continue;

    const fullName = prefix ? `${prefix}/${name}` : name;
    const key = `${fullName}@${dep.version ?? 'unknown'}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (dep.version) {
      components.push(buildComponent(fullName, dep));
    }

    if (dep.dependencies) {
      flattenV1Dependencies(dep.dependencies, includeDev, components, seen, fullName);
    }
  }
}

function buildComponent(name: string, dep: PackageLockDep): SbomComponent {
  const component: SbomComponent = {
    type: 'library',
    name,
    version: dep.version ?? 'unknown',
    purl: `pkg:npm/${name.startsWith('@') ? name.replace('/', '%2F') : name}@${dep.version ?? 'unknown'}`,
  };

  if (dep.optional) {
    component.scope = 'optional';
  }

  // Parse integrity hash (format: "sha512-...")
  if (dep.integrity) {
    const hashes = parseIntegrityHashes(dep.integrity);
    if (hashes.length > 0) {
      component.hashes = hashes;
    }
  }

  // License from lock file
  if (dep.license) {
    const licenseId = Array.isArray(dep.license) ? dep.license[0] : dep.license;
    if (licenseId) {
      component.licenses = [{ license: { id: licenseId } }];
    }
  }

  // Registry URL
  if (dep.resolved) {
    component.externalReferences = [{ type: 'distribution', url: dep.resolved }];
  }

  return component;
}

function parseIntegrityHashes(integrity: string): { alg: string; content: string }[] {
  const hashes: { alg: string; content: string }[] = [];

  for (const part of integrity.split(' ')) {
    const dashIdx = part.indexOf('-');
    if (dashIdx === -1) continue;

    const alg = part.substring(0, dashIdx).toUpperCase().replace('SHA-', 'SHA-');
    const b64 = part.substring(dashIdx + 1);

    // Convert base64 to hex for CycloneDX
    try {
      const hex = Buffer.from(b64, 'base64').toString('hex');
      // Map to CycloneDX algorithm names
      const cycloneAlg =
        alg === 'SHA512'
          ? 'SHA-512'
          : alg === 'SHA256'
            ? 'SHA-256'
            : alg === 'SHA1'
              ? 'SHA-1'
              : alg;
      hashes.push({ alg: cycloneAlg, content: hex });
    } catch {
      // skip malformed hash
    }
  }

  return hashes;
}

function generateUuid(): string {
  const bytes = createHash('sha256').update(`${Date.now()}-${Math.random()}`).digest();

  // Format as UUID v4-like
  const hex = bytes.subarray(0, 16).toString('hex');
  return [
    hex.substring(0, 8),
    hex.substring(8, 12),
    `4${hex.substring(13, 16)}`,
    hex.substring(16, 20),
    hex.substring(20, 32),
  ].join('-');
}
