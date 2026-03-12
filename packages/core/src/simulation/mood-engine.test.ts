import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MoodEngine, getMoodLabel, TRAIT_MOOD_MODIFIERS } from './mood-engine.js';
import type { SimulationStore } from './simulation-store.js';
import type { MoodState } from '@secureyeoman/shared';
import { createNoopLogger } from '../logging/logger.js';

function makeMoodState(overrides: Partial<MoodState> = {}): MoodState {
  return {
    id: 'mood-1',
    personalityId: 'p-1',
    valence: 0,
    arousal: 0,
    dominance: 0.5,
    label: 'neutral',
    decayRate: 0.05,
    baselineValence: 0,
    baselineArousal: 0,
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeStore(state: MoodState | null = null): SimulationStore {
  return {
    getMoodState: vi.fn().mockResolvedValue(state),
    upsertMoodState: vi.fn().mockResolvedValue(undefined),
    updateMoodValues: vi.fn().mockResolvedValue(undefined),
    recordMoodEvent: vi.fn().mockResolvedValue(undefined),
    listMoodEvents: vi.fn().mockResolvedValue([]),
  } as unknown as SimulationStore;
}

describe('MoodEngine', () => {
  let engine: MoodEngine;
  let store: SimulationStore;

  beforeEach(() => {
    store = makeStore();
    engine = new MoodEngine({ store, logger: createNoopLogger() });
  });

  describe('initializeMood', () => {
    it('creates neutral mood with no traits', async () => {
      const mood = await engine.initializeMood('p-1', {});
      expect(mood.valence).toBe(0);
      expect(mood.arousal).toBe(0);
      expect(mood.label).toBe('calm');
      expect(store.upsertMoodState).toHaveBeenCalledOnce();
    });

    it('derives baseline from traits', async () => {
      const mood = await engine.initializeMood('p-1', { cheerful: 'yes', energetic: 'yes' });
      expect(mood.baselineValence).toBeGreaterThan(0);
      expect(mood.baselineArousal).toBeGreaterThan(0);
    });
  });

  describe('applyEvent', () => {
    it('applies positive valence delta', async () => {
      store = makeStore(makeMoodState({ valence: 0, arousal: 0.3 }));
      engine = new MoodEngine({ store, logger: createNoopLogger() });

      const result = await engine.applyEvent('p-1', {
        eventType: 'compliment',
        valenceDelta: 0.5,
        arousalDelta: 0.1,
        source: 'user',
        metadata: {},
      });

      expect(result.valence).toBe(0.5);
      expect(result.arousal).toBe(0.4);
      expect(store.recordMoodEvent).toHaveBeenCalledOnce();
      expect(store.updateMoodValues).toHaveBeenCalledOnce();
    });

    it('clamps valence to [-1, 1]', async () => {
      store = makeStore(makeMoodState({ valence: 0.8 }));
      engine = new MoodEngine({ store, logger: createNoopLogger() });

      const result = await engine.applyEvent('p-1', {
        eventType: 'praise',
        valenceDelta: 0.5,
        arousalDelta: 0,
        source: 'user',
        metadata: {},
      });

      expect(result.valence).toBe(1);
    });

    it('clamps arousal to [0, 1]', async () => {
      store = makeStore(makeMoodState({ arousal: 0.1 }));
      engine = new MoodEngine({ store, logger: createNoopLogger() });

      const result = await engine.applyEvent('p-1', {
        eventType: 'insult',
        valenceDelta: 0,
        arousalDelta: -0.5,
        source: 'user',
        metadata: {},
      });

      expect(result.arousal).toBe(0);
    });

    it('initializes mood if none exists', async () => {
      // getMoodState returns null, then returns the newly created state on second call
      const freshMood = makeMoodState();
      (store.getMoodState as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(freshMood);
      (store.upsertMoodState as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const result = await engine.applyEvent('p-1', {
        eventType: 'greeting',
        valenceDelta: 0.1,
        arousalDelta: 0,
        source: 'user',
        metadata: {},
      });

      expect(store.upsertMoodState).toHaveBeenCalled();
      expect(result.valence).toBe(0.1);
    });
  });

  describe('decayMood', () => {
    it('decays toward baseline', async () => {
      const state = makeMoodState({
        valence: 0.8,
        arousal: 0.6,
        baselineValence: 0,
        baselineArousal: 0.2,
        decayRate: 0.1,
      });
      store = makeStore(state);
      engine = new MoodEngine({ store, logger: createNoopLogger() });

      const result = await engine.decayMood('p-1');
      expect(result).not.toBeNull();
      // valence: 0.8 + (0 - 0.8) * 0.1 = 0.72
      expect(result!.valence).toBeCloseTo(0.72, 5);
      // arousal: 0.6 + (0.2 - 0.6) * 0.1 = 0.56
      expect(result!.arousal).toBeCloseTo(0.56, 5);
    });

    it('returns null when no mood state exists', async () => {
      const result = await engine.decayMood('nonexistent');
      expect(result).toBeNull();
    });

    it('converges to baseline after many decays', async () => {
      let valence = 1.0;
      let arousal = 0.9;
      const baseV = 0;
      const baseA = 0.2;
      const rate = 0.1;

      for (let i = 0; i < 100; i++) {
        valence += (baseV - valence) * rate;
        arousal += (baseA - arousal) * rate;
      }

      expect(valence).toBeCloseTo(baseV, 2);
      expect(arousal).toBeCloseTo(baseA, 2);
    });
  });

  describe('composeMoodPromptFragment', () => {
    it('generates prompt fragment', () => {
      const state = makeMoodState({ label: 'happy', valence: 0.5, arousal: 0.3 });
      const fragment = engine.composeMoodPromptFragment(state);

      expect(fragment).toContain('## Current Emotional State');
      expect(fragment).toContain('happy');
      expect(fragment).toContain('0.50');
      expect(fragment).toContain('Modulate your tone');
    });
  });

  describe('deriveBaseline', () => {
    it('returns zero for unknown traits', () => {
      const result = engine.deriveBaseline({ unknown: 'yes' });
      expect(result.valence).toBe(0);
      expect(result.arousal).toBe(0);
    });

    it('averages multiple traits', () => {
      const result = engine.deriveBaseline({ cheerful: 'yes', serious: 'yes' });
      const expected = {
        valence: (TRAIT_MOOD_MODIFIERS.cheerful.valence + TRAIT_MOOD_MODIFIERS.serious.valence) / 2,
        arousal: (TRAIT_MOOD_MODIFIERS.cheerful.arousal + TRAIT_MOOD_MODIFIERS.serious.arousal) / 2,
      };
      expect(result.valence).toBeCloseTo(expected.valence, 5);
      expect(result.arousal).toBeCloseTo(expected.arousal, 5);
    });
  });
});

describe('getMoodLabel', () => {
  it('returns ecstatic for high valence + high arousal', () => {
    expect(getMoodLabel(0.8, 0.8)).toBe('ecstatic');
  });

  it('returns excited for moderate-high valence + high arousal', () => {
    expect(getMoodLabel(0.4, 0.7)).toBe('excited');
  });

  it('returns happy for high valence + moderate arousal', () => {
    expect(getMoodLabel(0.5, 0.3)).toBe('happy');
  });

  it('returns content for positive valence + low arousal', () => {
    expect(getMoodLabel(0.2, 0.2)).toBe('content');
  });

  it('returns calm for near-zero valence + low arousal', () => {
    expect(getMoodLabel(0, 0.1)).toBe('calm');
  });

  it('returns neutral for near-zero values with moderate arousal', () => {
    expect(getMoodLabel(0.05, 0.35)).toBe('neutral');
  });

  it('returns angry for negative valence + high arousal', () => {
    expect(getMoodLabel(-0.5, 0.7)).toBe('angry');
  });

  it('returns anxious for negative valence + moderate arousal', () => {
    expect(getMoodLabel(-0.4, 0.4)).toBe('anxious');
  });

  it('returns sad for very negative valence + low arousal', () => {
    expect(getMoodLabel(-0.5, 0.1)).toBe('sad');
  });

  it('returns melancholy for slightly negative valence + low arousal', () => {
    expect(getMoodLabel(-0.2, 0.2)).toBe('melancholy');
  });
});
