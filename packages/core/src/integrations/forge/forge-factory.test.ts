import { describe, it, expect } from 'vitest';
import { createForgeAdapter } from './forge-factory.js';
import { DeltaForgeAdapter } from './delta-forge-adapter.js';
import { GitHubForgeAdapter } from './github-forge-adapter.js';
import { GitLabForgeAdapter } from './gitlab-forge-adapter.js';

describe('createForgeAdapter', () => {
  it('creates DeltaForgeAdapter for delta provider', () => {
    const adapter = createForgeAdapter({ provider: 'delta', baseUrl: 'http://localhost:8070' });
    expect(adapter).toBeInstanceOf(DeltaForgeAdapter);
    expect(adapter.provider).toBe('delta');
  });

  it('creates GitHubForgeAdapter for github provider', () => {
    const adapter = createForgeAdapter({ provider: 'github', baseUrl: 'https://github.com' });
    expect(adapter).toBeInstanceOf(GitHubForgeAdapter);
    expect(adapter.provider).toBe('github');
  });

  it('creates GitLabForgeAdapter for gitlab provider', () => {
    const adapter = createForgeAdapter({ provider: 'gitlab', baseUrl: 'https://gitlab.com' });
    expect(adapter).toBeInstanceOf(GitLabForgeAdapter);
    expect(adapter.provider).toBe('gitlab');
  });

  it('throws for unsupported provider', () => {
    expect(() => createForgeAdapter({ provider: 'bitbucket', baseUrl: 'https://bitbucket.org' })).toThrow(
      'Unsupported forge provider: bitbucket'
    );
  });
});
