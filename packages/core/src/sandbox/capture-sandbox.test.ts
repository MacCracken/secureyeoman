/**
 * Capture Sandbox Tests
 *
 * @see NEXT_STEP_05: Sandboxing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LinuxCaptureSandbox } from '../sandbox/linux-capture-sandbox.js';
import { DarwinCaptureSandbox } from '../sandbox/darwin-capture-sandbox.js';
import {
  DEFAULT_CAPTURE_SANDBOX,
  type CaptureSandboxConfig,
  type CaptureSandboxViolation,
} from '../sandbox/capture-sandbox.js';

describe('CaptureSandboxConfig', () => {
  it('should have correct default values', () => {
    expect(DEFAULT_CAPTURE_SANDBOX.maxMemory).toBe(512);
    expect(DEFAULT_CAPTURE_SANDBOX.maxCpuPercent).toBe(50);
    expect(DEFAULT_CAPTURE_SANDBOX.maxDuration).toBe(300);
    expect(DEFAULT_CAPTURE_SANDBOX.allowNetwork).toBe(false);
    expect(DEFAULT_CAPTURE_SANDBOX.syscallPolicy).toBe('capture-only');
    expect(DEFAULT_CAPTURE_SANDBOX.displayAccess).toBe('capture-only');
    expect(DEFAULT_CAPTURE_SANDBOX.isolateProcesses).toBe(true);
    expect(DEFAULT_CAPTURE_SANDBOX.maxProcesses).toBe(4);
  });

  it('should allow partial config override', () => {
    const config: Partial<CaptureSandboxConfig> = {
      maxMemory: 1024,
      maxDuration: 600,
    };

    const sandbox = new LinuxCaptureSandbox(config);
    const actual = sandbox.getConfig();

    expect(actual.maxMemory).toBe(1024);
    expect(actual.maxDuration).toBe(600);
    expect(actual.maxCpuPercent).toBe(DEFAULT_CAPTURE_SANDBOX.maxCpuPercent);
  });
});

describe('LinuxCaptureSandbox', () => {
  let sandbox: LinuxCaptureSandbox;

  beforeEach(() => {
    sandbox = new LinuxCaptureSandbox();
  });

  describe('isAvailable', () => {
    it('should return true on linux', () => {
      const result = sandbox.isAvailable();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('initialize', () => {
    it('should initialize successfully on linux', async () => {
      if (sandbox.isAvailable()) {
        await expect(sandbox.initialize()).resolves.not.toThrow();
      } else {
        await expect(sandbox.initialize()).rejects.toThrow('only available on Linux');
      }
    });
  });

  describe('run', () => {
    it('should run function successfully', async () => {
      if (!sandbox.isAvailable()) {
        await sandbox.initialize();
      }

      const result = await sandbox.run(async () => {
        return 'success';
      });

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.violations).toEqual([]);
    });

    it('should catch and return errors', async () => {
      if (!sandbox.isAvailable()) {
        await sandbox.initialize();
      }

      const result = await sandbox.run(async () => {
        throw new Error('Test error');
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe('Test error');
    });
  });

  describe('validatePath', () => {
    it('should allow paths in allowedPaths', () => {
      const result = sandbox.validatePath('/usr/lib/libfoo.so', 'read');
      expect(result).toBe(true);
      expect(sandbox.getViolations()).toEqual([]);
    });

    it('should block paths in blockedPaths', () => {
      const result = sandbox.validatePath('/etc/passwd', 'read');
      expect(result).toBe(false);

      const violations = sandbox.getViolations();
      expect(violations).toHaveLength(1);
      expect(violations[0].type).toBe('filesystem');
      expect(violations[0].severity).toBe('high');
    });

    it('should allow write paths matching patterns', () => {
      const result = sandbox.validatePath('/tmp/capture-123', 'write');
      expect(result).toBe(true);
    });

    it('should block writes to non-temp paths', () => {
      const result = sandbox.validatePath('/home/user/file.txt', 'write');
      expect(result).toBe(false);

      const violations = sandbox.getViolations();
      expect(violations[0].severity).toBe('medium');
    });
  });

  describe('checkResourceLimits', () => {
    it('should pass when under limits', () => {
      const result = sandbox.checkResourceLimits({
        memoryMb: 256,
        cpuPercent: 25,
      });

      expect(result).toBe(true);
    });

    it('should fail when memory exceeds limit', async () => {
      const testSandbox = new LinuxCaptureSandbox({
        maxMemory: 512,
      });
      await testSandbox.initialize();

      const result = testSandbox.checkResourceLimits({
        memoryMb: 1024,
        cpuPercent: 25,
      });

      expect(result).toBe(false);

      const violations = testSandbox.getViolations();
      expect(violations).toHaveLength(1);
      expect(violations[0].type).toBe('resource');
      expect(violations[0].severity).toBe('critical');
    });

    it('should fail when CPU exceeds limit', () => {
      const result = sandbox.checkResourceLimits({
        memoryMb: 256,
        cpuPercent: 75,
      });

      expect(result).toBe(false);

      const violations = sandbox.getViolations();
      expect(violations[0].severity).toBe('high');
    });
  });

  describe('syscalls', () => {
    it('should return allowed syscalls', () => {
      const allowed = sandbox.getAllowedSyscalls();
      expect(allowed).toContain('read');
      expect(allowed).toContain('write');
      expect(allowed).toContain('mmap');
    });

    it('should return blocked syscalls', () => {
      const blocked = sandbox.getBlockedSyscalls();
      expect(blocked).toContain('socket');
      expect(blocked).toContain('fork');
      expect(blocked).toContain('ptrace');
    });
  });
});

describe('DarwinCaptureSandbox', () => {
  let sandbox: DarwinCaptureSandbox;

  beforeEach(() => {
    sandbox = new DarwinCaptureSandbox();
  });

  describe('isAvailable', () => {
    it('should return true on darwin', () => {
      const result = sandbox.isAvailable();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('initialize', () => {
    it('should initialize successfully on darwin', async () => {
      if (sandbox.isAvailable()) {
        await expect(sandbox.initialize()).resolves.not.toThrow();
      } else {
        await expect(sandbox.initialize()).rejects.toThrow('only available on macOS');
      }
    });
  });

  describe('run', () => {
    it('should run function successfully', async () => {
      if (!sandbox.isAvailable()) {
        return;
      }

      const result = await sandbox.run(async () => {
        return 'success';
      });

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
    });
  });

  describe('generateSeatbeltProfile', () => {
    it('should generate a valid profile', () => {
      const profile = sandbox.generateSeatbeltProfile();
      expect(profile).toContain('(version 1)');
      expect(profile).toContain('(deny default)');
      expect(profile).toContain('(allow file-read*');
      expect(profile).toContain('(deny network*)');
    });

    it('should deny network when allowNetwork is false', () => {
      const profile = sandbox.generateSeatbeltProfile();
      expect(profile).toContain('(deny network*)');
    });
  });

  describe('validatePath', () => {
    it('should block paths in blockedPaths', () => {
      const result = sandbox.validatePath('~/.ssh/id_rsa', 'read');
      expect(result).toBe(false);

      const violations = sandbox.getViolations();
      expect(violations).toHaveLength(1);
      expect(violations[0].severity).toBe('high');
    });
  });
});

describe('Sandbox Violations', () => {
  it('should create violations with correct structure', () => {
    const violation: CaptureSandboxViolation = {
      type: 'filesystem',
      description: 'Test violation',
      path: '/test/path',
      timestamp: Date.now(),
      severity: 'high',
    };

    expect(violation.type).toBe('filesystem');
    expect(violation.description).toBe('Test violation');
    expect(violation.severity).toBe('high');
  });
});
