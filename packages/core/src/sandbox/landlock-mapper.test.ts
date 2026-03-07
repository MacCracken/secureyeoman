import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  profileToLandlockPolicy,
  submitPolicyToAgnos,
  syncProfilesToAgnos,
} from './landlock-mapper.js';
import type { SandboxProfile } from '@secureyeoman/shared';

function makeProfile(overrides?: Partial<SandboxProfile>): SandboxProfile {
  return {
    name: 'prod',
    label: 'Production',
    description: 'Production sandbox',
    enabled: true,
    technology: 'landlock',
    filesystem: {
      allowedReadPaths: ['/tmp', '/usr/lib'],
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
    toolRestrictions: { allowlist: [], blocklist: ['shell_exec'] },
    isBuiltin: true,
    createdAt: 0,
    updatedAt: 0,
    tenantId: 'default',
    ...overrides,
  } as SandboxProfile;
}

describe('landlock-mapper', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('profileToLandlockPolicy', () => {
    it('converts a production profile to Landlock policy', () => {
      const policy = profileToLandlockPolicy(makeProfile());

      expect(policy.name).toBe('sy-prod-production');
      expect(policy.requireCredentialProxy).toBe(true);
      expect(policy.toolRestrictions.blocklist).toContain('shell_exec');
    });

    it('maps filesystem paths to correct access flags', () => {
      const policy = profileToLandlockPolicy(makeProfile());

      // /tmp is both read and write
      const tmpRule = policy.filesystemRules.find((r) => r.path === '/tmp');
      expect(tmpRule).toBeTruthy();
      expect(tmpRule!.access).toContain('read_file');
      expect(tmpRule!.access).toContain('write_file');
      expect(tmpRule!.access).toContain('make_reg');

      // /usr/lib is read-only
      const libRule = policy.filesystemRules.find((r) => r.path === '/usr/lib');
      expect(libRule).toBeTruthy();
      expect(libRule!.access).toContain('read_file');
      expect(libRule!.access).not.toContain('write_file');

      // /usr/bin has execute
      const binRule = policy.filesystemRules.find((r) => r.path === '/usr/bin');
      expect(binRule).toBeTruthy();
      expect(binRule!.access).toContain('execute');
    });

    it('maps network ports to connect_tcp rules', () => {
      const policy = profileToLandlockPolicy(makeProfile());
      expect(policy.networkRules).toHaveLength(1);
      expect(policy.networkRules[0].port).toBe(443);
      expect(policy.networkRules[0].access).toContain('connect_tcp');
    });

    it('generates empty network rules when network disabled', () => {
      const policy = profileToLandlockPolicy(makeProfile({
        network: { allowed: false, allowedHosts: [], allowedPorts: [] },
      }));
      expect(policy.networkRules).toHaveLength(0);
    });

    it('converts resource limits to bytes', () => {
      const policy = profileToLandlockPolicy(makeProfile());
      expect(policy.resourceLimits.maxMemoryBytes).toBe(1024 * 1024 * 1024);
      expect(policy.resourceLimits.maxFileSizeBytes).toBe(100 * 1024 * 1024);
      expect(policy.resourceLimits.cpuQuotaPercent).toBe(50);
      expect(policy.resourceLimits.timeoutMs).toBe(30000);
    });

    it('includes agentId when provided', () => {
      const policy = profileToLandlockPolicy(makeProfile(), 'agent-42');
      expect(policy.agentId).toBe('agent-42');
    });

    it('handles high-security profile with no exec paths', () => {
      const policy = profileToLandlockPolicy(makeProfile({
        name: 'high-security',
        label: 'High Security',
        filesystem: {
          allowedReadPaths: ['/tmp'],
          allowedWritePaths: ['/tmp'],
          allowedExecPaths: [],
        },
        network: { allowed: false, allowedHosts: [], allowedPorts: [] },
      }));

      const execRules = policy.filesystemRules.filter((r) => r.access.includes('execute'));
      expect(execRules).toHaveLength(0);
    });
  });

  describe('submitPolicyToAgnos', () => {
    it('submits policy and returns policyId on success', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ policy_id: 'pol-123' }),
      }));

      const policy = profileToLandlockPolicy(makeProfile());
      const result = await submitPolicyToAgnos('http://localhost:8090', policy, 'key');
      expect(result.ok).toBe(true);
      expect(result.policyId).toBe('pol-123');
    });

    it('returns error on HTTP failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Bad Request'),
      }));

      const policy = profileToLandlockPolicy(makeProfile());
      const result = await submitPolicyToAgnos('http://localhost:8090', policy);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('HTTP 400');
    });

    it('returns error on network failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

      const policy = profileToLandlockPolicy(makeProfile());
      const result = await submitPolicyToAgnos('http://localhost:8090', policy);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('ECONNREFUSED');
    });
  });

  describe('syncProfilesToAgnos', () => {
    it('syncs enabled profiles and counts results', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ policy_id: 'p1' }),
      }));

      const profiles = [
        makeProfile({ name: 'prod', enabled: true }),
        makeProfile({ name: 'dev', enabled: true }),
        makeProfile({ name: 'staging', enabled: false }),
      ];

      const result = await syncProfilesToAgnos(profiles, 'http://localhost:8090');
      expect(result.synced).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('skips disabled profiles', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ policy_id: 'p1' }),
      });
      vi.stubGlobal('fetch', fetchSpy);

      await syncProfilesToAgnos(
        [makeProfile({ enabled: false })],
        'http://localhost:8090'
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
