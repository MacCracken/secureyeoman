import { describe, it, expect } from 'vitest';
import {
  detectNamespaceSupport,
  buildUnshareArgs,
  runInNamespace,
  isCommandAvailable,
  NamespaceError,
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

  it('should build unshare args with PID namespace', () => {
    const args = buildUnshareArgs('echo hello', { pid: true });
    expect(args).toContain('--user');
    expect(args).toContain('--pid');
    expect(args).toContain('--fork');
    expect(args).toContain('echo hello');
  });

  it('should build unshare args with network namespace', () => {
    const args = buildUnshareArgs('ls', { network: true });
    expect(args).toContain('--net');
  });

  it('should build unshare args with mount namespace', () => {
    const args = buildUnshareArgs('ls', { mount: true, workDir: '/tmp' });
    expect(args).toContain('--mount');
    expect(args).toContain('--mount-proc');
  });

  it('should always include --user flag', () => {
    const args = buildUnshareArgs('echo test');
    expect(args).toContain('--user');
  });

  it('should gracefully handle non-Linux platforms', () => {
    const caps = detectNamespaceSupport();
    if (process.platform !== 'linux') {
      expect(caps.userNamespaces).toBe(false);
      expect(caps.unshareAvailable).toBe(false);
    }
  });

  it('should build unshare args with mount but no workDir (no --mount-proc)', () => {
    const args = buildUnshareArgs('ls', { mount: true });
    expect(args).toContain('--mount');
    expect(args).not.toContain('--mount-proc');
  });

  it('should build basic args with no options', () => {
    const args = buildUnshareArgs('date');
    expect(args).toEqual(['--user', '--', 'date']);
  });
});

describe('NamespaceError', () => {
  it('has correct name, message, and code', () => {
    const err = new NamespaceError('test message', 'TEST_CODE');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('NamespaceError');
    expect(err.message).toBe('test message');
    expect(err.code).toBe('TEST_CODE');
  });
});

describe('isCommandAvailable — whitelist (Phase 103)', () => {
  it('returns false for non-whitelisted command', () => {
    expect(isCommandAvailable('curl')).toBe(false);
    expect(isCommandAvailable('wget')).toBe(false);
  });

  it('returns false for command with shell metacharacters', () => {
    expect(isCommandAvailable('unshare; rm -rf /')).toBe(false);
    expect(isCommandAvailable('bwrap && cat /etc/passwd')).toBe(false);
  });

  it('allows whitelisted commands (result depends on system)', () => {
    // On any system, whitelisted commands either succeed or fail
    // based on presence, but must not throw
    const result = isCommandAvailable('unshare');
    expect(typeof result).toBe('boolean');
  });
});

describe('runInNamespace', () => {
  it('throws NamespaceError when system does not support namespaces', () => {
    const caps = detectNamespaceSupport();
    if (!caps.unshareAvailable || !caps.userNamespaces) {
      // Can't run namespaces — expect error
      expect(() => runInNamespace('echo test')).toThrow(NamespaceError);
    } else {
      // System supports namespaces — command may still fail inside the
      // namespace (e.g. unshare can't locate the binary). Either way the
      // function should only throw NamespaceError.
      try {
        runInNamespace('echo test');
      } catch (err) {
        expect(err).toBeInstanceOf(NamespaceError);
      }
    }
  });
});
