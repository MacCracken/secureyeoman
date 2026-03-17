import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  findModelsWithinVram,
  findLocalModelsWithCapabilities,
  _resetLocalModelCache,
} from './local-model-registry.js';
import type { LocalModel } from './local-model-registry.js';

function makeModel(overrides: Partial<LocalModel> = {}): LocalModel {
  return {
    name: 'test-model',
    provider: 'ollama',
    sizeBytes: 0,
    estimatedVramMb: 6000,
    lastSeen: new Date().toISOString(),
    capabilities: ['chat', 'streaming'],
    tier: 'fast',
    family: 'llama',
    parameterCount: '8b',
    ...overrides,
  };
}

describe('local-model-registry', () => {
  beforeEach(() => {
    _resetLocalModelCache();
    vi.resetAllMocks();
  });

  describe('findModelsWithinVram', () => {
    it('filters models that exceed available VRAM', () => {
      const models = [
        makeModel({ name: 'small', estimatedVramMb: 3000 }),
        makeModel({ name: 'medium', estimatedVramMb: 8000 }),
        makeModel({ name: 'large', estimatedVramMb: 40000 }),
      ];
      const result = findModelsWithinVram(models, 10000);
      expect(result).toHaveLength(2);
      expect(result[0]!.name).toBe('medium'); // largest first
      expect(result[1]!.name).toBe('small');
    });

    it('returns empty when no models fit', () => {
      const models = [makeModel({ estimatedVramMb: 20000 })];
      expect(findModelsWithinVram(models, 5000)).toHaveLength(0);
    });

    it('returns all models when VRAM is sufficient', () => {
      const models = [
        makeModel({ name: 'a', estimatedVramMb: 3000 }),
        makeModel({ name: 'b', estimatedVramMb: 5000 }),
      ];
      expect(findModelsWithinVram(models, 100000)).toHaveLength(2);
    });

    it('sorts by descending VRAM (best quality first)', () => {
      const models = [
        makeModel({ name: 'small', estimatedVramMb: 2000 }),
        makeModel({ name: 'big', estimatedVramMb: 8000 }),
        makeModel({ name: 'mid', estimatedVramMb: 5000 }),
      ];
      const result = findModelsWithinVram(models, 10000);
      expect(result.map((m) => m.name)).toEqual(['big', 'mid', 'small']);
    });
  });

  describe('findLocalModelsWithCapabilities', () => {
    it('filters models by required capabilities', () => {
      const models = [
        makeModel({ name: 'chat-only', capabilities: ['chat', 'streaming'] }),
        makeModel({ name: 'coder', capabilities: ['chat', 'streaming', 'code'] }),
        makeModel({ name: 'vision', capabilities: ['chat', 'streaming', 'vision'] }),
      ];
      const result = findLocalModelsWithCapabilities(models, ['code']);
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('coder');
    });

    it('returns all models when no capabilities required', () => {
      const models = [makeModel(), makeModel()];
      expect(findLocalModelsWithCapabilities(models, [])).toHaveLength(2);
    });

    it('filters by multiple capabilities', () => {
      const models = [
        makeModel({ name: 'full', capabilities: ['chat', 'code', 'vision', 'streaming'] }),
        makeModel({ name: 'partial', capabilities: ['chat', 'code', 'streaming'] }),
      ];
      const result = findLocalModelsWithCapabilities(models, ['code', 'vision']);
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('full');
    });
  });

  describe('refreshLocalModels', () => {
    it('returns empty state when no providers available', async () => {
      // Mock fetch to fail for all providers
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

      const { refreshLocalModels } = await import('./local-model-registry.js');
      _resetLocalModelCache();
      const state = await refreshLocalModels(true);

      expect(state.models).toHaveLength(0);
      expect(state.ollamaAvailable).toBe(false);
      expect(state.lmstudioAvailable).toBe(false);
      expect(state.localaiAvailable).toBe(false);
      expect(state.lastRefreshed).toBeDefined();

      global.fetch = originalFetch;
    });

    it('detects Ollama models', async () => {
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('11434')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              models: [
                { name: 'llama3.1:8b', size: 4_500_000_000 },
                { name: 'codellama:7b', size: 3_800_000_000 },
              ],
            }),
          });
        }
        return Promise.reject(new Error('Connection refused'));
      });

      const { refreshLocalModels } = await import('./local-model-registry.js');
      _resetLocalModelCache();
      const state = await refreshLocalModels(true);

      expect(state.ollamaAvailable).toBe(true);
      expect(state.models).toHaveLength(2);
      expect(state.models[0]!.provider).toBe('ollama');
      expect(state.models[0]!.name).toBe('llama3.1:8b');
      expect(state.models[1]!.capabilities).toContain('code');

      global.fetch = originalFetch;
    });

    it('caches results within TTL', async () => {
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockRejectedValue(new Error('refused'));

      const { refreshLocalModels } = await import('./local-model-registry.js');
      _resetLocalModelCache();

      const first = await refreshLocalModels(true);
      const second = await refreshLocalModels(false);
      expect(first).toBe(second);

      global.fetch = originalFetch;
    });
  });
});
