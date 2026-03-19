/**
 * Sandbox Profiles — Named sandbox configurations with built-in presets.
 *
 * Provides dev, staging, prod, and high-security profiles with appropriate
 * defaults. Custom profiles can be created and persisted.
 */

import type {
  SandboxProfile,
  SandboxProfileName,
  SandboxProfileCreate,
} from '@secureyeoman/shared';
import type { SecureLogger } from '../logging/logger.js';

export interface SandboxProfileRegistryDeps {
  log: SecureLogger;
}

const BUILTIN_PROFILES: SandboxProfile[] = [
  {
    name: 'dev',
    label: 'Development',
    description:
      'Permissive sandbox for local development. Network unrestricted, generous resource limits.',
    enabled: true,
    technology: 'auto',
    filesystem: {
      allowedReadPaths: ['/tmp', '/home', '/var', '/usr', '/etc'],
      allowedWritePaths: ['/tmp', '/home'],
      allowedExecPaths: ['/usr/bin', '/usr/local/bin', '/home'],
    },
    resources: {
      maxMemoryMb: 4096,
      maxCpuPercent: 90,
      maxFileSizeMb: 1024,
      timeoutMs: 120000,
    },
    network: {
      allowed: true,
      allowedHosts: [],
      allowedPorts: [],
    },
    credentialProxy: { required: false, allowedHosts: [] },
    toolRestrictions: { allowlist: [], blocklist: [] },
    isBuiltin: true,
    createdAt: 0,
    updatedAt: 0,
    tenantId: 'default',
  },
  {
    name: 'staging',
    label: 'Staging',
    description:
      'Moderate restrictions simulating production. Network allowed with host filtering.',
    enabled: true,
    technology: 'auto',
    filesystem: {
      allowedReadPaths: ['/tmp', '/var/lib', '/usr'],
      allowedWritePaths: ['/tmp'],
      allowedExecPaths: ['/usr/bin', '/usr/local/bin'],
    },
    resources: {
      maxMemoryMb: 2048,
      maxCpuPercent: 70,
      maxFileSizeMb: 256,
      timeoutMs: 60000,
    },
    network: {
      allowed: true,
      allowedHosts: [],
      allowedPorts: [80, 443, 5432, 6379],
    },
    credentialProxy: { required: false, allowedHosts: [] },
    toolRestrictions: { allowlist: [], blocklist: [] },
    isBuiltin: true,
    createdAt: 0,
    updatedAt: 0,
    tenantId: 'default',
  },
  {
    name: 'prod',
    label: 'Production',
    description:
      'Locked-down sandbox for production workloads. Restricted paths, credential proxy recommended.',
    enabled: true,
    technology: 'auto',
    filesystem: {
      allowedReadPaths: ['/tmp', '/usr/lib', '/usr/share'],
      allowedWritePaths: ['/tmp'],
      allowedExecPaths: ['/usr/bin'],
    },
    resources: {
      maxMemoryMb: 1024,
      maxCpuPercent: 50,
      maxFileSizeMb: 100,
      timeoutMs: 30000,
    },
    network: {
      allowed: true,
      allowedHosts: [],
      allowedPorts: [443],
    },
    credentialProxy: { required: true, allowedHosts: [] },
    toolRestrictions: { allowlist: [], blocklist: ['shell_exec', 'file_delete', 'docker_exec'] },
    isBuiltin: true,
    createdAt: 0,
    updatedAt: 0,
    tenantId: 'default',
  },
  {
    name: 'high-security',
    label: 'High Security',
    description:
      'Maximum isolation. No network, minimal filesystem, credential proxy enforced, strict tool blocklist.',
    enabled: true,
    technology: 'auto',
    filesystem: {
      allowedReadPaths: ['/tmp'],
      allowedWritePaths: ['/tmp'],
      allowedExecPaths: [],
    },
    resources: {
      maxMemoryMb: 512,
      maxCpuPercent: 25,
      maxFileSizeMb: 50,
      timeoutMs: 15000,
    },
    network: {
      allowed: false,
      allowedHosts: [],
      allowedPorts: [],
    },
    credentialProxy: { required: true, allowedHosts: [] },
    toolRestrictions: {
      allowlist: [],
      blocklist: [
        'shell_exec',
        'file_delete',
        'file_write',
        'docker_exec',
        'docker_run',
        'browser_navigate',
      ],
    },
    isBuiltin: true,
    createdAt: 0,
    updatedAt: 0,
    tenantId: 'default',
  },
];

export class SandboxProfileRegistry {
  private readonly log: SecureLogger;
  private readonly customProfiles = new Map<string, SandboxProfile>();

  constructor(deps: SandboxProfileRegistryDeps) {
    this.log = deps.log;
  }

  /** Get all profiles (builtins + custom). */
  listProfiles(): SandboxProfile[] {
    return [...BUILTIN_PROFILES, ...this.customProfiles.values()];
  }

  /** Get a profile by name. Custom profiles shadow builtins if same name. */
  getProfile(name: SandboxProfileName | string): SandboxProfile | null {
    const custom = this.customProfiles.get(name);
    if (custom) return custom;
    return BUILTIN_PROFILES.find((p) => p.name === name) ?? null;
  }

  /** Get only builtin profiles. */
  getBuiltinProfiles(): SandboxProfile[] {
    return [...BUILTIN_PROFILES];
  }

  /** Create or update a custom profile. */
  saveCustomProfile(input: SandboxProfileCreate): SandboxProfile {
    const now = Date.now();
    const existing = this.customProfiles.get(input.label);
    const profile: SandboxProfile = {
      ...input,
      name: 'custom',
      isBuiltin: false,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.customProfiles.set(input.label, profile);
    this.log.info({ label: input.label }, 'Custom sandbox profile saved');
    return profile;
  }

  /** Delete a custom profile. Cannot delete builtins. */
  deleteCustomProfile(label: string): boolean {
    const deleted = this.customProfiles.delete(label);
    if (deleted) {
      this.log.info({ label }, 'Custom sandbox profile deleted');
    }
    return deleted;
  }

  /** Convert a profile to SandboxManagerConfig-compatible options. */
  toManagerConfig(profile: SandboxProfile): {
    enabled: boolean;
    technology: string;
    allowedReadPaths: string[];
    allowedWritePaths: string[];
    maxMemoryMb: number;
    maxCpuPercent: number;
    maxFileSizeMb: number;
    networkAllowed: boolean;
  } {
    return {
      enabled: profile.enabled,
      technology: profile.technology,
      allowedReadPaths: profile.filesystem.allowedReadPaths,
      allowedWritePaths: profile.filesystem.allowedWritePaths,
      maxMemoryMb: profile.resources.maxMemoryMb,
      maxCpuPercent: profile.resources.maxCpuPercent,
      maxFileSizeMb: profile.resources.maxFileSizeMb,
      networkAllowed: profile.network.allowed,
    };
  }
}
