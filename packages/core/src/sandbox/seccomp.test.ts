import { describe, it, expect } from 'vitest';
import {
  detectSeccomp,
  getAllowedSyscalls,
  getBlockedSyscalls,
  isSyscallAllowed,
} from './seccomp.js';

describe('seccomp', () => {
  it('should detect seccomp status', () => {
    const status = detectSeccomp();
    expect(status).toHaveProperty('available');
    expect(status).toHaveProperty('mode');
    expect(['disabled', 'strict', 'filter', 'unsupported']).toContain(status.mode);
  });

  it('should return allowed syscalls list', () => {
    const allowed = getAllowedSyscalls();
    expect(allowed).toContain('read');
    expect(allowed).toContain('write');
    expect(allowed).toContain('mmap');
    expect(allowed).not.toContain('ptrace');
  });

  it('should return blocked syscalls list', () => {
    const blocked = getBlockedSyscalls();
    expect(blocked).toContain('ptrace');
    expect(blocked).toContain('mount');
    expect(blocked).toContain('reboot');
    expect(blocked).not.toContain('read');
  });

  it('should correctly classify syscalls', () => {
    expect(isSyscallAllowed('read')).toBe(true);
    expect(isSyscallAllowed('write')).toBe(true);
    expect(isSyscallAllowed('ptrace')).toBe(false);
    expect(isSyscallAllowed('mount')).toBe(false);
    expect(isSyscallAllowed('reboot')).toBe(false);
  });

  it('should return false for unknown syscalls', () => {
    expect(isSyscallAllowed('nonexistent_syscall')).toBe(false);
  });

  it('should gracefully handle non-Linux platforms', () => {
    const status = detectSeccomp();
    // On Linux, should have kernelVersion; on others, mode should be unsupported
    if (process.platform !== 'linux') {
      expect(status.mode).toBe('unsupported');
    } else {
      expect(status.kernelVersion).toBeDefined();
    }
  });

  it('returns copy of allowed syscalls (not reference)', () => {
    const a = getAllowedSyscalls();
    const b = getAllowedSyscalls();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it('returns copy of blocked syscalls (not reference)', () => {
    const a = getBlockedSyscalls();
    const b = getBlockedSyscalls();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it('includes essential networking syscalls in allowed list', () => {
    const allowed = getAllowedSyscalls();
    expect(allowed).toContain('socket');
    expect(allowed).toContain('connect');
    expect(allowed).toContain('bind');
    expect(allowed).toContain('listen');
    expect(allowed).toContain('accept');
  });

  it('includes essential process syscalls in allowed list', () => {
    const allowed = getAllowedSyscalls();
    expect(allowed).toContain('clone');
    expect(allowed).toContain('fork');
    expect(allowed).toContain('exit');
    expect(allowed).toContain('wait4');
    expect(allowed).toContain('getpid');
  });

  it('blocks all kernel module syscalls', () => {
    expect(isSyscallAllowed('init_module')).toBe(false);
    expect(isSyscallAllowed('delete_module')).toBe(false);
  });

  it('blocks system administration syscalls', () => {
    expect(isSyscallAllowed('settimeofday')).toBe(false);
    expect(isSyscallAllowed('sethostname')).toBe(false);
    expect(isSyscallAllowed('setdomainname')).toBe(false);
    expect(isSyscallAllowed('acct')).toBe(false);
  });

  it('blocks filesystem mount syscalls', () => {
    expect(isSyscallAllowed('mount')).toBe(false);
    expect(isSyscallAllowed('umount2')).toBe(false);
    expect(isSyscallAllowed('pivot_root')).toBe(false);
  });

  it('blocks swap management syscalls', () => {
    expect(isSyscallAllowed('swapon')).toBe(false);
    expect(isSyscallAllowed('swapoff')).toBe(false);
  });
});
