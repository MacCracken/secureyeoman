import { describe, it, expect } from 'vitest';
import {
  detectNamespaceSupport,
  buildUnshareCommand,
} from './namespaces.js';

describe('namespaces', () => {
  it('should detect namespace capabilities', () => {
    const caps = detectNamespaceSupport();
    expect(caps).toHaveProperty('userNamespaces');
    expect(caps).toHaveProperty('pidNamespaces');
    expect(caps).toHaveProperty('networkNamespaces');
    expect(caps).toHaveProperty('mountNamespaces');
    expect(caps).toHaveProperty('unshareAvailable');
  });

  it('should build unshare command with PID namespace', () => {
    const cmd = buildUnshareCommand('echo hello', { pid: true });
    expect(cmd).toContain('unshare');
    expect(cmd).toContain('--user');
    expect(cmd).toContain('--pid');
    expect(cmd).toContain('--fork');
    expect(cmd).toContain('echo hello');
  });

  it('should build unshare command with network namespace', () => {
    const cmd = buildUnshareCommand('ls', { network: true });
    expect(cmd).toContain('--net');
  });

  it('should build unshare command with mount namespace', () => {
    const cmd = buildUnshareCommand('ls', { mount: true, workDir: '/tmp' });
    expect(cmd).toContain('--mount');
    expect(cmd).toContain('--mount-proc');
  });

  it('should always include --user flag', () => {
    const cmd = buildUnshareCommand('echo test');
    expect(cmd).toContain('--user');
  });

  it('should gracefully handle non-Linux platforms', () => {
    const caps = detectNamespaceSupport();
    if (process.platform !== 'linux') {
      expect(caps.userNamespaces).toBe(false);
      expect(caps.unshareAvailable).toBe(false);
    }
  });
});
