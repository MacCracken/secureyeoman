/**
 * Registry Factory — creates the correct ArtifactRegistryAdapter from a ForgeConfig.
 */

import type { ArtifactRegistryAdapter, ForgeConfig, ForgeProvider } from '../types.js';
import { GhcrAdapter } from './ghcr-adapter.js';
import { GitLabRegistryAdapter } from './gitlab-registry-adapter.js';
import { DeltaRegistryAdapter } from './delta-registry-adapter.js';

export function createRegistryAdapter(
  provider: ForgeProvider,
  config: ForgeConfig,
): ArtifactRegistryAdapter | null {
  switch (provider) {
    case 'github':
      return new GhcrAdapter(config);
    case 'gitlab':
      return new GitLabRegistryAdapter(config);
    case 'delta':
      return new DeltaRegistryAdapter(config);
    default:
      return null;
  }
}
