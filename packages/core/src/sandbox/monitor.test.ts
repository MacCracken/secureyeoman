/**
 * Sandbox Monitor Tests
 *
 * @see NEXT_STEP_05: Sandboxing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SandboxMonitor, getSandboxMonitor, resetSandboxMonitor } from '../sandbox/monitor.js';

describe('SandboxMonitor', () => {
  beforeEach(() => {
    resetSandboxMonitor();
  });

  describe('checkIntegrity', () => {
    it('should perform integrity checks', async () => {
      const monitor = new SandboxMonitor();
      const report = await monitor.checkIntegrity();

      expect(report).toBeDefined();
      expect(report.checks).toBeDefined();
      expect(Array.isArray(report.checks)).toBe(true);
      expect(report.timestamp).toBeDefined();
    });

    it('should include all expected checks', async () => {
      const monitor = new SandboxMonitor();
      const report = await monitor.checkIntegrity();

      const checkNames = report.checks.map((c) => c.name);
      expect(checkNames).toContain('namespace_isolation');
      expect(checkNames).toContain('filesystem_isolation');
      expect(checkNames).toContain('process_isolation');
      expect(checkNames).toContain('resource_limits');
    });

    it('should set allPassed based on check results', async () => {
      const monitor = new SandboxMonitor();
      const report = await monitor.checkIntegrity();

      expect(typeof report.allPassed).toBe('boolean');
    });
  });

  describe('checkNamespaceIsolation', () => {
    it('should run namespace checks', async () => {
      const monitor = new SandboxMonitor();
      const result = await monitor.checkNamespaceIsolation();

      expect(result).toBeDefined();
      expect(result.name).toBe('namespace_isolation');
      expect(typeof result.passed).toBe('boolean');
    });
  });

  describe('checkFilesystemIsolation', () => {
    it('should run filesystem checks', async () => {
      const monitor = new SandboxMonitor();
      const result = await monitor.checkFilesystemIsolation();

      expect(result).toBeDefined();
      expect(result.name).toBe('filesystem_isolation');
      expect(typeof result.passed).toBe('boolean');
    });
  });

  describe('checkProcessIsolation', () => {
    it('should run process checks', async () => {
      const monitor = new SandboxMonitor();
      const result = await monitor.checkProcessIsolation();

      expect(result).toBeDefined();
      expect(result.name).toBe('process_isolation');
      expect(typeof result.passed).toBe('boolean');
    });
  });

  describe('checkResourceLimits', () => {
    it('should run resource limit checks', async () => {
      const monitor = new SandboxMonitor();
      const result = await monitor.checkResourceLimits();

      expect(result).toBeDefined();
      expect(result.name).toBe('resource_limits');
      expect(typeof result.passed).toBe('boolean');
    });
  });

  describe('monitoring', () => {
    it('should start and stop monitoring', () => {
      const monitor = new SandboxMonitor();
      monitor.startMonitoring(100);
      expect(monitor.stopMonitoring()).toBeUndefined();
    });

    it('should return last report', () => {
      const monitor = new SandboxMonitor();
      expect(monitor.getLastReport()).toBeNull();
    });
  });

  describe('global instance', () => {
    it('should get global monitor', () => {
      const monitor = getSandboxMonitor();
      expect(monitor).toBeDefined();
    });

    it('should reset global monitor', () => {
      getSandboxMonitor();
      resetSandboxMonitor();
      const monitor = getSandboxMonitor();
      expect(monitor).toBeDefined();
    });
  });
});

describe('IntegrityReport', () => {
  it('should create valid report structure', () => {
    const report = {
      allPassed: true,
      checks: [{ name: 'test', passed: true }],
      timestamp: Date.now(),
    };

    expect(report.allPassed).toBe(true);
    expect(report.checks).toHaveLength(1);
    expect(report.timestamp).toBeDefined();
  });
});
