import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SandboxProfileRegistry } from './sandbox-profiles.js';

function makeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any;
}

describe('SandboxProfileRegistry', () => {
  let registry: SandboxProfileRegistry;

  beforeEach(() => {
    registry = new SandboxProfileRegistry({ log: makeLogger() });
  });

  // ── Builtins ─────────────────────────────────────────────────────

  it('lists all 4 builtin profiles', () => {
    const profiles = registry.listProfiles();
    expect(profiles).toHaveLength(4);
    const names = profiles.map((p) => p.name);
    expect(names).toContain('dev');
    expect(names).toContain('staging');
    expect(names).toContain('prod');
    expect(names).toContain('high-security');
  });

  it('gets a builtin profile by name', () => {
    const dev = registry.getProfile('dev');
    expect(dev).toBeTruthy();
    expect(dev!.label).toBe('Development');
    expect(dev!.isBuiltin).toBe(true);
  });

  it('returns null for unknown profile', () => {
    expect(registry.getProfile('nonexistent')).toBeNull();
  });

  it('dev profile has permissive settings', () => {
    const dev = registry.getProfile('dev')!;
    expect(dev.network.allowed).toBe(true);
    expect(dev.resources.maxMemoryMb).toBe(4096);
    expect(dev.resources.maxCpuPercent).toBe(90);
  });

  it('high-security profile has restrictive settings', () => {
    const hs = registry.getProfile('high-security')!;
    expect(hs.network.allowed).toBe(false);
    expect(hs.resources.maxMemoryMb).toBe(512);
    expect(hs.credentialProxy.required).toBe(true);
    expect(hs.technology).toBe('auto');
    expect(hs.toolRestrictions.blocklist.length).toBeGreaterThan(0);
  });

  it('prod profile requires credential proxy', () => {
    const prod = registry.getProfile('prod')!;
    expect(prod.credentialProxy.required).toBe(true);
    expect(prod.toolRestrictions.blocklist).toContain('shell_exec');
  });

  // ── Custom Profiles ──────────────────────────────────────────────

  it('saves a custom profile', () => {
    const profile = registry.saveCustomProfile({
      name: 'custom',
      label: 'My Custom',
      description: 'Test profile',
      enabled: true,
      technology: 'wasm',
      filesystem: { allowedReadPaths: ['/data'], allowedWritePaths: [], allowedExecPaths: [] },
      resources: { maxMemoryMb: 256, maxCpuPercent: 10, maxFileSizeMb: 10, timeoutMs: 5000 },
      network: { allowed: false, allowedHosts: [], allowedPorts: [] },
      credentialProxy: { required: false, allowedHosts: [] },
      toolRestrictions: { allowlist: ['read_file'], blocklist: [] },
      tenantId: 'default',
    });
    expect(profile.name).toBe('custom');
    expect(profile.isBuiltin).toBe(false);
    expect(profile.createdAt).toBeGreaterThan(0);
  });

  it('custom profiles appear in list', () => {
    registry.saveCustomProfile({
      name: 'custom',
      label: 'Test',
      technology: 'auto',
      filesystem: {},
      resources: {},
      network: {},
      credentialProxy: {},
      toolRestrictions: {},
      tenantId: 'default',
    } as any);
    expect(registry.listProfiles()).toHaveLength(5);
  });

  it('deletes a custom profile', () => {
    registry.saveCustomProfile({
      name: 'custom',
      label: 'Temp',
      technology: 'auto',
      filesystem: {},
      resources: {},
      network: {},
      credentialProxy: {},
      toolRestrictions: {},
      tenantId: 'default',
    } as any);
    expect(registry.deleteCustomProfile('Temp')).toBe(true);
    expect(registry.listProfiles()).toHaveLength(4);
  });

  it('returns false when deleting nonexistent custom profile', () => {
    expect(registry.deleteCustomProfile('nope')).toBe(false);
  });

  // ── Config Conversion ────────────────────────────────────────────

  it('converts profile to manager config', () => {
    const dev = registry.getProfile('dev')!;
    const config = registry.toManagerConfig(dev);
    expect(config.enabled).toBe(true);
    expect(config.technology).toBe('auto');
    expect(config.networkAllowed).toBe(true);
    expect(config.maxMemoryMb).toBe(4096);
    expect(config.allowedReadPaths).toContain('/tmp');
  });

  it('converts high-security profile to restrictive config', () => {
    const hs = registry.getProfile('high-security')!;
    const config = registry.toManagerConfig(hs);
    expect(config.networkAllowed).toBe(false);
    expect(config.technology).toBe('auto');
    expect(config.maxMemoryMb).toBe(512);
  });
});
