/**
 * Forge Factory — creates the correct CodeForgeAdapter from a ForgeConfig.
 */

import type { CodeForgeAdapter, ForgeConfig } from './types.js';
import { DeltaForgeAdapter } from './delta-forge-adapter.js';
import { GitHubForgeAdapter } from './github-forge-adapter.js';
import { GitLabForgeAdapter } from './gitlab-forge-adapter.js';
import { BitbucketForgeAdapter } from './bitbucket-forge-adapter.js';
import { GiteaForgeAdapter } from './gitea-forge-adapter.js';

export function createForgeAdapter(config: ForgeConfig): CodeForgeAdapter {
  switch (config.provider) {
    case 'delta':
      return new DeltaForgeAdapter(config);
    case 'github':
      return new GitHubForgeAdapter(config);
    case 'gitlab':
      return new GitLabForgeAdapter(config);
    case 'bitbucket':
      return new BitbucketForgeAdapter(config);
    case 'gitea':
      return new GiteaForgeAdapter(config);
    default:
      throw new Error(`Unsupported forge provider: ${config.provider}`);
  }
}
