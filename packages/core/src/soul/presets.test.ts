import { describe, it, expect } from 'vitest';
import { PERSONALITY_PRESETS, getPersonalityPreset } from './presets.js';

describe('PERSONALITY_PRESETS', () => {
  it('contains at least two presets', () => {
    expect(PERSONALITY_PRESETS.length).toBeGreaterThanOrEqual(2);
  });

  it('each preset has required fields', () => {
    for (const preset of PERSONALITY_PRESETS) {
      expect(preset.id).toBeTruthy();
      expect(preset.name).toBeTruthy();
      expect(preset.summary).toBeTruthy();
      expect(preset.data).toBeDefined();
      expect(preset.data.name).toBeTruthy();
      expect(preset.data.systemPrompt).toBeTruthy();
    }
  });

  it('includes friday preset', () => {
    const friday = PERSONALITY_PRESETS.find((p) => p.id === 'friday');
    expect(friday).toBeDefined();
    expect(friday!.name).toBe('FRIDAY');
    expect(friday!.data.includeArchetypes).toBe(true);
  });

  it('includes t-ron preset', () => {
    const tron = PERSONALITY_PRESETS.find((p) => p.id === 't-ron');
    expect(tron).toBeDefined();
    expect(tron!.name).toBe('T.Ron');
  });
});

describe('T.Ron preset', () => {
  const tron = PERSONALITY_PRESETS.find((p) => p.id === 't-ron')!;

  it('has security-focused traits', () => {
    expect(tron.data.traits.vigilance).toBe('maximum');
    expect(tron.data.traits.formality).toBe('strict');
    expect(tron.data.traits.humor).toBe('none');
  });

  it('has terse authoritative voice', () => {
    expect(tron.data.voice).toBe('terse and authoritative');
  });

  it('system prompt covers all four core duties', () => {
    const prompt = tron.data.systemPrompt;
    expect(prompt).toContain('Communications Watchdog');
    expect(prompt).toContain('MCP Guardian');
    expect(prompt).toContain('Rogue-AI Defence');
    expect(prompt).toContain('Minimal Footprint');
  });

  it('enables security proactive builtins', () => {
    const builtins = tron.data.body?.proactiveConfig?.builtins;
    expect(builtins?.integrationHealthAlert).toBe(true);
    expect(builtins?.securityAlertDigest).toBe(true);
  });

  it('disables autonomous learning', () => {
    const learning = tron.data.body?.proactiveConfig?.learning;
    expect(learning?.enabled).toBe(false);
    expect(learning?.minConfidence).toBe(0.9);
  });

  it('is active all 7 days', () => {
    const days = tron.data.body?.activeHours?.daysOfWeek;
    expect(days).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
  });

  it('includes archetypes', () => {
    expect(tron.data.includeArchetypes).toBe(true);
  });
});

describe('getPersonalityPreset', () => {
  it('returns preset by id', () => {
    const preset = getPersonalityPreset('t-ron');
    expect(preset).toBeDefined();
    expect(preset!.name).toBe('T.Ron');
  });

  it('returns undefined for unknown id', () => {
    expect(getPersonalityPreset('does-not-exist')).toBeUndefined();
  });

  it('is case-sensitive', () => {
    expect(getPersonalityPreset('T-RON')).toBeUndefined();
    expect(getPersonalityPreset('FRIDAY')).toBeUndefined();
  });
});
