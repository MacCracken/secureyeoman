import { describe, it, expect, vi } from 'vitest';
import { validateGitUrl } from './git-fetch.js';

describe('validateGitUrl', () => {
  it('accepts https:// URLs', () => {
    expect(() => validateGitUrl('https://github.com/user/repo.git')).not.toThrow();
  });

  it('accepts file:// URLs', () => {
    expect(() => validateGitUrl('file:///tmp/local-repo')).not.toThrow();
  });

  it('rejects http:// URLs', () => {
    expect(() => validateGitUrl('http://github.com/user/repo.git')).toThrow('protocol not allowed');
  });

  it('rejects git:// URLs', () => {
    expect(() => validateGitUrl('git://github.com/user/repo.git')).toThrow('protocol not allowed');
  });

  it('rejects ssh:// URLs', () => {
    expect(() => validateGitUrl('ssh://git@github.com/user/repo.git')).toThrow(
      'protocol not allowed'
    );
  });

  it('rejects invalid URLs', () => {
    expect(() => validateGitUrl('not-a-url')).toThrow('Invalid git URL');
  });

  it('rejects empty string', () => {
    expect(() => validateGitUrl('')).toThrow('Invalid git URL');
  });
});
