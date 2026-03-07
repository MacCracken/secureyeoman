/**
 * Landlock Mapper — Converts SecureYeoman sandbox profiles to AGNOS Landlock policies.
 *
 * Maps the abstract SandboxProfile (technology-agnostic) to concrete AGNOS
 * Landlock policy payloads that can be submitted to the AGNOS runtime for
 * kernel-level enforcement on Linux 5.13+.
 *
 * Phase C — Sandbox Profile → Landlock Policy Mapping
 */

import type { SandboxProfile } from '@secureyeoman/shared';

/**
 * AGNOS Landlock policy format — matches the AGNOS runtime API contract.
 *
 * Landlock restricts filesystem access by path with granular access flags:
 *   - read_file: Read file content
 *   - read_dir: List directory entries
 *   - write_file: Write/truncate file
 *   - make_reg: Create regular files
 *   - make_dir: Create directories
 *   - remove_file: Unlink files
 *   - remove_dir: rmdir
 *   - execute: Execute files
 *   - refer: Cross-rename/link
 *   - truncate: Truncate file
 */
export interface LandlockRule {
  path: string;
  access: LandlockAccess[];
}

export type LandlockAccess =
  | 'read_file'
  | 'read_dir'
  | 'write_file'
  | 'make_reg'
  | 'make_dir'
  | 'remove_file'
  | 'remove_dir'
  | 'execute'
  | 'refer'
  | 'truncate';

export interface LandlockNetRule {
  port: number;
  access: ('bind_tcp' | 'connect_tcp')[];
}

export interface AgnosLandlockPolicy {
  /** Policy name — derived from profile name/label */
  name: string;
  /** Agent ID this policy applies to (optional — global if omitted) */
  agentId?: string;
  /** Filesystem access rules */
  filesystemRules: LandlockRule[];
  /** Network port rules (Landlock ABI >= 4, Linux 6.7+) */
  networkRules: LandlockNetRule[];
  /** Resource limits to enforce via cgroups */
  resourceLimits: {
    maxMemoryBytes: number;
    cpuQuotaPercent: number;
    maxFileSizeBytes: number;
    timeoutMs: number;
  };
  /** Tool restrictions communicated to AGNOS agent registry */
  toolRestrictions: {
    allowlist: string[];
    blocklist: string[];
  };
  /** Whether to enforce credential proxy for outbound requests */
  requireCredentialProxy: boolean;
}

/**
 * Convert a SecureYeoman SandboxProfile to an AGNOS Landlock policy.
 */
export function profileToLandlockPolicy(
  profile: SandboxProfile,
  agentId?: string
): AgnosLandlockPolicy {
  const filesystemRules: LandlockRule[] = [];

  // Read-only paths
  for (const path of profile.filesystem.allowedReadPaths) {
    filesystemRules.push({
      path,
      access: ['read_file', 'read_dir'],
    });
  }

  // Write paths — include read access implicitly
  for (const path of profile.filesystem.allowedWritePaths) {
    const existing = filesystemRules.find((r) => r.path === path);
    const writeAccess: LandlockAccess[] = [
      'read_file',
      'read_dir',
      'write_file',
      'make_reg',
      'make_dir',
      'remove_file',
      'remove_dir',
      'truncate',
    ];

    if (existing) {
      // Merge access flags
      const merged = new Set([...existing.access, ...writeAccess]);
      existing.access = [...merged] as LandlockAccess[];
    } else {
      filesystemRules.push({ path, access: writeAccess });
    }
  }

  // Exec paths
  for (const path of profile.filesystem.allowedExecPaths) {
    const existing = filesystemRules.find((r) => r.path === path);
    if (existing) {
      if (!existing.access.includes('execute')) {
        existing.access.push('execute');
      }
    } else {
      filesystemRules.push({
        path,
        access: ['read_file', 'read_dir', 'execute'],
      });
    }
  }

  // Network rules
  const networkRules: LandlockNetRule[] = [];
  if (profile.network.allowed && profile.network.allowedPorts.length > 0) {
    for (const port of profile.network.allowedPorts) {
      networkRules.push({
        port,
        access: ['connect_tcp'],
      });
    }
  } else if (profile.network.allowed && profile.network.allowedPorts.length === 0) {
    // All ports allowed — don't restrict network
    // (AGNOS interprets empty networkRules as unrestricted when network is allowed)
  }
  // If !profile.network.allowed, empty networkRules = deny all network

  return {
    name: `sy-${profile.name}-${profile.label.toLowerCase().replace(/\s+/g, '-')}`,
    agentId,
    filesystemRules,
    networkRules,
    resourceLimits: {
      maxMemoryBytes: profile.resources.maxMemoryMb * 1024 * 1024,
      cpuQuotaPercent: profile.resources.maxCpuPercent,
      maxFileSizeBytes: profile.resources.maxFileSizeMb * 1024 * 1024,
      timeoutMs: profile.resources.timeoutMs,
    },
    toolRestrictions: {
      allowlist: profile.toolRestrictions.allowlist,
      blocklist: profile.toolRestrictions.blocklist,
    },
    requireCredentialProxy: profile.credentialProxy.required,
  };
}

/**
 * Submit a Landlock policy to the AGNOS runtime.
 */
export async function submitPolicyToAgnos(
  runtimeUrl: string,
  policy: AgnosLandlockPolicy,
  apiKey?: string
): Promise<{ ok: boolean; policyId?: string; error?: string }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  try {
    const res = await fetch(`${runtimeUrl}/v1/policies/landlock`, {
      method: 'POST',
      headers,
      body: JSON.stringify(policy),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
    }

    const result = (await res.json()) as { policy_id?: string };
    return { ok: true, policyId: result.policy_id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Sync all SecureYeoman sandbox profiles to AGNOS as Landlock policies.
 */
export async function syncProfilesToAgnos(
  profiles: SandboxProfile[],
  runtimeUrl: string,
  apiKey?: string
): Promise<{ synced: number; failed: number; errors: string[] }> {
  let synced = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const profile of profiles) {
    if (!profile.enabled) continue;

    const policy = profileToLandlockPolicy(profile);
    const result = await submitPolicyToAgnos(runtimeUrl, policy, apiKey);

    if (result.ok) {
      synced++;
    } else {
      failed++;
      errors.push(`${profile.name}: ${result.error}`);
    }
  }

  return { synced, failed, errors };
}
