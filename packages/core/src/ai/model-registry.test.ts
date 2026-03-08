import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseModelString,
  getModelEntry,
  getModelsForProvider,
  getContextWindow,
  hasCapability,
  findModelsWithCapabilities,
  getModelTier,
  resolveProvider,
  getAllModels,
  _resetIndexes,
} from './model-registry.js';

describe('ModelRegistry', () => {
  beforeEach(() => {
    _resetIndexes();
  });

  describe('getModelEntry', () => {
    it('returns entry for known model', () => {
      const entry = getModelEntry('gpt-4o');
      expect(entry).toBeDefined();
      expect(entry!.provider).toBe('openai');
      expect(entry!.contextWindow).toBe(128_000);
      expect(entry!.tier).toBe('capable');
    });

    it('returns undefined for unknown model', () => {
      expect(getModelEntry('unknown-model-xyz')).toBeUndefined();
    });
  });

  describe('parseModelString', () => {
    it('parses bare model name with registry lookup', () => {
      const result = parseModelString('gpt-4o');
      expect(result).toEqual({ provider: 'openai', model: 'gpt-4o' });
    });

    it('parses "provider/model" format', () => {
      const result = parseModelString('anthropic/claude-custom');
      expect(result).toEqual({ provider: 'anthropic', model: 'claude-custom' });
    });

    it('handles Letta provider/model format as direct registry match', () => {
      const result = parseModelString('openai/gpt-4o');
      expect(result.provider).toBe('letta');
      expect(result.model).toBe('openai/gpt-4o');
    });

    it('returns null provider for unknown bare model', () => {
      const result = parseModelString('completely-unknown');
      expect(result).toEqual({ provider: null, model: 'completely-unknown' });
    });

    it('splits unknown provider/model correctly', () => {
      const result = parseModelString('openai/some-new-model');
      expect(result).toEqual({ provider: 'openai', model: 'some-new-model' });
    });
  });

  describe('getModelsForProvider', () => {
    it('returns all Anthropic models', () => {
      const models = getModelsForProvider('anthropic');
      expect(models.length).toBeGreaterThanOrEqual(3);
      expect(models.every((m) => m.provider === 'anthropic')).toBe(true);
    });

    it('returns empty array for providers with no static entries', () => {
      const models = getModelsForProvider('agnos');
      expect(models).toEqual([]);
    });
  });

  describe('getContextWindow', () => {
    it('returns correct context window for known model', () => {
      expect(getContextWindow('claude-opus-4-20250514')).toBe(200_000);
      expect(getContextWindow('gemini-2.0-flash')).toBe(1_048_576);
    });

    it('returns 128k default for unknown model', () => {
      expect(getContextWindow('unknown-model')).toBe(128_000);
    });
  });

  describe('hasCapability', () => {
    it('checks vision capability', () => {
      expect(hasCapability('gpt-4o', 'vision')).toBe(true);
      expect(hasCapability('o1', 'vision')).toBe(false);
    });

    it('returns true for unknown models (assume capable)', () => {
      expect(hasCapability('unknown-model', 'vision')).toBe(true);
    });
  });

  describe('findModelsWithCapabilities', () => {
    it('finds vision+reasoning models', () => {
      const models = findModelsWithCapabilities(['vision', 'reasoning']);
      expect(models.length).toBeGreaterThan(0);
      expect(models.every((m) => m.capabilities.includes('vision'))).toBe(true);
      expect(models.every((m) => m.capabilities.includes('reasoning'))).toBe(true);
    });

    it('filters by provider', () => {
      const models = findModelsWithCapabilities(['chat'], { provider: 'openai' });
      expect(models.every((m) => m.provider === 'openai')).toBe(true);
    });

    it('filters by tier', () => {
      const models = findModelsWithCapabilities(['chat'], { tier: 'fast' });
      expect(models.every((m) => m.tier === 'fast')).toBe(true);
    });
  });

  describe('getModelTier', () => {
    it('returns tier from registry', () => {
      expect(getModelTier('gpt-4o')).toBe('capable');
      expect(getModelTier('gpt-4o-mini')).toBe('fast');
      expect(getModelTier('claude-opus-4-20250514')).toBe('premium');
    });

    it('returns fast for local providers', () => {
      expect(getModelTier('any-model', 'ollama')).toBe('fast');
      expect(getModelTier('any-model', 'lmstudio')).toBe('fast');
    });

    it('defaults to capable for unknown models', () => {
      expect(getModelTier('unknown-model')).toBe('capable');
    });
  });

  describe('resolveProvider', () => {
    it('resolves known models', () => {
      expect(resolveProvider('gpt-4o')).toBe('openai');
      expect(resolveProvider('claude-opus-4-20250514')).toBe('anthropic');
      expect(resolveProvider('deepseek-chat')).toBe('deepseek');
    });

    it('returns null for unknown models', () => {
      expect(resolveProvider('unknown')).toBeNull();
    });
  });

  describe('getAllModels', () => {
    it('returns all registered models', () => {
      const all = getAllModels();
      expect(all.length).toBeGreaterThan(20);
      // Every entry has required fields
      for (const entry of all) {
        expect(entry.model).toBeTruthy();
        expect(entry.provider).toBeTruthy();
        expect(entry.contextWindow).toBeGreaterThan(0);
        expect(entry.capabilities.length).toBeGreaterThan(0);
        expect(['fast', 'capable', 'premium']).toContain(entry.tier);
        expect(['free', 'low', 'medium', 'high']).toContain(entry.costTier);
      }
    });
  });
});
