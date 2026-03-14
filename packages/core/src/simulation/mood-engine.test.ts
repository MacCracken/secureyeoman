import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MoodEngine,
  getMoodLabel,
  TRAIT_MOOD_MODIFIERS,
  TRAIT_VALUE_MODIFIERS,
  COMPOUND_EFFECTS,
  getActiveCompoundEffects,
} from './mood-engine.js';
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

    it('derives baseline from standard traits (15-trait system)', async () => {
      const mood = await engine.initializeMood('p-1', {
        warmth: 'effusive',
        confidence: 'assertive',
      });
      expect(mood.baselineValence).toBeGreaterThan(0);
      expect(mood.baselineArousal).toBeGreaterThan(0);
    });

    it('derives baseline from legacy free-form traits', async () => {
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

    it('uses provided traits for initialization fallback', async () => {
      (store.getMoodState as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await engine.applyEvent(
        'p-1',
        { eventType: 'test', valenceDelta: 0, arousalDelta: 0, source: 'test', metadata: {} },
        { warmth: 'effusive', confidence: 'assertive' }
      );

      // Should have initialized with the provided traits (non-zero baseline)
      const upsertCall = (store.upsertMoodState as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(upsertCall.baselineValence).toBeGreaterThan(0);
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
      expect(result!.valence).toBeCloseTo(0.72, 5);
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
    it('returns zero for empty traits', () => {
      const result = engine.deriveBaseline({});
      expect(result.valence).toBe(0);
      expect(result.arousal).toBe(0);
    });

    it('returns zero for unknown traits', () => {
      const result = engine.deriveBaseline({ unknown: 'mystery' });
      expect(result.valence).toBe(0);
      expect(result.arousal).toBe(0);
    });

    it('maps standard trait values correctly (warmth: effusive)', () => {
      const result = engine.deriveBaseline({ warmth: 'effusive' });
      const expected = TRAIT_VALUE_MODIFIERS.warmth.effusive;
      expect(result.valence).toBeCloseTo(expected.valence, 5);
      expect(result.arousal).toBeCloseTo(expected.arousal, 5);
    });

    it('maps standard trait values correctly (confidence: authoritative)', () => {
      const result = engine.deriveBaseline({ confidence: 'authoritative' });
      const expected = TRAIT_VALUE_MODIFIERS.confidence.authoritative;
      expect(result.valence).toBeCloseTo(expected.valence, 5);
      expect(result.arousal).toBeCloseTo(expected.arousal, 5);
    });

    it('returns neutral for balanced traits', () => {
      const result = engine.deriveBaseline({
        formality: 'balanced',
        humor: 'balanced',
        warmth: 'balanced',
      });
      expect(result.valence).toBe(0);
      expect(result.arousal).toBe(0);
    });

    it('averages multiple standard traits', () => {
      const result = engine.deriveBaseline({
        warmth: 'effusive',
        confidence: 'humble',
      });
      const warmthMod = TRAIT_VALUE_MODIFIERS.warmth.effusive;
      const confMod = TRAIT_VALUE_MODIFIERS.confidence.humble;
      // Two traits, averaged
      expect(result.valence).toBeCloseTo((warmthMod.valence + confMod.valence) / 2, 5);
    });

    it('falls back to legacy modifiers for free-form trait keys', () => {
      const result = engine.deriveBaseline({ cheerful: 'yes' });
      expect(result.valence).toBeCloseTo(TRAIT_MOOD_MODIFIERS.cheerful.valence, 5);
      expect(result.arousal).toBeCloseTo(TRAIT_MOOD_MODIFIERS.cheerful.arousal, 5);
    });

    it('mixes standard and legacy traits', () => {
      const result = engine.deriveBaseline({
        warmth: 'friendly',
        cheerful: 'yes',
      });
      // Both should contribute
      expect(result.valence).toBeGreaterThan(0);
    });

    it('applies compound effects for matching trait combinations', () => {
      // warmth: friendly + humor: witty → "playful" compound effect
      const withCompound = engine.deriveBaseline({ warmth: 'friendly', humor: 'witty' });
      // Same traits but without matching compound (warmth: balanced + humor: witty)
      const withoutCompound = engine.deriveBaseline({ warmth: 'balanced', humor: 'witty' });
      // Compound should boost valence
      expect(withCompound.valence).toBeGreaterThan(withoutCompound.valence);
    });

    it('handles cold + blunt brusque compound', () => {
      const result = engine.deriveBaseline({ warmth: 'cold', directness: 'blunt' });
      // Should be negative valence (brusque compound + cold + blunt base modifiers)
      expect(result.valence).toBeLessThan(0);
    });

    it('compound effects are additive bonuses, not averaged in', () => {
      // With 2 traits that trigger a compound, the compound should boost the result
      // without diluting the per-trait average (i.e. compound doesn't increase divisor)
      const warmthMod = TRAIT_VALUE_MODIFIERS.warmth.friendly;
      const humorMod = TRAIT_VALUE_MODIFIERS.humor.witty;
      const avgV = (warmthMod.valence + humorMod.valence) / 2;

      const result = engine.deriveBaseline({ warmth: 'friendly', humor: 'witty' });
      // Compound adds +0.1 valence; result should be avgV + 0.1 (not (sum+0.1)/3)
      expect(result.valence).toBeCloseTo(avgV + 0.1, 5);
    });

    it('handles case-insensitive trait keys and values', () => {
      const lower = engine.deriveBaseline({ warmth: 'friendly' });
      const upper = engine.deriveBaseline({ Warmth: 'Friendly' });
      expect(lower.valence).toBeCloseTo(upper.valence, 5);
      expect(lower.arousal).toBeCloseTo(upper.arousal, 5);
    });
  });
});

describe('getActiveCompoundEffects', () => {
  it('returns empty for balanced traits', () => {
    const effects = getActiveCompoundEffects({ warmth: 'balanced', humor: 'balanced' });
    expect(effects).toHaveLength(0);
  });

  it('detects playful compound (friendly + witty)', () => {
    const effects = getActiveCompoundEffects({ warmth: 'friendly', humor: 'witty' });
    expect(effects.some((e) => e.label === 'playful')).toBe(true);
  });

  it('detects nurturing compound (friendly + empathetic)', () => {
    const effects = getActiveCompoundEffects({ warmth: 'effusive', empathy: 'compassionate' });
    expect(effects.some((e) => e.label === 'nurturing')).toBe(true);
  });

  it('detects commanding compound (assertive + candid)', () => {
    const effects = getActiveCompoundEffects({ confidence: 'authoritative', directness: 'blunt' });
    expect(effects.some((e) => e.label === 'commanding')).toBe(true);
  });

  it('does not match partial conditions', () => {
    const effects = getActiveCompoundEffects({ warmth: 'friendly', humor: 'balanced' });
    expect(effects.some((e) => e.label === 'playful')).toBe(false);
  });

  it('handles case-insensitive keys and values', () => {
    const effects = getActiveCompoundEffects({ Warmth: 'Friendly', Humor: 'Witty' });
    expect(effects.some((e) => e.label === 'playful')).toBe(true);
  });
});

describe('TRAIT_VALUE_MODIFIERS', () => {
  it('covers all 15 standard traits', () => {
    const expectedTraits = [
      'formality', 'humor', 'verbosity', 'directness',
      'warmth', 'empathy', 'patience', 'confidence',
      'creativity', 'risk_tolerance', 'curiosity', 'skepticism',
      'autonomy', 'pedagogy', 'precision',
    ];
    for (const trait of expectedTraits) {
      expect(TRAIT_VALUE_MODIFIERS).toHaveProperty(trait);
    }
  });

  it('each trait has exactly 5 levels', () => {
    for (const [trait, levels] of Object.entries(TRAIT_VALUE_MODIFIERS)) {
      expect(Object.keys(levels)).toHaveLength(5);
      expect(levels).toHaveProperty('balanced');
    }
  });

  it('balanced is always neutral (0, 0)', () => {
    for (const [, levels] of Object.entries(TRAIT_VALUE_MODIFIERS)) {
      expect(levels.balanced.valence).toBe(0);
      expect(levels.balanced.arousal).toBe(0);
    }
  });
});

describe('COMPOUND_EFFECTS', () => {
  it('has at least 5 defined compound effects', () => {
    expect(COMPOUND_EFFECTS.length).toBeGreaterThanOrEqual(5);
  });

  it('each effect has conditions, modifier, and label', () => {
    for (const effect of COMPOUND_EFFECTS) {
      expect(effect.conditions).toBeDefined();
      expect(Object.keys(effect.conditions).length).toBeGreaterThanOrEqual(2);
      expect(effect.modifier).toHaveProperty('valence');
      expect(effect.modifier).toHaveProperty('arousal');
      expect(effect.label).toBeTruthy();
    }
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
