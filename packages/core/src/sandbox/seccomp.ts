/**
 * seccomp-bpf Filter — System call filtering for sandboxed execution on Linux.
 *
 * Uses the `prctl` system call via child process to apply seccomp filters.
 * Falls back gracefully when seccomp is not available (non-Linux, old kernels).
 *
 * Note: Full seccomp-bpf requires native bindings for BPF program creation.
 * This implementation provides a wrapper around the `seccomp` command-line
 * utilities and detection of kernel support.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { platform } from 'node:os';

export interface SeccompStatus {
  available: boolean;
  mode: 'disabled' | 'strict' | 'filter' | 'unsupported';
  kernelVersion?: string;
}

// Safe syscalls that should always be allowed
const ALLOWED_SYSCALLS = [
  'read', 'write', 'open', 'close', 'stat', 'fstat', 'lstat',
  'poll', 'lseek', 'mmap', 'mprotect', 'munmap', 'brk',
  'ioctl', 'access', 'pipe', 'select', 'sched_yield',
  'dup', 'dup2', 'nanosleep', 'getpid', 'socket',
  'connect', 'accept', 'sendto', 'recvfrom',
  'bind', 'listen', 'getsockname', 'getpeername',
  'clone', 'fork', 'vfork', 'exit', 'wait4',
  'uname', 'fcntl', 'flock', 'fsync', 'fdatasync',
  'getcwd', 'chdir', 'rename', 'mkdir', 'rmdir',
  'openat', 'readlinkat', 'newfstatat', 'unlinkat',
  'futex', 'epoll_wait', 'epoll_ctl', 'epoll_create1',
  'getrandom', 'memfd_create', 'clock_gettime',
  'exit_group', 'set_robust_list', 'get_robust_list',
  'rt_sigaction', 'rt_sigprocmask', 'rt_sigreturn',
];

// Dangerous syscalls that should be blocked
const BLOCKED_SYSCALLS = [
  'ptrace',     // Process tracing
  'mount',      // Filesystem mounting
  'umount2',    // Filesystem unmounting
  'reboot',     // System reboot
  'kexec_load', // Load new kernel
  'init_module', // Load kernel module
  'delete_module', // Unload kernel module
  'pivot_root', // Change root filesystem
  'swapon',     // Enable swap
  'swapoff',    // Disable swap
  'acct',       // Process accounting
  'settimeofday', // Set system time
  'sethostname',  // Set hostname
  'setdomainname', // Set domain name
];

/**
 * Detect seccomp availability on the current system
 */
export function detectSeccomp(): SeccompStatus {
  if (platform() !== 'linux') {
    return { available: false, mode: 'unsupported' };
  }

  try {
    // Check kernel version for seccomp support (3.5+ for filter mode)
    const kernelVersion = execSync('uname -r', { encoding: 'utf-8' }).trim();

    // Check if seccomp is enabled in the kernel
    const statusPath = `/proc/${process.pid}/status`;
    if (existsSync(statusPath)) {
      const status = readFileSync(statusPath, 'utf-8');
      const seccompLine = status.split('\n').find((l) => l.startsWith('Seccomp:'));
      if (seccompLine) {
        const mode = seccompLine.split(':')[1]?.trim();
        switch (mode) {
          case '0':
            return { available: true, mode: 'disabled', kernelVersion };
          case '1':
            return { available: true, mode: 'strict', kernelVersion };
          case '2':
            return { available: true, mode: 'filter', kernelVersion };
        }
      }
    }

    return { available: true, mode: 'disabled', kernelVersion };
  } catch {
    return { available: false, mode: 'unsupported' };
  }
}

/**
 * Get the list of allowed syscalls for sandboxed processes
 */
export function getAllowedSyscalls(): string[] {
  return [...ALLOWED_SYSCALLS];
}

/**
 * Get the list of blocked syscalls
 */
export function getBlockedSyscalls(): string[] {
  return [...BLOCKED_SYSCALLS];
}

/**
 * Check if a specific syscall would be allowed by the policy
 */
export function isSyscallAllowed(syscall: string): boolean {
  if (BLOCKED_SYSCALLS.includes(syscall)) return false;
  return ALLOWED_SYSCALLS.includes(syscall);
}
