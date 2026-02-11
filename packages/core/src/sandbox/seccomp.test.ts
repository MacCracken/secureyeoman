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
});
