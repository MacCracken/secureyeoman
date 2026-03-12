/**
 * Mood Engine — Affect system layered on personality traits.
 *
 * Uses Russell's circumplex model of affect to map (valence, arousal) to
 * discrete mood labels. Mood decays exponentially toward personality-derived
 * baselines.
 */

import type { MoodState, MoodLabel, MoodEventCreate, MoodEvent } from '@secureyeoman/shared';
import type { SimulationStore } from './simulation-store.js';
import type { SecureLogger } from '../logging/logger.js';
import { uuidv7 } from '../utils/crypto.js';

// ── Trait → baseline modifiers ────────────────────────────────────────

export const TRAIT_MOOD_MODIFIERS: Record<string, { valence: number; arousal: number }> = {
  cheerful: { valence: 0.3, arousal: 0.2 },
  serious: { valence: -0.1, arousal: -0.1 },
  energetic: { valence: 0.1, arousal: 0.4 },
  calm: { valence: 0.1, arousal: -0.3 },
  empathetic: { valence: 0.2, arousal: 0.0 },
  analytical: { valence: 0.0, arousal: -0.2 },
  playful: { valence: 0.3, arousal: 0.3 },
  reserved: { valence: -0.05, arousal: -0.2 },
  passionate: { valence: 0.15, arousal: 0.35 },
  stoic: { valence: 0.0, arousal: -0.3 },
  anxious: { valence: -0.2, arousal: 0.3 },
  confident: { valence: 0.15, arousal: 0.1 },
};

export interface MoodEngineOpts {
  store: SimulationStore;
  logger: SecureLogger;
}

export class MoodEngine {
  private store: SimulationStore;
  private logger: SecureLogger;

  constructor(opts: MoodEngineOpts) {
    this.store = opts.store;
    this.logger = opts.logger;
  }

  /**
   * Initialize mood for a personality, deriving baseline from traits.
   */
  async initializeMood(personalityId: string, traits: Record<string, string>): Promise<MoodState> {
    const { valence: baseV, arousal: baseA } = this.deriveBaseline(traits);
    const now = Date.now();
    const state: MoodState = {
      id: uuidv7(),
      personalityId,
      valence: baseV,
      arousal: baseA,
      dominance: 0.5,
      label: getMoodLabel(baseV, baseA),
      decayRate: 0.05,
      baselineValence: baseV,
      baselineArousal: baseA,
      updatedAt: now,
    };
    await this.store.upsertMoodState(state);
    this.logger.info({ personalityId, label: state.label }, 'mood initialized');
    return state;
  }

  /**
   * Apply a mood-influencing event. Records the event and updates state.
   */
  async applyEvent(personalityId: string, input: MoodEventCreate): Promise<MoodState> {
    let state = await this.store.getMoodState(personalityId);
    if (!state) {
      state = await this.initializeMood(personalityId, {});
    }

    const now = Date.now();
    const event: MoodEvent = {
      id: uuidv7(),
      personalityId,
      eventType: input.eventType,
      valenceDelta: input.valenceDelta,
      arousalDelta: input.arousalDelta,
      source: input.source,
      metadata: input.metadata,
      createdAt: now,
    };
    await this.store.recordMoodEvent(event);

    const newValence = clamp(state.valence + input.valenceDelta, -1, 1);
    const newArousal = clamp(state.arousal + input.arousalDelta, 0, 1);
    const label = getMoodLabel(newValence, newArousal);

    await this.store.updateMoodValues(personalityId, newValence, newArousal, label);

    const updated: MoodState = {
      ...state,
      valence: newValence,
      arousal: newArousal,
      label,
      updatedAt: now,
    };
    return updated;
  }

