/**
 * Forge Factory — creates the correct CodeForgeAdapter from a ForgeConfig.
 */

import type { CodeForgeAdapter, ForgeConfig } from './types.js';
import { DeltaForgeAdapter } from './delta-forge-adapter.js';
import { GitHubForgeAdapter } from './github-forge-adapter.js';
import { GitLabForgeAdapter } from './gitlab-forge-adapter.js';

export function createForgeAdapter(config: ForgeConfig): CodeForgeAdapter {
  switch (config.provider) {
    case 'delta':
      return new DeltaForgeAdapter(config);
    case 'github':
      return new GitHubForgeAdapter(config);
    case 'gitlab':
      return new GitLabForgeAdapter(config);
    default:
      throw new Error(`Unsupported forge provider: ${config.provider}`);
  }
}