  /**
   * Decay mood toward baseline by one step. Called per tick.
   */
  async decayMood(personalityId: string): Promise<MoodState | null> {
    const state = await this.store.getMoodState(personalityId);
    if (!state) return null;

    const rate = state.decayRate;
    const newValence = state.valence + (state.baselineValence - state.valence) * rate;
    const newArousal = state.arousal + (state.baselineArousal - state.arousal) * rate;
    const label = getMoodLabel(newValence, clamp(newArousal, 0, 1));

    await this.store.updateMoodValues(
      personalityId,
      clamp(newValence, -1, 1),
      clamp(newArousal, 0, 1),
      label
    );

    return {
      ...state,
      valence: clamp(newValence, -1, 1),
      arousal: clamp(newArousal, 0, 1),
      label,
      updatedAt: Date.now(),
    };
  }

  async getMood(personalityId: string): Promise<MoodState | null> {
    return this.store.getMoodState(personalityId);
  }

  /**
   * Compose a system prompt fragment reflecting current mood.
   */
  composeMoodPromptFragment(mood: MoodState): string {
    const lines = [
      '## Current Emotional State',
      `You are currently feeling **${mood.label}** (valence: ${mood.valence.toFixed(2)}, arousal: ${mood.arousal.toFixed(2)}).`,
    ];

    const toneGuide = MOOD_TONE_GUIDES[mood.label];
    if (toneGuide) {
      lines.push(`Modulate your tone accordingly: ${toneGuide}`);
    }

    return lines.join('\n');
  }

  /**
   * Derive baseline valence/arousal from personality trait keys.
   */
  deriveBaseline(traits: Record<string, string>): { valence: number; arousal: number } {
    const traitKeys = Object.keys(traits).map((k) => k.toLowerCase());
    let totalV = 0;
    let totalA = 0;
    let count = 0;

    for (const key of traitKeys) {
      const mod = TRAIT_MOOD_MODIFIERS[key];
      if (mod) {
        totalV += mod.valence;
        totalA += mod.arousal;
        count++;
      }
    }

    if (count === 0) return { valence: 0, arousal: 0 };
    return {
      valence: clamp(totalV / count, -1, 1),
      arousal: clamp(totalA / count, 0, 1),
    };
  }
}

// ── Russell's circumplex mood label mapping ──────────────────────────

const MOOD_THRESHOLD = 0.15;

export function getMoodLabel(valence: number, arousal: number): MoodLabel {
  if (valence > 0.6 && arousal > 0.6) return 'ecstatic';
  if (valence > MOOD_THRESHOLD && arousal > 0.5) return 'excited';
  if (valence > 0.3 && arousal <= 0.5) return 'happy';
  if (valence > MOOD_THRESHOLD && arousal <= 0.3) return 'content';
  if (valence >= -MOOD_THRESHOLD && arousal <= 0.25) return 'calm';
  if (valence < -MOOD_THRESHOLD && arousal > 0.5) return 'angry';
  if (valence < -0.3 && arousal > 0.3) return 'anxious';
  if (valence < -0.3 && arousal <= 0.3) return 'sad';
  if (valence < -MOOD_THRESHOLD && arousal <= 0.3) return 'melancholy';
  return 'neutral';
}

const MOOD_TONE_GUIDES: Record<MoodLabel, string> = {
  ecstatic: 'Speak with enthusiasm and unbridled joy. Be effusive and celebratory.',
  excited: 'Communicate with energy and eagerness. Be animated and forward-leaning.',
  happy: 'Maintain a warm, positive tone. Be encouraging and optimistic.',
  content: 'Be relaxed and satisfied. Communicate with gentle warmth.',
  calm: 'Speak with measured tranquility. Be steady and reassuring.',
  neutral: 'Maintain a balanced, even tone. Be professional and clear.',
  melancholy: 'Allow a subtle wistfulness. Be reflective and gently subdued.',
  sad: 'Show empathy and vulnerability. Communicate with quiet sincerity.',
  angry: 'Be direct and forceful. Show controlled intensity without hostility.',
  anxious: 'Communicate with cautious awareness. Be thorough and detail-oriented.',
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
